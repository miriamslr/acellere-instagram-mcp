import { describe, expect, it } from "vitest";
import worker, { CORS_HEADERS, type WorkerEnv } from "./worker.js";

const DEFAULT_MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

describe("Cloudflare Worker (src/worker.ts)", () => {
  const baseEnv: WorkerEnv = {
    AUTH_TOKEN: "test-auth-token-12345",
    INSTAGRAM_WEBHOOK_VERIFY_TOKEN: "my_webhook_secret_verify_token",
    META_APP_SECRET: "test_meta_app_secret_999",
    INSTAGRAM_ACCESS_TOKEN: "test-ig-token",
    INSTAGRAM_USER_ID: "17841421598761181",
    INSTAGRAM_API_MODE: "facebook-login",
    META_API_VERSION: "v26.0",
    ACELLERE_WRITE_MODE: "read-only",
    ACELLERE_ALLOW_DESTRUCTIVE: "false",
  };

  it("handles CORS preflight OPTIONS request", async () => {
    const req = new Request("https://example.com/mcp", {
      method: "OPTIONS",
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(204);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("Access-Control-Allow-Methods")).toBe(CORS_HEADERS["Access-Control-Allow-Methods"]);
  });

  it("returns public safe status on /health without leaking environment", async () => {
    const req = new Request("https://example.com/health", {
      method: "GET",
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { status: string };
    expect(body).toEqual({ status: "ok" });
    expect(JSON.stringify(body)).not.toContain("test-ig-token");
    expect(JSON.stringify(body)).not.toContain("17841421598761181");
  });

  it("returns root service info on /", async () => {
    const req = new Request("https://example.com/", {
      method: "GET",
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { service: string; status: string };
    expect(body.service).toBe("acellere-instagram-mcp");
    expect(body.status).toBe("healthy");
  });

  it("rejects unauthenticated requests to /mcp with 401 Unauthorized", async () => {
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: { message: string } };
    expect(body.error.message).toContain("Unauthorized");
  });

  it("rejects invalid Bearer token to /mcp with 401 Unauthorized", async () => {
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer wrong-token",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(401);
  });

  it("accepts valid Bearer token header and initializes MCP session", async () => {
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        ...DEFAULT_MCP_HEADERS,
        Authorization: "Bearer test-auth-token-12345",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      jsonrpc: string;
      id: number;
      result: { serverInfo: { name: string; version: string } };
    };
    expect(body.jsonrpc).toBe("2.0");
    expect(body.result.serverInfo.name).toBe("acellere-instagram-mcp");
    expect(body.result.serverInfo.version).toBe("8.0.0");
  });

  it("accepts query parameter token (?token=...) on /mcp", async () => {
    const req = new Request("https://example.com/mcp?token=test-auth-token-12345", {
      method: "POST",
      headers: {
        ...DEFAULT_MCP_HEADERS,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 2,
        method: "initialize",
        params: {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "test-client", version: "1.0.0" },
        },
      }),
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as { result: { serverInfo: { name: string } } };
    expect(body.result.serverInfo.name).toBe("acellere-instagram-mcp");
  });

  it("lists all Instagram and Threads tools via tools/list", async () => {
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        ...DEFAULT_MCP_HEADERS,
        Authorization: "Bearer test-auth-token-12345",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/list",
      }),
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result: { tools: Array<{ name: string; description: string }> };
    };
    const toolNames = body.result.tools.map((t) => t.name);

    expect(toolNames).toContain("ig_get_profile");
    expect(toolNames).toContain("ig_get_media_list");
    expect(toolNames).toContain("ig_get_account_insights");
    expect(toolNames).toContain("ig_publish_photo");
    expect(toolNames).toContain("threads_get_profile");
  });

  it("blocks mutation actions when server is in read-only mode", async () => {
    const req = new Request("https://example.com/mcp", {
      method: "POST",
      headers: {
        ...DEFAULT_MCP_HEADERS,
        Authorization: "Bearer test-auth-token-12345",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "ig_publish_photo",
          arguments: {
            image_url: "https://example.com/test.jpg",
            caption: "Test post",
          },
        },
      }),
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      result?: { isError?: boolean; content?: Array<{ text: string }> };
    };
    expect(body.result?.isError).toBe(true);
    expect(body.result?.content?.[0]?.text).toContain("read-only mode");
  });

  describe("Webhook receiver fail-closed security", () => {
    it("GET /webhooks/instagram succeeds only with valid verify token", async () => {
      const validReq = new Request(
        "https://example.com/webhooks/instagram?hub.mode=subscribe&hub.verify_token=my_webhook_secret_verify_token&hub.challenge=challenge_123",
        { method: "GET" }
      );
      const validRes = await worker.fetch(validReq, baseEnv);
      expect(validRes.status).toBe(200);
      expect(await validRes.text()).toBe("challenge_123");

      const wrongReq = new Request(
        "https://example.com/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong_token&hub.challenge=challenge_123",
        { method: "GET" }
      );
      const wrongRes = await worker.fetch(wrongReq, baseEnv);
      expect(wrongRes.status).toBe(403);

      const noSecretEnv: WorkerEnv = { ...baseEnv, INSTAGRAM_WEBHOOK_VERIFY_TOKEN: undefined };
      const noSecretRes = await worker.fetch(validReq, noSecretEnv);
      expect(noSecretRes.status).toBe(403);
    });

    it("POST /webhooks/instagram fails closed when secret/signature is missing or invalid", async () => {
      const currentSeconds = Math.floor(Date.now() / 1000);
      const payload = JSON.stringify({
        object: "instagram",
        entry: [
          {
            id: "1784140001",
            time: currentSeconds,
            messaging: [
              {
                sender: { id: "igsid_123" },
                recipient: { id: "1784140001" },
                timestamp: currentSeconds * 1000,
                message: { mid: "m_1", text: "Webhook message" },
              },
            ],
          },
        ],
      });

      // Missing signature header -> 401
      const noSigReq = new Request("https://example.com/webhooks/instagram", {
        method: "POST",
        body: payload,
      });
      const noSigRes = await worker.fetch(noSigReq, baseEnv);
      expect(noSigRes.status).toBe(401);

      // Wrong signature -> 401
      const wrongSigReq = new Request("https://example.com/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=invalid_hex_string" },
        body: payload,
      });
      const wrongSigRes = await worker.fetch(wrongSigReq, baseEnv);
      expect(wrongSigRes.status).toBe(401);

      // Missing app secret in env -> 401
      const noSecretEnv: WorkerEnv = { ...baseEnv, META_APP_SECRET: undefined };
      const noSecretReq = new Request("https://example.com/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=abcdef" },
        body: payload,
      });
      const noSecretRes = await worker.fetch(noSecretReq, noSecretEnv);
      expect(noSecretRes.status).toBe(401);

      // Valid signature -> 200 with normalized events and deduplication info
      const encoder = new TextEncoder();
      const key = await crypto.subtle.importKey(
        "raw",
        encoder.encode(baseEnv.META_APP_SECRET!),
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"]
      );
      const signatureBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
      const validHex = Array.from(new Uint8Array(signatureBuf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");

      const validReq = new Request("https://example.com/webhooks/instagram", {
        method: "POST",
        headers: { "x-hub-signature-256": `sha256=${validHex}` },
        body: payload,
      });
      const validRes = await worker.fetch(validReq, baseEnv);
      expect(validRes.status).toBe(200);
      const resBody = (await validRes.json()) as { status: string; received_events_count: number; dispatched: number; ignored_replays: number };
      expect(resBody.status).toBe("ok");
      expect(resBody.received_events_count).toBe(1);
      expect(resBody.dispatched).toBe(1);
      expect(resBody.ignored_replays).toBe(0);
    });
  });

  it("returns 404 for unknown endpoints", async () => {
    const req = new Request("https://example.com/unknown-route", {
      method: "GET",
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(404);
  });
});
