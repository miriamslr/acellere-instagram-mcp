import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AcellereMetaClient } from "./services/acellere-meta-client.js";
import { registerAll } from "./register-all.js";
import { createMcpLogger } from "./utils/logger.js";
import type { MetaConfig } from "./config.js";
import {
  normalizeInstagramWebhook,
  verifyWebhookSignature,
  InMemoryWebhookEventSink,
  CloudflareQueueWebhookEventSink,
  DODeduplicatorCoordinator,
  InMemoryEventDeduplicator,
  KVEventDeduplicator,
  type CloudflareKVLike,
  type CloudflareQueueLike,
} from "./services/webhook-normalizer.js";
import { InstagramWebhookDeduplicatorDO } from "./services/webhook-deduplicator-do.js";
import { ActiveInstagramConnectionDO } from "./services/active-instagram-connection-do.js";
import {
  disconnectActiveInstagramConnection,
  getSafeActiveInstagramConnectionStatus,
  resolveActiveInstagramConnection,
  type ResolvedActiveInstagramConnection,
} from "./services/active-instagram-connection.js";
import {
  handleInstagramOAuthRequest,
  type InstagramOAuthControllerEnv,
} from "./services/instagram-oauth-controller.js";
import { registerIgActiveConnectionTools } from "./tools/instagram/active-connection.js";

export { InstagramWebhookDeduplicatorDO, ActiveInstagramConnectionDO };

export const SERVER_VERSION = "8.1.0";

export const SERVER_INSTRUCTIONS = [
  "Acellere Instagram MCP, based on meta-mcp, for managing Instagram and related Meta Graph API capabilities.",
  "The Acellere fork starts in server-enforced read-only mode. Set ACELLERE_WRITE_MODE=write only when mutations are intentionally enabled.",
  "DELETE requests remain blocked unless ACELLERE_ALLOW_DESTRUCTIVE=true is also set.",
  "Instagram tools use the single active OAuth connection when one exists; otherwise they fall back to INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID from the environment.",
  "Use ig_get_active_connection to inspect which account source is active without exposing tokens.",
  "Threads tools continue to use THREADS_ACCESS_TOKEN and THREADS_USER_ID.",
  "Token-rotation tools (meta_exchange_token, meta_refresh_token) additionally need META_APP_ID and META_APP_SECRET.",
  "Most publishing tools follow a two-step flow internally: create a container, wait for processing (up to 30s for images, up to 5 minutes for videos), then publish — exposed as a single MCP tool call.",
  "When the client sets a progressToken on a publish call, the server emits notifications/progress events while polling container status.",
  "Tool responses include a _rateLimit field when the Meta API returns rate-limit headers; check it to throttle subsequent calls.",
].join(" ");

export interface WorkerEnv extends InstagramOAuthControllerEnv {
  INSTAGRAM_WEBHOOK_VERIFY_TOKEN?: string;
  ACELLERE_WRITE_MODE?: string;
  ACELLERE_ALLOW_DESTRUCTIVE?: string | boolean;
  THREADS_ACCESS_TOKEN?: string;
  THREADS_USER_ID?: string;
  KV_DEDUPLICATION?: CloudflareKVLike;
  CACHE_KV?: CloudflareKVLike;
  WEBHOOK_QUEUE?: CloudflareQueueLike;
  WEBHOOK_DEDUPLICATOR_DO?: {
    idFromName(name: string): unknown;
    get(id: unknown): { fetch(request: Request): Promise<Response> };
  };
}

const defaultWebhookDeduplicator = new InMemoryEventDeduplicator();

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, mcp-session-id, mcp-protocol-version, mcp-method, mcp-name",
};

function legacyConnectionFromEnv(env: WorkerEnv): ResolvedActiveInstagramConnection {
  const token = env.INSTAGRAM_ACCESS_TOKEN ?? "";
  const userId = env.INSTAGRAM_USER_ID ?? "";
  const configuredFields = [token, userId].filter(Boolean).length;
  return {
    source: configuredFields > 0 ? "env-fallback" : "none",
    loginMode: env.INSTAGRAM_API_MODE === "instagram-login" ? "instagram-login" : "facebook-login",
    instagramAccessToken: token,
    instagramUserId: userId,
    facebookPageId: env.FACEBOOK_PAGE_ID ?? "",
    tokenStatus: configuredFields === 2 ? "valid" : configuredFields === 0 ? "not_configured" : "partial_configuration",
    scopes: [],
  };
}

export function buildWorkerServer(
  env: WorkerEnv,
  resolvedConnection?: ResolvedActiveInstagramConnection
): McpServer {
  const active = resolvedConnection ?? legacyConnectionFromEnv(env);
  const config: MetaConfig = {
    appId: env.META_APP_ID ?? "",
    appSecret: env.META_APP_SECRET ?? "",
    facebookPageId: active.facebookPageId,
    instagramAccessToken: active.instagramAccessToken,
    instagramUserId: active.instagramUserId,
    threadsAccessToken: env.THREADS_ACCESS_TOKEN ?? "",
    threadsUserId: env.THREADS_USER_ID ?? "",
  };

  const server = new McpServer(
    {
      name: "acellere-instagram-mcp",
      version: SERVER_VERSION,
    },
    {
      instructions: SERVER_INSTRUCTIONS,
      capabilities: { logging: {} },
    }
  );

  const client = new AcellereMetaClient(config, {
    logger: createMcpLogger(server, "meta-client"),
    writeMode: (env.ACELLERE_WRITE_MODE as "read-only" | "write") ?? "read-only",
    allowDestructive:
      env.ACELLERE_ALLOW_DESTRUCTIVE === true || env.ACELLERE_ALLOW_DESTRUCTIVE === "true",
    instagramApiMode: active.loginMode,
    metaApiVersion: env.META_API_VERSION,
  });

  registerAll(server, client);
  registerIgActiveConnectionTools(server, {
    getStatus: () => getSafeActiveInstagramConnectionStatus(env),
    disconnect: async () => {
      const removed = await disconnectActiveInstagramConnection(env);
      return {
        removed,
        active_connection: await getSafeActiveInstagramConnectionStatus(env),
      };
    },
  });
  return server;
}

