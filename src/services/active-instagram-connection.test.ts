import { describe, expect, it } from "vitest";
import { ActiveInstagramConnectionDO } from "./active-instagram-connection-do.js";
import {
  ActiveInstagramConnectionStore,
  decryptAccessToken,
  disconnectActiveInstagramConnection,
  encryptAccessToken,
  getSafeActiveInstagramConnectionStatus,
  resolveActiveInstagramConnection,
  storeActiveInstagramConnection,
  type ActiveConnectionEnv,
  type DurableObjectNamespaceLike,
} from "./active-instagram-connection.js";

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

const encryptionKey = "test-active-connection-encryption-key-0123456789";

function baseEnv(): ActiveConnectionEnv {
  return {
    ACTIVE_INSTAGRAM_CONNECTION_DO: createNamespace(),
    ACTIVE_CONNECTION_ENCRYPTION_KEY: encryptionKey,
    INSTAGRAM_ACCESS_TOKEN: "legacy-token-A",
    INSTAGRAM_USER_ID: "111111",
    FACEBOOK_PAGE_ID: "page-A",
    INSTAGRAM_API_MODE: "facebook-login",
    ACELLERE_LOCAL_STATE_WRITE_MODE: "write",
  };
}

describe("single active Instagram connection", () => {
  it("encrypts tokens at rest and rejects the wrong encryption key", async () => {
    const encrypted = await encryptAccessToken("IGAA-secret-token", encryptionKey);
    expect(encrypted).not.toContain("IGAA-secret-token");
    await expect(decryptAccessToken(encrypted, encryptionKey)).resolves.toBe("IGAA-secret-token");
    await expect(decryptAccessToken(encrypted, "different-key-that-is-definitely-long-enough-123")).rejects.toThrow(
      /Unable to decrypt/
    );
  });

  it("uses the legacy env only while no OAuth connection exists", async () => {
    const env = baseEnv();
    const initial = await resolveActiveInstagramConnection(env);
    expect(initial.source).toBe("env-fallback");
    expect(initial.instagramAccessToken).toBe("legacy-token-A");
    expect(initial.instagramUserId).toBe("111111");

    await storeActiveInstagramConnection(env, {
      loginMode: "instagram-login",
      instagramUserId: "222222",
      instagramUsername: "account_b",
      accessToken: "oauth-token-B",
      scopes: ["instagram_business_basic"],
    });

    const switched = await resolveActiveInstagramConnection(env);
    expect(switched.source).toBe("oauth-active");
    expect(switched.loginMode).toBe("instagram-login");
    expect(switched.instagramAccessToken).toBe("oauth-token-B");
    expect(switched.instagramUserId).toBe("222222");
    expect(switched.facebookPageId).toBe("");
  });

  it("reconnecting replaces account A with account B instead of keeping a list", async () => {
    const env = baseEnv();
    await storeActiveInstagramConnection(env, {
      loginMode: "instagram-login",
      instagramUserId: "account-A-id",
      instagramUsername: "account_a",
      accessToken: "oauth-token-A",
    });
    await storeActiveInstagramConnection(env, {
      loginMode: "facebook-login",
      instagramUserId: "account-B-id",
      instagramUsername: "account_b",
      facebookPageId: "page-B",
      accessToken: "oauth-token-B",
    });

    const active = await resolveActiveInstagramConnection(env);
    expect(active.instagramUserId).toBe("account-B-id");
    expect(active.instagramUsername).toBe("account_b");
    expect(active.facebookPageId).toBe("page-B");
    expect(active.instagramAccessToken).toBe("oauth-token-B");
  });

  it("disconnect removes only OAuth state and returns to the legacy env fallback", async () => {
    const env = baseEnv();
    await storeActiveInstagramConnection(env, {
      loginMode: "instagram-login",
      instagramUserId: "222222",
      instagramUsername: "oauth_account",
      accessToken: "oauth-token",
    });

    await expect(disconnectActiveInstagramConnection(env)).resolves.toBe(true);
    const active = await resolveActiveInstagramConnection(env);
    expect(active.source).toBe("env-fallback");
    expect(active.instagramUserId).toBe("111111");
    expect(active.instagramAccessToken).toBe("legacy-token-A");
  });

  it("does not silently fall back to env when an OAuth connection is expired", async () => {
    const env = baseEnv();
    await storeActiveInstagramConnection(env, {
      loginMode: "instagram-login",
      instagramUserId: "expired-id",
      instagramUsername: "expired_account",
      accessToken: "expired-token",
      tokenExpiresAt: Date.now() - 1000,
    });

    await expect(resolveActiveInstagramConnection(env)).rejects.toThrow(/expired/);
    const status = await getSafeActiveInstagramConnectionStatus(env);
    expect(status.source).toBe("oauth-active");
    expect(status.token_status).toBe("expired");
  });

  it("OAuth state is single-use and provider-bound", async () => {
    const namespace = createNamespace();
    const store = new ActiveInstagramConnectionStore(namespace);
    const state = await store.createOAuthState("instagram", 60_000);

    await expect(store.consumeOAuthState("facebook", state)).rejects.toThrow(/Invalid OAuth state/);
    await expect(store.consumeOAuthState("instagram", state)).resolves.toMatchObject({ provider: "instagram", state });
    await expect(store.consumeOAuthState("instagram", state)).rejects.toThrow(/Invalid OAuth state/);
  });
});
