import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { AcellereMetaClient, type AcellereWriteMode, type InstagramApiMode } from "./services/acellere-meta-client.js";
import { registerAll } from "./register-all.js";
import { createMcpLogger } from "./utils/logger.js";
import type { MetaConfig } from "./config.js";

export const SERVER_VERSION = "8.0.0";

export const SERVER_INSTRUCTIONS = [
  "Acellere Instagram MCP, based on meta-mcp, for managing Instagram and related Meta Graph API capabilities.",
  "The Acellere fork starts in server-enforced read-only mode. Set ACELLERE_WRITE_MODE=write only when mutations are intentionally enabled.",
  "DELETE requests remain blocked unless ACELLERE_ALLOW_DESTRUCTIVE=true is also set.",
  "Instagram tools require INSTAGRAM_ACCESS_TOKEN and INSTAGRAM_USER_ID; Threads tools require THREADS_ACCESS_TOKEN and THREADS_USER_ID.",
  "Token-rotation tools (meta_exchange_token, meta_refresh_token) additionally need META_APP_ID and META_APP_SECRET.",
  "Most publishing tools follow a two-step flow internally: create a container, wait for processing (up to 30s for images, up to 5 minutes for videos), then publish — exposed as a single MCP tool call.",
  "When the client sets a progressToken on a publish call, the server emits notifications/progress events while polling container status.",
  "Tool responses include a _rateLimit field when the Meta API returns rate-limit headers; check it to throttle subsequent calls.",
].join(" ");

export interface WorkerEnv {
  AUTH_TOKEN?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_USER_ID?: string;
  INSTAGRAM_API_MODE?: string;
  META_API_VERSION?: string;
  ACELLERE_WRITE_MODE?: string;
  ACELLERE_ALLOW_DESTRUCTIVE?: string | boolean;
  META_APP_ID?: string;
  META_APP_SECRET?: string;
  THREADS_ACCESS_TOKEN?: string;
  THREADS_USER_ID?: string;
}

export const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With, mcp-session-id, mcp-protocol-version, mcp-method, mcp-name",
};

export function buildWorkerServer(env: WorkerEnv): McpServer {
  const config: MetaConfig = {
    appId: env.META_APP_ID ?? "",
    appSecret: env.META_APP_SECRET ?? "",
    instagramAccessToken: env.INSTAGRAM_ACCESS_TOKEN ?? "",
    instagramUserId: env.INSTAGRAM_USER_ID ?? "",
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

  const writeMode = ((env.ACELLERE_WRITE_MODE ?? "read-only").trim().toLowerCase() === "write" ? "write" : "read-only") as AcellereWriteMode;
  const allowDestructive = ["1", "true", "yes", "on"].includes(String(env.ACELLERE_ALLOW_DESTRUCTIVE ?? "false").trim().toLowerCase());
  const instagramApiMode = ((env.INSTAGRAM_API_MODE ?? "facebook-login").trim().toLowerCase() === "instagram-login" ? "instagram-login" : "facebook-login") as InstagramApiMode;

  const client = new AcellereMetaClient(config, {
    logger: createMcpLogger(server, "meta-client"),
    metaApiVersion: env.META_API_VERSION,
    writeMode,
    allowDestructive,
    instagramApiMode,
  });

  registerAll(server, client);
  return server;
}

export function verifyAuth(request: Request, env: WorkerEnv): boolean {
  if (!env.AUTH_TOKEN) {
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

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Health check endpoint (public, strictly safe, no Meta calls or env leaks)
    if (path === "/health") {
      return new Response(
        JSON.stringify({ status: "ok" }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // Root Welcome Endpoint
    if (path === "/" || path === "") {
      return new Response(
        JSON.stringify({
          service: "acellere-instagram-mcp",
          status: "healthy",
          endpoints: {
            health: "/health",
            mcp: "/mcp",
          },
        }),
        {
          status: 200,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        }
      );
    }

    // Protect MCP endpoint
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
        const server = buildWorkerServer(env);
        const transport = new WebStandardStreamableHTTPServerTransport({
          sessionIdGenerator: undefined, // stateless mode for remote MCP
          enableJsonResponse: true,
        });
        await server.connect(transport);
        const response = await transport.handleRequest(request);

        const responseHeaders = new Headers(response.headers);
        for (const [key, value] of Object.entries(CORS_HEADERS)) {
          if (!responseHeaders.has(key)) {
            responseHeaders.set(key, value);
          }
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