export function verifyAuth(request: Request, env: WorkerEnv): boolean {
  if (!env.AUTH_TOKEN) {
    // Legacy MCP behavior retained until production-hardening issue #48 lands.
    return true;
  }
  const url = new URL(request.url);
  const authHeader = request.headers.get("Authorization");
  const queryToken = url.searchParams.get("token") || url.searchParams.get("auth") || url.searchParams.get("api_key");
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, "")?.trim();
  const token = bearerToken || queryToken?.trim();

  return token === env.AUTH_TOKEN.trim();
}

export default {
  async fetch(request: Request, env: WorkerEnv): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (path.startsWith("/auth/")) {
      try {
        const oauthResponse = await handleInstagramOAuthRequest(request, env, CORS_HEADERS);
        if (oauthResponse) return oauthResponse;
      } catch {
        return new Response(
          JSON.stringify({ error: "oauth_internal_error" }),
          { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json", "Cache-Control": "no-store" } }
        );
      }
    }

    if (path === "/health") {
      return new Response(
        JSON.stringify({ status: "ok" }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    if (path === "/" || path === "") {
      return new Response(
        JSON.stringify({
          service: "acellere-instagram-mcp",
          status: "healthy",
          endpoints: {
            health: "/health",
            mcp: "/mcp",
            webhooks: "/webhooks/instagram",
            oauth_status: "/auth/status",
            instagram_oauth_start: "/auth/instagram/start",
            facebook_oauth_start: "/auth/facebook/start",
          },
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    if (path === "/webhooks/instagram" || path === "/webhook") {
      if (request.method === "GET") {
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");

        const expectedVerifyToken = env.INSTAGRAM_WEBHOOK_VERIFY_TOKEN?.trim();
        if (mode === "subscribe" && challenge && expectedVerifyToken && token === expectedVerifyToken) {
          return new Response(challenge, { status: 200, headers: CORS_HEADERS });
        }
        return new Response("Forbidden", { status: 403, headers: CORS_HEADERS });
      }

      if (request.method === "POST") {
        const rawBody = await request.text();
        const signature = request.headers.get("x-hub-signature-256");

        if (!env.META_APP_SECRET || !signature) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Webhook receiver requires configured META_APP_SECRET and X-Hub-Signature-256 header." }),
            { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }

        const isValid = await verifyWebhookSignature(rawBody, signature, env.META_APP_SECRET);
        if (!isValid) {
          return new Response(
            JSON.stringify({ error: "Unauthorized: Invalid HMAC-SHA256 signature." }),
            { status: 401, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }

        let parsed: unknown;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          return new Response(
            JSON.stringify({ error: "Invalid JSON payload" }),
            { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }

        try {
          const normalized = normalizeInstagramWebhook(parsed);

          let coordinator: DODeduplicatorCoordinator | undefined;
          if (env.WEBHOOK_DEDUPLICATOR_DO) {
            coordinator = new DODeduplicatorCoordinator(env.WEBHOOK_DEDUPLICATOR_DO);
          }

          const kv = env.KV_DEDUPLICATION ?? env.CACHE_KV;
          const fallbackDedup = kv ? new KVEventDeduplicator(kv) : defaultWebhookDeduplicator;

          const sink = env.WEBHOOK_QUEUE
            ? new CloudflareQueueWebhookEventSink(env.WEBHOOK_QUEUE, coordinator)
            : new InMemoryWebhookEventSink(coordinator ?? fallbackDedup);

          const dispatchResult = await sink.dispatch(normalized);

          return new Response(
            JSON.stringify({
              status: "ok",
              received_events_count: normalized.length,
              dispatched: dispatchResult.dispatched,
              ignored_duplicates: dispatchResult.ignoredDuplicates,
              ignored_replays: dispatchResult.ignoredReplays,
              events: normalized,
            }),
            { status: 200, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        } catch (dispatchError: unknown) {
          const message = dispatchError instanceof Error ? dispatchError.message : "Webhook event dispatch failed";
          return new Response(
            JSON.stringify({
              error: "Webhook event dispatch failed, retry requested",
              message,
            }),
            { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }
      }
    }

    if (path === "/mcp" || path === "/sse") {
      if (!verifyAuth(request, env)) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32000,
              message: "Unauthorized: Missing or invalid Bearer authentication token in Authorization header or ?token= query parameter.",
            },
          }),
          {
            status: 401,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          }
        );
      }

      try {
        const activeConnection = await resolveActiveInstagramConnection(env);
        const server = buildWorkerServer(env, activeConnection);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined,
          enableJsonResponse: true,
        });
        await server.connect(transport);
        const response = await transport.handleRequest(request);

        const responseHeaders = new Headers(response.headers);
        for (const [key, value] of Object.entries(CORS_HEADERS)) {
          if (!responseHeaders.has(key)) responseHeaders.set(key, value);
        }

        return new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Internal Server Error";
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32603,
              message,
            },
          }),
          {
            status: 500,
            headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
          }
        );
      }
    }

    return new Response(
      JSON.stringify({ error: "Not Found", message: `Route ${request.method} ${path} does not exist.` }),
      {
        status: 404,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      }
    );
  },
};
