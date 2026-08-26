import type { InstagramApiMode } from "./acellere-meta-client.js";

export type ActiveConnectionSource = "oauth-active" | "env-fallback" | "none";
export type ActiveConnectionTokenStatus = "valid" | "expired" | "not_configured" | "partial_configuration";
export type OAuthProvider = "instagram" | "facebook";

export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown;
  get(id: unknown): {
    fetch(request: Request): Promise<Response>;
  };
}

export interface ActiveConnectionEnv {
  ACTIVE_INSTAGRAM_CONNECTION_DO?: DurableObjectNamespaceLike;
  ACTIVE_CONNECTION_ENCRYPTION_KEY?: string;
  INSTAGRAM_ACCESS_TOKEN?: string;
  INSTAGRAM_USER_ID?: string;
  FACEBOOK_PAGE_ID?: string;
  INSTAGRAM_API_MODE?: string;
  ACELLERE_LOCAL_STATE_WRITE_MODE?: string;
}

export interface StoredActiveInstagramConnection {
  version: 1;
  loginMode: InstagramApiMode;
  instagramUserId: string;
  instagramUsername?: string;
  facebookPageId?: string;
  encryptedAccessToken: string;
  tokenExpiresAt?: number;
  scopes: string[];
  scopesSource: "requested" | "provider-confirmed";
  connectedAt: number;
  updatedAt: number;
}

export interface ResolvedActiveInstagramConnection {
  source: ActiveConnectionSource;
  loginMode: InstagramApiMode;
  instagramAccessToken: string;
  instagramUserId: string;
  instagramUsername?: string;
  facebookPageId: string;
  tokenExpiresAt?: number;
  tokenStatus: ActiveConnectionTokenStatus;
  scopes: string[];
}

export interface SafeActiveInstagramConnectionStatus {
  connected: boolean;
  source: ActiveConnectionSource;
  login_mode: InstagramApiMode;
  instagram_user_id: string | null;
  instagram_username: string | null;
  facebook_page_id: string | null;
  token_status: ActiveConnectionTokenStatus;
  token_expires_at: string | null;
  scopes: string[];
}

export interface OAuthStateRecord {
  provider: OAuthProvider;
  state: string;
  createdAt: number;
  expiresAt: number;
}

export interface StoredFacebookSelectionCandidate {
  pageId: string;
  pageName: string;
  instagramUserId: string;
  instagramUsername?: string;
  encryptedPageAccessToken: string;
}

export interface FacebookSelectionRecord {
  selectionId: string;
  candidates: StoredFacebookSelectionCandidate[];
  scopes: string[];
  tokenExpiresAt?: number;
  createdAt: number;
  expiresAt: number;
}

const ACTIVE_DO_NAME = "active-instagram-connection";
const CONNECTION_AAD = new TextEncoder().encode("acellere:active-instagram-connection:v1");

