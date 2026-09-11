import { DEFAULT_META_API_VERSION } from "./meta-client.js";

export interface InstagramOAuthEnv {
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  META_API_VERSION?: string;
  INSTAGRAM_OAUTH_CLIENT_ID?: string;
  INSTAGRAM_OAUTH_CLIENT_SECRET?: string;
  INSTAGRAM_OAUTH_REDIRECT_URI?: string;
  INSTAGRAM_OAUTH_SCOPES?: string;
  FACEBOOK_OAUTH_CLIENT_ID?: string;
  FACEBOOK_OAUTH_CLIENT_SECRET?: string;
  FACEBOOK_OAUTH_REDIRECT_URI?: string;
  FACEBOOK_OAUTH_SCOPES?: string;
}

export interface OAuthTokenResult {
  accessToken: string;
  expiresIn?: number;
  tokenType?: string;
  userId?: string;
}

export interface InstagramIdentity {
  id: string;
  username?: string;
  name?: string;
  accountType?: string;
}

export interface FacebookInstagramCandidate {
  pageId: string;
  pageName: string;
  pageAccessToken: string;
  instagramUserId: string;
  instagramUsername?: string;
}

export const DEFAULT_INSTAGRAM_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_manage_messages",
  "instagram_business_manage_comments",
  "instagram_business_content_publish",
  "instagram_business_manage_insights",
] as const;

export const DEFAULT_FACEBOOK_LOGIN_SCOPES = [
  "pages_show_list",
  "pages_read_engagement",
  "instagram_basic",
  "instagram_manage_comments",
  "instagram_manage_insights",
  "instagram_content_publish",
  "instagram_manage_messages",
] as const;

function resolveApiVersion(raw?: string): string {
  if (raw && /^v\d+\.\d+$/.test(raw)) return raw;
  return DEFAULT_META_API_VERSION;
}

function parseScopes(raw: string | undefined, fallback: readonly string[]): string[] {
  const scopes = (raw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return scopes.length > 0 ? [...new Set(scopes)] : [...fallback];
}

function requireRedirectUri(value: string | undefined, envName: string): string {
  if (!value) throw new Error(`${envName} is not configured.`);
  const url = new URL(value);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error(`${envName} must use HTTPS (HTTP is allowed only for localhost development).`);
  }
  if (url.username || url.password) throw new Error(`${envName} must not contain URL userinfo.`);
  return url.toString();
}

function requireCredential(primary: string | undefined, fallback: string | undefined, name: string): string {
  const value = primary ?? fallback;
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

function safeProviderError(provider: string, status: number, body: unknown): Error {
  let code: string | number | undefined;
  let message: string | undefined;
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    const nested = record.error && typeof record.error === "object" ? record.error as Record<string, unknown> : record;
    if (typeof nested.code === "string" || typeof nested.code === "number") code = nested.code;
    if (typeof nested.message === "string") message = nested.message.slice(0, 240);
    if (!message && typeof record.error_message === "string") message = record.error_message.slice(0, 240);
  }
  const suffix = [code !== undefined ? `code ${code}` : null, message].filter(Boolean).join(": ");
  return new Error(`${provider} OAuth request failed (HTTP ${status})${suffix ? ` — ${suffix}` : ""}.`);
}

async function readJson(response: Response): Promise<Record<string, unknown>> {
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok || body.error) throw safeProviderError("Meta", response.status, body);
  return body;
}

function tokenFromBody(body: Record<string, unknown>): OAuthTokenResult {
  const accessToken = typeof body.access_token === "string" ? body.access_token : "";
  if (!accessToken) throw new Error("OAuth provider response did not contain an access token.");
  return {
    accessToken,
    expiresIn: typeof body.expires_in === "number" ? body.expires_in : undefined,
    tokenType: typeof body.token_type === "string" ? body.token_type : undefined,
    userId: typeof body.user_id === "string" || typeof body.user_id === "number" ? String(body.user_id) : undefined,
  };
}

export function getInstagramOAuthSettings(env: InstagramOAuthEnv) {
  return {
    clientId: requireCredential(env.INSTAGRAM_OAUTH_CLIENT_ID, env.META_APP_ID, "INSTAGRAM_OAUTH_CLIENT_ID or META_APP_ID"),
    clientSecret: requireCredential(env.INSTAGRAM_OAUTH_CLIENT_SECRET, env.META_APP_SECRET, "INSTAGRAM_OAUTH_CLIENT_SECRET or META_APP_SECRET"),
    redirectUri: requireRedirectUri(env.INSTAGRAM_OAUTH_REDIRECT_URI, "INSTAGRAM_OAUTH_REDIRECT_URI"),
    scopes: parseScopes(env.INSTAGRAM_OAUTH_SCOPES, DEFAULT_INSTAGRAM_LOGIN_SCOPES),
    apiVersion: resolveApiVersion(env.META_API_VERSION),
  };
}

export function getFacebookOAuthSettings(env: InstagramOAuthEnv) {
  return {
    clientId: requireCredential(env.FACEBOOK_OAUTH_CLIENT_ID, env.META_APP_ID, "FACEBOOK_OAUTH_CLIENT_ID or META_APP_ID"),
    clientSecret: requireCredential(env.FACEBOOK_OAUTH_CLIENT_SECRET, env.META_APP_SECRET, "FACEBOOK_OAUTH_CLIENT_SECRET or META_APP_SECRET"),
    redirectUri: requireRedirectUri(env.FACEBOOK_OAUTH_REDIRECT_URI, "FACEBOOK_OAUTH_REDIRECT_URI"),
    scopes: parseScopes(env.FACEBOOK_OAUTH_SCOPES, DEFAULT_FACEBOOK_LOGIN_SCOPES),
    apiVersion: resolveApiVersion(env.META_API_VERSION),
  };
}

