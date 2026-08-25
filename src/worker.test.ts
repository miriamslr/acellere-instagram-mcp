import { describe, expect, it } from "vitest";
import worker, { CORS_HEADERS, type WorkerEnv } from "./worker.js";

const DEFAULT_MCP_HEADERS = {
  "Content-Type": "application/json",
  Accept: "application/json, text/event-stream",
};

describe("Cloudflare Worker (src/worker.ts)", () => {
  const baseEnv: WorkerEnv = {
    AUTH_TOKEN: "test-auth-token-12345",
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

  it("returns 404 for unknown endpoints", async () => {
    const req = new Request("https://example.com/unknown-route", {
      method: "GET",
    });
    const res = await worker.fetch(req, baseEnv);

    expect(res.status).toBe(404);
  });
});