function parseInstagramApiMode(value?: string): InstagramApiMode {
  return value === "instagram-login" ? "instagram-login" : "facebook-login";
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    const chunk = bytes.subarray(i, Math.min(i + 0x8000, bytes.length));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function deriveEncryptionKey(secret: string): Promise<CryptoKey> {
  if (secret.length < 32) {
    throw new Error("ACTIVE_CONNECTION_ENCRYPTION_KEY must contain at least 32 characters.");
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptAccessToken(token: string, secret: string): Promise<string> {
  if (!token) throw new Error("Cannot encrypt an empty Instagram access token.");
  const key = await deriveEncryptionKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(token);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: CONNECTION_AAD },
    key,
    plaintext
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

export async function decryptAccessToken(payload: string, secret: string): Promise<string> {
  const [version, ivPart, ciphertextPart] = payload.split(".");
  if (version !== "v1" || !ivPart || !ciphertextPart) {
    throw new Error("Stored active Instagram connection token has an invalid encrypted format.");
  }
  const key = await deriveEncryptionKey(secret);
  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlToBytes(ivPart), additionalData: CONNECTION_AAD },
      key,
      base64UrlToBytes(ciphertextPart)
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new Error("Unable to decrypt the active Instagram connection. Reconnect the account.");
  }
}

export function randomOpaqueToken(bytes = 32): string {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export function assertLocalStateWriteAllowed(env: ActiveConnectionEnv): void {
  const mode = (env.ACELLERE_LOCAL_STATE_WRITE_MODE ?? "read-only").trim().toLowerCase();
  if (mode !== "write") {
    throw new Error(
      "Acellere local-state safety gate blocked this operation. Set ACELLERE_LOCAL_STATE_WRITE_MODE=write only when reconnect/disconnect actions are intentionally enabled."
    );
  }
}

export function getActiveConnectionStore(env: ActiveConnectionEnv): ActiveInstagramConnectionStore | null {
  if (!env.ACTIVE_INSTAGRAM_CONNECTION_DO) return null;
  return new ActiveInstagramConnectionStore(env.ACTIVE_INSTAGRAM_CONNECTION_DO);
}

export class ActiveInstagramConnectionStore {
  private readonly stub: { fetch(request: Request): Promise<Response> };

  constructor(namespace: DurableObjectNamespaceLike) {
    this.stub = namespace.get(namespace.idFromName(ACTIVE_DO_NAME));
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    return this.stub.fetch(new Request(`https://active-instagram-connection.internal${path}`, init));
  }

  async getConnection(): Promise<StoredActiveInstagramConnection | null> {
    const response = await this.request("/connection", { method: "GET" });
    if (!response.ok) throw new Error(`Active connection store read failed (${response.status}).`);
    const body = (await response.json()) as { connection: StoredActiveInstagramConnection | null };
    return body.connection ?? null;
  }

  async setConnection(connection: StoredActiveInstagramConnection): Promise<void> {
    const response = await this.request("/connection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(connection),
    });
    if (!response.ok) throw new Error(`Active connection store write failed (${response.status}).`);
  }

  async clearConnection(): Promise<boolean> {
    const response = await this.request("/connection", { method: "DELETE" });
    if (!response.ok) throw new Error(`Active connection store delete failed (${response.status}).`);
    const body = (await response.json()) as { removed?: boolean };
    return body.removed === true;
  }

  async createOAuthState(provider: OAuthProvider, ttlMs = 10 * 60 * 1000): Promise<string> {
    const now = Date.now();
    const record: OAuthStateRecord = {
      provider,
      state: randomOpaqueToken(32),
      createdAt: now,
      expiresAt: now + ttlMs,
    };
    const response = await this.request("/oauth-state", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(record),
    });
    if (!response.ok) throw new Error(`OAuth state store write failed (${response.status}).`);
    return record.state;
  }

  async consumeOAuthState(provider: OAuthProvider, state: string): Promise<OAuthStateRecord> {
    const response = await this.request("/oauth-state/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider, state }),
    });
    if (!response.ok) {
      throw new Error(response.status === 410 ? "OAuth state expired. Start the connection flow again." : "Invalid OAuth state. Start the connection flow again.");
    }
    return (await response.json()) as OAuthStateRecord;
  }

  async setFacebookSelection(selection: FacebookSelectionRecord): Promise<void> {
    const response = await this.request("/facebook-selection", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(selection),
    });
    if (!response.ok) throw new Error(`Facebook account selection store write failed (${response.status}).`);
  }

  async consumeFacebookSelection(selectionId: string, pageId: string): Promise<{ candidate: StoredFacebookSelectionCandidate; selection: FacebookSelectionRecord }> {
    const response = await this.request("/facebook-selection/consume", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ selectionId, pageId }),
    });
    if (!response.ok) {
      throw new Error(response.status === 410 ? "Facebook account selection expired. Start the login flow again." : "Invalid Facebook account selection.");
    }
    return (await response.json()) as { candidate: StoredFacebookSelectionCandidate; selection: FacebookSelectionRecord };
  }
}

export async function storeActiveInstagramConnection(
  env: ActiveConnectionEnv,
  input: {
    loginMode: InstagramApiMode;
    instagramUserId: string;
    instagramUsername?: string;
    facebookPageId?: string;
    accessToken: string;
    tokenExpiresAt?: number;
    scopes?: string[];
    scopesSource?: "requested" | "provider-confirmed";
  }
): Promise<StoredActiveInstagramConnection> {
  const store = getActiveConnectionStore(env);
  if (!store) throw new Error("ACTIVE_INSTAGRAM_CONNECTION_DO is not configured.");
  if (!env.ACTIVE_CONNECTION_ENCRYPTION_KEY) {
    throw new Error("ACTIVE_CONNECTION_ENCRYPTION_KEY is not configured.");
  }
  const now = Date.now();
  const connection: StoredActiveInstagramConnection = {
    version: 1,
    loginMode: input.loginMode,
    instagramUserId: input.instagramUserId,
    instagramUsername: input.instagramUsername,
    facebookPageId: input.facebookPageId,
    encryptedAccessToken: await encryptAccessToken(input.accessToken, env.ACTIVE_CONNECTION_ENCRYPTION_KEY),
    tokenExpiresAt: input.tokenExpiresAt,
    scopes: [...(input.scopes ?? [])],
    scopesSource: input.scopesSource ?? "requested",
    connectedAt: now,
    updatedAt: now,
  };
  await store.setConnection(connection);
  return connection;
}

