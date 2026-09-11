import {
  assertLocalStateWriteAllowed,
  encryptAccessToken,
  getActiveConnectionStore,
  getSafeActiveInstagramConnectionStatus,
  randomOpaqueToken,
  storeActiveInstagramConnection,
  type ActiveConnectionEnv,
  type FacebookSelectionRecord,
  type StoredActiveInstagramConnection,
} from "./active-instagram-connection.js";
import {
  buildFacebookAuthorizationUrl,
  buildInstagramAuthorizationUrl,
  discoverFacebookInstagramAccounts,
  exchangeFacebookAuthorizationCode,
  exchangeFacebookLongLivedToken,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  fetchInstagramIdentity,
  getFacebookOAuthSettings,
  getInstagramOAuthSettings,
  type InstagramOAuthEnv,
} from "./instagram-oauth.js";

export interface InstagramOAuthControllerEnv extends ActiveConnectionEnv, InstagramOAuthEnv {
  AUTH_TOKEN?: string;
  ACTIVE_CONNECTION_SUCCESS_REDIRECT_URI?: string;
}

function responseHeaders(corsHeaders: Record<string, string>, contentType = "application/json"): Record<string, string> {
  return {
    ...corsHeaders,
    "Content-Type": contentType,
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  };
}

function json(data: unknown, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(corsHeaders),
  });
}