export function buildInstagramAuthorizationUrl(env: InstagramOAuthEnv, state: string): string {
  const config = getInstagramOAuthSettings(env);
  const url = new URL("https://www.instagram.com/oauth/authorize");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("enable_fb_login", "0");
  // The goal of this runtime is explicit account switching; force re-auth so
  // the previous browser session does not silently reselect the old account.
  url.searchParams.set("force_reauth", "true");
  return url.toString();
}

export function buildFacebookAuthorizationUrl(env: InstagramOAuthEnv, state: string): string {
  const config = getFacebookOAuthSettings(env);
  const url = new URL(`https://www.facebook.com/${config.apiVersion}/dialog/oauth`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scopes.join(","));
  url.searchParams.set("state", state);
  url.searchParams.set("auth_type", "rerequest");
  return url.toString();
}

export async function exchangeInstagramAuthorizationCode(env: InstagramOAuthEnv, code: string): Promise<OAuthTokenResult> {
  const config = getInstagramOAuthSettings(env);
  const form = new FormData();
  form.set("client_id", config.clientId);
  form.set("client_secret", config.clientSecret);
  form.set("grant_type", "authorization_code");
  form.set("redirect_uri", config.redirectUri);
  form.set("code", code);

  const response = await fetch("https://api.instagram.com/oauth/access_token", {
    method: "POST",
    body: form,
    redirect: "error",
  });
  return tokenFromBody(await readJson(response));
}

export async function exchangeInstagramLongLivedToken(env: InstagramOAuthEnv, shortToken: string): Promise<OAuthTokenResult> {
  const config = getInstagramOAuthSettings(env);
  const url = new URL("https://graph.instagram.com/access_token");
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.clientSecret);
  url.searchParams.set("access_token", shortToken);
  const response = await fetch(url.toString(), { method: "GET", redirect: "error" });
  return tokenFromBody(await readJson(response));
}

export async function fetchInstagramIdentity(env: InstagramOAuthEnv, accessToken: string): Promise<InstagramIdentity> {
  const config = getInstagramOAuthSettings(env);
  const url = new URL(`https://graph.instagram.com/${config.apiVersion}/me`);
  url.searchParams.set("fields", "id,username,name,account_type");
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${accessToken}` },
    redirect: "error",
  });
  const body = await readJson(response);
  const id = typeof body.id === "string" || typeof body.id === "number" ? String(body.id) : "";
  if (!id) throw new Error("Instagram identity response did not contain an Instagram User ID.");
  return {
    id,
    username: typeof body.username === "string" ? body.username : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
    accountType: typeof body.account_type === "string" ? body.account_type : undefined,
  };
}

export async function exchangeFacebookAuthorizationCode(env: InstagramOAuthEnv, code: string): Promise<OAuthTokenResult> {
  const config = getFacebookOAuthSettings(env);
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/oauth/access_token`);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("client_secret", config.clientSecret);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("code", code);
  const response = await fetch(url.toString(), { method: "GET", redirect: "error" });
  return tokenFromBody(await readJson(response));
}

export async function exchangeFacebookLongLivedToken(env: InstagramOAuthEnv, shortToken: string): Promise<OAuthTokenResult> {
  const config = getFacebookOAuthSettings(env);
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/oauth/access_token`);
  url.searchParams.set("grant_type", "fb_exchange_token");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("client_secret", config.clientSecret);
  url.searchParams.set("fb_exchange_token", shortToken);
  const response = await fetch(url.toString(), { method: "GET", redirect: "error" });
  return tokenFromBody(await readJson(response));
}

export async function discoverFacebookInstagramAccounts(
  env: InstagramOAuthEnv,
  userAccessToken: string
): Promise<FacebookInstagramCandidate[]> {
  const config = getFacebookOAuthSettings(env);
  const url = new URL(`https://graph.facebook.com/${config.apiVersion}/me/accounts`);
  url.searchParams.set(
    "fields",
    "id,name,access_token,tasks,instagram_business_account{id,username,name,profile_picture_url}"
  );
  const response = await fetch(url.toString(), {
    method: "GET",
    headers: { Authorization: `Bearer ${userAccessToken}` },
    redirect: "error",
  });
  const body = await readJson(response);
  const data = Array.isArray(body.data) ? body.data : [];
  const candidates: FacebookInstagramCandidate[] = [];

  for (const raw of data) {
    if (!raw || typeof raw !== "object") continue;
    const page = raw as Record<string, unknown>;
    const igRaw = page.instagram_business_account;
    if (!igRaw || typeof igRaw !== "object") continue;
    const ig = igRaw as Record<string, unknown>;
    const pageId = typeof page.id === "string" || typeof page.id === "number" ? String(page.id) : "";
    const pageToken = typeof page.access_token === "string" ? page.access_token : "";
    const instagramUserId = typeof ig.id === "string" || typeof ig.id === "number" ? String(ig.id) : "";
    if (!pageId || !pageToken || !instagramUserId) continue;
    candidates.push({
      pageId,
      pageName: typeof page.name === "string" ? page.name : pageId,
      pageAccessToken: pageToken,
      instagramUserId,
      instagramUsername: typeof ig.username === "string" ? ig.username : undefined,
    });
  }
  return candidates;
}
