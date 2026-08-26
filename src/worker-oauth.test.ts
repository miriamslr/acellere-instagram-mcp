import { afterEach, describe, expect, it, vi } from "vitest";
import worker, { type WorkerEnv } from "./worker.js";
import { ActiveInstagramConnectionDO } from "./services/active-instagram-connection-do.js";
import type { DurableObjectNamespaceLike } from "./services/active-instagram-connection.js";

class MemoryStorage {
  private readonly values = new Map<string, unknown>();
  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }
  async put<T>(key: string, value: T): Promise<void> {
    this.values.set(key, value);
  }
  async delete(key: string): Promise<boolean> {
    return this.values.delete(key);
  }
}

function createNamespace(): DurableObjectNamespaceLike {
  const durable = new ActiveInstagramConnectionDO({ storage: new MemoryStorage() });
  return {
    idFromName: (name: string) => name,
    get: () => ({ fetch: (request: Request) => durable.fetch(request) }),
  };
}

function env(): WorkerEnv {
  return {
    AUTH_TOKEN: "admin-auth-token",
    ACTIVE_INSTAGRAM_CONNECTION_DO: createNamespace(),
    ACTIVE_CONNECTION_ENCRYPTION_KEY: "worker-oauth-encryption-key-01234567890123456789",
    ACELLERE_LOCAL_STATE_WRITE_MODE: "write",
    ACELLERE_WRITE_MODE: "read-only",
    ACELLERE_ALLOW_DESTRUCTIVE: "false",
    META_APP_ID: "1234567890",
    META_APP_SECRET: "meta-app-secret-test",
    META_API_VERSION: "v26.0",
    INSTAGRAM_OAUTH_REDIRECT_URI: "https://worker.example.com/auth/instagram/callback",
    FACEBOOK_OAUTH_REDIRECT_URI: "https://worker.example.com/auth/facebook/callback",
    INSTAGRAM_ACCESS_TOKEN: "legacy-token",
    INSTAGRAM_USER_ID: "111111",
    FACEBOOK_PAGE_ID: "legacy-page",
    INSTAGRAM_API_MODE: "facebook-login",
  };
}

function authHeaders(): Record<string, string> {
  return { Authorization: "Bearer admin-auth-token" };
}