export async function resolveActiveInstagramConnection(env: ActiveConnectionEnv): Promise<ResolvedActiveInstagramConnection> {
  const store = getActiveConnectionStore(env);
  if (store) {
    const stored = await store.getConnection();
    if (stored) {
      if (!env.ACTIVE_CONNECTION_ENCRYPTION_KEY) {
        throw new Error("An OAuth Instagram connection exists but ACTIVE_CONNECTION_ENCRYPTION_KEY is not configured.");
      }
      if (stored.tokenExpiresAt !== undefined && stored.tokenExpiresAt <= Date.now()) {
        throw new Error("The active Instagram OAuth token has expired. Reconnect the Instagram account.");
      }
      const accessToken = await decryptAccessToken(stored.encryptedAccessToken, env.ACTIVE_CONNECTION_ENCRYPTION_KEY);
      return {
        source: "oauth-active",
        loginMode: stored.loginMode,
        instagramAccessToken: accessToken,
        instagramUserId: stored.instagramUserId,
        instagramUsername: stored.instagramUsername,
        facebookPageId: stored.facebookPageId ?? "",
        tokenExpiresAt: stored.tokenExpiresAt,
        tokenStatus: "valid",
        scopes: [...stored.scopes],
      };
    }
  }

  const token = env.INSTAGRAM_ACCESS_TOKEN ?? "";
  const userId = env.INSTAGRAM_USER_ID ?? "";
  const configuredFields = [token, userId].filter(Boolean).length;
  const source: ActiveConnectionSource = configuredFields > 0 ? "env-fallback" : "none";
  const tokenStatus: ActiveConnectionTokenStatus =
    configuredFields === 2 ? "valid" : configuredFields === 0 ? "not_configured" : "partial_configuration";

  return {
    source,
    loginMode: parseInstagramApiMode(env.INSTAGRAM_API_MODE),
    instagramAccessToken: token,
    instagramUserId: userId,
    facebookPageId: env.FACEBOOK_PAGE_ID ?? "",
    tokenStatus,
    scopes: [],
  };
}

export async function getSafeActiveInstagramConnectionStatus(env: ActiveConnectionEnv): Promise<SafeActiveInstagramConnectionStatus> {
  const store = getActiveConnectionStore(env);
  if (store) {
    const stored = await store.getConnection();
    if (stored) {
      const expired = stored.tokenExpiresAt !== undefined && stored.tokenExpiresAt <= Date.now();
      return {
        connected: true,
        source: "oauth-active",
        login_mode: stored.loginMode,
        instagram_user_id: stored.instagramUserId,
        instagram_username: stored.instagramUsername ?? null,
        facebook_page_id: stored.facebookPageId ?? null,
        token_status: expired ? "expired" : "valid",
        token_expires_at: stored.tokenExpiresAt ? new Date(stored.tokenExpiresAt).toISOString() : null,
        scopes: [...stored.scopes],
      };
    }
  }

  const resolved = await resolveActiveInstagramConnection({ ...env, ACTIVE_INSTAGRAM_CONNECTION_DO: undefined });
  return {
    connected: resolved.source !== "none" && resolved.tokenStatus === "valid",
    source: resolved.source,
    login_mode: resolved.loginMode,
    instagram_user_id: resolved.instagramUserId || null,
    instagram_username: null,
    facebook_page_id: resolved.facebookPageId || null,
    token_status: resolved.tokenStatus,
    token_expires_at: null,
    scopes: [],
  };
}

export async function disconnectActiveInstagramConnection(env: ActiveConnectionEnv): Promise<boolean> {
  assertLocalStateWriteAllowed(env);
  const store = getActiveConnectionStore(env);
  if (!store) return false;
  return store.clearConnection();
}