function html(content: string, status: number, corsHeaders: Record<string, string>): Response {
  return new Response(content, {
    status,
    headers: responseHeaders(corsHeaders, "text/html; charset=utf-8"),
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function hasRequiredAdminBearer(request: Request, env: InstagramOAuthControllerEnv): boolean {
  if (!env.AUTH_TOKEN?.trim()) return false;
  const auth = request.headers.get("Authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token.length > 0 && token === env.AUTH_TOKEN.trim();
}

function requireAdminBearer(request: Request, env: InstagramOAuthControllerEnv, corsHeaders: Record<string, string>): Response | null {
  if (!env.AUTH_TOKEN?.trim()) {
    return json({ error: "oauth_admin_auth_not_configured" }, 503, corsHeaders);
  }
  if (!hasRequiredAdminBearer(request, env)) {
    return json({ error: "unauthorized" }, 401, corsHeaders);
  }
  return null;
}

function requireLocalWrite(env: InstagramOAuthControllerEnv, corsHeaders: Record<string, string>): Response | null {
  try {
    assertLocalStateWriteAllowed(env);
    return null;
  } catch {
    return json({ error: "local_state_write_disabled" }, 403, corsHeaders);
  }
}

function tokenExpiry(expiresIn?: number): number | undefined {
  return expiresIn && expiresIn > 0 ? Date.now() + expiresIn * 1000 : undefined;
}

function successResponse(
  env: InstagramOAuthControllerEnv,
  corsHeaders: Record<string, string>,
  loginMode: "instagram-login" | "facebook-login",
  username?: string
): Response {
  if (env.ACTIVE_CONNECTION_SUCCESS_REDIRECT_URI) {
    try {
      const destination = new URL(env.ACTIVE_CONNECTION_SUCCESS_REDIRECT_URI);
      const isLocal = destination.hostname === "localhost" || destination.hostname === "127.0.0.1";
      if (destination.protocol === "https:" || (isLocal && destination.protocol === "http:")) {
        destination.searchParams.set("instagram_connected", "1");
        destination.searchParams.set("login_mode", loginMode);
        if (username) destination.searchParams.set("username", username);
        return Response.redirect(destination.toString(), 302);
      }
    } catch {
      // Fall through to the local success page. Never redirect to an invalid URL.
    }
  }

  return html(
    `<!doctype html><html><head><meta charset="utf-8"><title>Instagram conectado</title></head><body>` +
      `<main><h1>Instagram conectado</h1><p>Conta ativa: <strong>${escapeHtml(username ? `@${username}` : "conta profissional")}</strong></p>` +
      `<p>Modo: ${escapeHtml(loginMode)}</p><p>Você já pode fechar esta janela e usar o MCP.</p></main></body></html>`,
    200,
    corsHeaders
  );
}

function renderFacebookSelection(
  selectionId: string,
  candidates: Array<{ pageId: string; pageName: string; instagramUsername?: string }>,
  corsHeaders: Record<string, string>
): Response {
  const cards = candidates
    .map(
      (candidate) =>
        `<form method="post" action="/auth/facebook/select" style="margin:16px 0;padding:16px;border:1px solid #ddd;border-radius:8px">` +
        `<input type="hidden" name="selection_id" value="${escapeHtml(selectionId)}">` +
        `<input type="hidden" name="page_id" value="${escapeHtml(candidate.pageId)}">` +
        `<strong>${escapeHtml(candidate.instagramUsername ? `@${candidate.instagramUsername}` : candidate.pageName)}</strong>` +
        `<div>${escapeHtml(candidate.pageName)}</div><button type="submit" style="margin-top:8px">Usar esta conta</button></form>`
    )
    .join("");

  return html(
    `<!doctype html><html><head><meta charset="utf-8"><title>Escolher Instagram</title></head><body><main>` +
      `<h1>Escolha a conta do Instagram</h1><p>Seu login do Facebook administra mais de uma conta profissional elegível.</p>${cards}` +
      `</main></body></html>`,
    200,
    corsHeaders
  );
}

function safeOAuthFailure(error: unknown, corsHeaders: Record<string, string>): Response {
  const message = error instanceof Error ? error.message : "";
  let reason = "provider_error";
  if (message.includes("state") || message.includes("selection")) reason = "oauth_state_error";
  if (message.includes("not configured") || message.includes("must use HTTPS") || message.includes("32 characters")) {
    reason = "configuration_error";
  }
  console.error(`[instagram-oauth] ${reason}: ${message || "unknown error"}`);
  return json({ error: "oauth_connection_failed", reason }, 400, corsHeaders);
}

export async function handleInstagramOAuthRequest(
  request: Request,
  env: InstagramOAuthControllerEnv,
  corsHeaders: Record<string, string>
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  if (!path.startsWith("/auth/")) return null;

  if ((path === "/auth/status" || path === "/auth/instagram/status") && request.method === "GET") {
    const denied = requireAdminBearer(request, env, corsHeaders);
    if (denied) return denied;
    const status = await getSafeActiveInstagramConnectionStatus(env);
    return json(status, 200, corsHeaders);
  }

  if ((path === "/auth/disconnect" || path === "/auth/instagram/disconnect") && request.method === "POST") {
    const denied = requireAdminBearer(request, env, corsHeaders);
    if (denied) return denied;
    const writeDenied = requireLocalWrite(env, corsHeaders);
    if (writeDenied) return writeDenied;
    const store = getActiveConnectionStore(env);
    if (!store) return json({ error: "active_connection_store_not_configured" }, 503, corsHeaders);
    const removed = await store.clearConnection();
    const status = await getSafeActiveInstagramConnectionStatus(env);
    return json({ removed, active_connection: status }, 200, corsHeaders);
  }

  if (path === "/auth/instagram/start" && request.method === "GET") {
    const denied = requireAdminBearer(request, env, corsHeaders);
    if (denied) return denied;
    const writeDenied = requireLocalWrite(env, corsHeaders);
    if (writeDenied) return writeDenied;
    try {
      getInstagramOAuthSettings(env);
      const store = getActiveConnectionStore(env);
      if (!store) return json({ error: "active_connection_store_not_configured" }, 503, corsHeaders);
      const state = await store.createOAuthState("instagram");
      return json({ authorization_url: buildInstagramAuthorizationUrl(env, state), provider: "instagram" }, 200, corsHeaders);
    } catch (error) {
      return safeOAuthFailure(error, corsHeaders);
    }
  }

  if (path === "/auth/facebook/start" && request.method === "GET") {
    const denied = requireAdminBearer(request, env, corsHeaders);
    if (denied) return denied;
    const writeDenied = requireLocalWrite(env, corsHeaders);
    if (writeDenied) return writeDenied;
    try {
      getFacebookOAuthSettings(env);
      const store = getActiveConnectionStore(env);
      if (!store) return json({ error: "active_connection_store_not_configured" }, 503, corsHeaders);
      const state = await store.createOAuthState("facebook");
      return json({ authorization_url: buildFacebookAuthorizationUrl(env, state), provider: "facebook" }, 200, corsHeaders);
    } catch (error) {
      return safeOAuthFailure(error, corsHeaders);
    }
  }

  if (path === "/auth/instagram/callback" && request.method === "GET") {
    const writeDenied = requireLocalWrite(env, corsHeaders);
    if (writeDenied) return writeDenied;
    try {
      if (url.searchParams.has("error")) return json({ error: "instagram_authorization_denied" }, 400, corsHeaders);
      const state = url.searchParams.get("state") ?? "";
      const code = url.searchParams.get("code") ?? "";
      if (!state || !code) return json({ error: "missing_oauth_callback_parameters" }, 400, corsHeaders);
      const store = getActiveConnectionStore(env);
      if (!store) return json({ error: "active_connection_store_not_configured" }, 503, corsHeaders);
      await store.consumeOAuthState("instagram", state);
      const settings = getInstagramOAuthSettings(env);
      const shortToken = await exchangeInstagramAuthorizationCode(env, code);
      const longToken = await exchangeInstagramLongLivedToken(env, shortToken.accessToken);
      const identity = await fetchInstagramIdentity(env, longToken.accessToken);
      await storeActiveInstagramConnection(env, {
        loginMode: "instagram-login",
        instagramUserId: identity.id,
        instagramUsername: identity.username,
        accessToken: longToken.accessToken,
        tokenExpiresAt: tokenExpiry(longToken.expiresIn),
        scopes: settings.scopes,
        scopesSource: "requested",
      });
      return successResponse(env, corsHeaders, "instagram-login", identity.username);
    } catch (error) {
      return safeOAuthFailure(error, corsHeaders);
    }
  }

  if (path === "/auth/facebook/callback" && request.method === "GET") {
    const writeDenied = requireLocalWrite(env, corsHeaders);
    if (writeDenied) return writeDenied;
    try {
      if (url.searchParams.has("error")) return json({ error: "facebook_authorization_denied" }, 400, corsHeaders);
      const state = url.searchParams.get("state") ?? "";
      const code = url.searchParams.get("code") ?? "";
      if (!state || !code) return json({ error: "missing_oauth_callback_parameters" }, 400, corsHeaders);
      const store = getActiveConnectionStore(env);
      if (!store) return json({ error: "active_connection_store_not_configured" }, 503, corsHeaders);
      if (!env.ACTIVE_CONNECTION_ENCRYPTION_KEY) return json({ error: "active_connection_encryption_not_configured" }, 503, corsHeaders);
      await store.consumeOAuthState("facebook", state);
      const settings = getFacebookOAuthSettings(env);
      const shortUserToken = await exchangeFacebookAuthorizationCode(env, code);
      const longUserToken = await exchangeFacebookLongLivedToken(env, shortUserToken.accessToken);
      const candidates = await discoverFacebookInstagramAccounts(env, longUserToken.accessToken);
      if (candidates.length === 0) {
        return json({ error: "no_eligible_instagram_business_account", message: "No Facebook Page with a linked Instagram professional account was found." }, 422, corsHeaders);
      }
      const expiresAt = tokenExpiry(longUserToken.expiresIn);
      if (candidates.length === 1) {
        const candidate = candidates[0]!;
        await storeActiveInstagramConnection(env, {
          loginMode: "facebook-login",
          instagramUserId: candidate.instagramUserId,
          instagramUsername: candidate.instagramUsername,
          facebookPageId: candidate.pageId,
          accessToken: candidate.pageAccessToken,
          tokenExpiresAt: expiresAt,
          scopes: settings.scopes,
          scopesSource: "requested",
        });
        return successResponse(env, corsHeaders, "facebook-login", candidate.instagramUsername);
      }

      const selectionId = randomOpaqueToken(32);
      const selection: FacebookSelectionRecord = {
        selectionId,
        scopes: settings.scopes,
        tokenExpiresAt: expiresAt,
        createdAt: Date.now(),
        expiresAt: Date.now() + 10 * 60 * 1000,
        candidates: await Promise.all(
          candidates.map(async (candidate) => ({
            pageId: candidate.pageId,
            pageName: candidate.pageName,
            instagramUserId: candidate.instagramUserId,
            instagramUsername: candidate.instagramUsername,
            encryptedPageAccessToken: await encryptAccessToken(candidate.pageAccessToken, env.ACTIVE_CONNECTION_ENCRYPTION_KEY!),
          }))
        ),
      };
      await store.setFacebookSelection(selection);
      return renderFacebookSelection(selectionId, candidates, corsHeaders);
    } catch (error) {
      return safeOAuthFailure(error, corsHeaders);
    }
  }

  if (path === "/auth/facebook/select" && request.method === "POST") {
    const writeDenied = requireLocalWrite(env, corsHeaders);
    if (writeDenied) return writeDenied;
    try {
      const contentType = request.headers.get("content-type") ?? "";
      let selectionId = "";
      let pageId = "";
      if (contentType.includes("application/json")) {
        const body = (await request.json()) as { selection_id?: string; page_id?: string };
        selectionId = body.selection_id ?? "";
        pageId = body.page_id ?? "";
      } else {
        const form = await request.formData();
        selectionId = String(form.get("selection_id") ?? "");
        pageId = String(form.get("page_id") ?? "");
      }
      if (!selectionId || !pageId) return json({ error: "missing_facebook_selection" }, 400, corsHeaders);
      const store = getActiveConnectionStore(env);
      if (!store) return json({ error: "active_connection_store_not_configured" }, 503, corsHeaders);
      const { candidate, selection } = await store.consumeFacebookSelection(selectionId, pageId);
      const now = Date.now();
      const connection: StoredActiveInstagramConnection = {
        version: 1,
        loginMode: "facebook-login",
        instagramUserId: candidate.instagramUserId,
        instagramUsername: candidate.instagramUsername,
        facebookPageId: candidate.pageId,
        encryptedAccessToken: candidate.encryptedPageAccessToken,
        tokenExpiresAt: selection.tokenExpiresAt,
        scopes: [...selection.scopes],
        scopesSource: "requested",
        connectedAt: now,
        updatedAt: now,
      };
      await store.setConnection(connection);
      return successResponse(env, corsHeaders, "facebook-login", candidate.instagramUsername);
    } catch (error) {
      return safeOAuthFailure(error, corsHeaders);
    }
  }

  return json({ error: "oauth_route_not_found" }, 404, corsHeaders);
}