async function jsonBody(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Worker single active Instagram OAuth", () => {
  it("keeps OAuth admin routes fail-closed even if legacy MCP auth remains compatible", async () => {
    const testEnv = env();
    const unauthenticated = await worker.fetch(new Request("https://worker.example.com/auth/status"), testEnv);
    expect(unauthenticated.status).toBe(401);

    const noAuthConfigured = { ...testEnv, AUTH_TOKEN: undefined };
    const noConfig = await worker.fetch(new Request("https://worker.example.com/auth/status"), noAuthConfigured);
    expect(noConfig.status).toBe(503);
  });

  it("switches from legacy env account A to Instagram OAuth account B and disconnects back to A", async () => {
    const testEnv = env();

    const initial = await worker.fetch(
      new Request("https://worker.example.com/auth/status", { headers: authHeaders() }),
      testEnv
    );
    expect(await jsonBody(initial)).toMatchObject({
      source: "env-fallback",
      instagram_user_id: "111111",
      login_mode: "facebook-login",
    });

    const start = await worker.fetch(
      new Request("https://worker.example.com/auth/instagram/start", { headers: authHeaders() }),
      testEnv
    );
    expect(start.status).toBe(200);
    const startBody = await jsonBody(start);
    const authorizationUrl = new URL(String(startBody.authorization_url));
    const state = authorizationUrl.searchParams.get("state");
    expect(state).toBeTruthy();

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "ig-short-B", user_id: "222222" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "ig-long-B", token_type: "bearer", expires_in: 5_184_000 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "222222", username: "account_b", account_type: "BUSINESS" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const callback = await worker.fetch(
      new Request(`https://worker.example.com/auth/instagram/callback?code=code-b&state=${encodeURIComponent(state!)}`),
      testEnv
    );
    expect(callback.status).toBe(200);
    expect(await callback.text()).toContain("@account_b");

    const switched = await worker.fetch(
      new Request("https://worker.example.com/auth/status", { headers: authHeaders() }),
      testEnv
    );
    expect(await jsonBody(switched)).toMatchObject({
      source: "oauth-active",
      instagram_user_id: "222222",
      instagram_username: "account_b",
      login_mode: "instagram-login",
      token_status: "valid",
    });

    const mcpResponse = await worker.fetch(
      new Request("https://worker.example.com/mcp", {
        method: "POST",
        headers: {
          ...authHeaders(),
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "ig_get_connection_info", arguments: {} },
        }),
      }),
      testEnv
    );
    expect(mcpResponse.status).toBe(200);
    expect(await mcpResponse.text()).toContain("222222");

    const disconnect = await worker.fetch(
      new Request("https://worker.example.com/auth/disconnect", { method: "POST", headers: authHeaders() }),
      testEnv
    );
    expect(disconnect.status).toBe(200);
    const disconnected = await jsonBody(disconnect);
    expect(disconnected).toMatchObject({
      removed: true,
      active_connection: {
        source: "env-fallback",
        instagram_user_id: "111111",
      },
    });
  });

  it("requires explicit choice when Facebook Login discovers multiple eligible Instagram accounts", async () => {
    const testEnv = env();
    const start = await worker.fetch(
      new Request("https://worker.example.com/auth/facebook/start", { headers: authHeaders() }),
      testEnv
    );
    const startBody = await jsonBody(start);
    const authorizationUrl = new URL(String(startBody.authorization_url));
    const state = authorizationUrl.searchParams.get("state");

    vi.spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fb-short", token_type: "bearer", expires_in: 3600 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "fb-long", token_type: "bearer", expires_in: 5_184_000 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                id: "page_1",
                name: "Page One",
                access_token: "page-token-1",
                instagram_business_account: { id: "ig_1", username: "brand_one" },
              },
              {
                id: "page_2",
                name: "Page Two",
                access_token: "page-token-2",
                instagram_business_account: { id: "ig_2", username: "brand_two" },
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );

    const callback = await worker.fetch(
      new Request(`https://worker.example.com/auth/facebook/callback?code=fb-code&state=${encodeURIComponent(state!)}`),
      testEnv
    );
    expect(callback.status).toBe(200);
    const selectionHtml = await callback.text();
    expect(selectionHtml).toContain("@brand_one");
    expect(selectionHtml).toContain("@brand_two");
    expect(selectionHtml).not.toContain("page-token-1");
    expect(selectionHtml).not.toContain("page-token-2");

    const selectionId = selectionHtml.match(/name="selection_id" value="([^"]+)"/)?.[1];
    expect(selectionId).toBeTruthy();

    const form = new FormData();
    form.set("selection_id", selectionId!);
    form.set("page_id", "page_2");
    const select = await worker.fetch(
      new Request("https://worker.example.com/auth/facebook/select", { method: "POST", body: form }),
      testEnv
    );
    expect(select.status).toBe(200);
    expect(await select.text()).toContain("@brand_two");

    const status = await worker.fetch(
      new Request("https://worker.example.com/auth/status", { headers: authHeaders() }),
      testEnv
    );
    expect(await jsonBody(status)).toMatchObject({
      source: "oauth-active",
      login_mode: "facebook-login",
      instagram_user_id: "ig_2",
      instagram_username: "brand_two",
      facebook_page_id: "page_2",
    });
  });

  it("blocks OAuth state mutations while local-state writes are disabled", async () => {
    const testEnv = { ...env(), ACELLERE_LOCAL_STATE_WRITE_MODE: "read-only" };
    const start = await worker.fetch(
      new Request("https://worker.example.com/auth/instagram/start", { headers: authHeaders() }),
      testEnv
    );
    expect(start.status).toBe(403);
    expect(await jsonBody(start)).toMatchObject({ error: "local_state_write_disabled" });
  });
});
