import type {
  FacebookSelectionRecord,
  OAuthProvider,
  OAuthStateRecord,
  StoredActiveInstagramConnection,
} from "./active-instagram-connection.js";

interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
}

interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
}

const CONNECTION_KEY = "active_connection";
const OAUTH_STATE_KEY = "oauth_state";
const FACEBOOK_SELECTION_KEY = "facebook_selection";

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * Single-slot state holder for the currently active Instagram OAuth connection.
 * This is intentionally NOT multi-tenant: one logical Durable Object name maps
 * to one active connection, one in-flight OAuth state and one optional Facebook
 * account selection transaction.
 */
export class ActiveInstagramConnectionDO {
  constructor(private readonly state: DurableObjectStateLike, _env?: unknown) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/connection") {
      if (request.method === "GET") {
        const connection = await this.state.storage.get<StoredActiveInstagramConnection>(CONNECTION_KEY);
        return json({ connection: connection ?? null });
      }
      if (request.method === "PUT") {
        const connection = (await request.json()) as StoredActiveInstagramConnection;
        if (!connection || connection.version !== 1 || !connection.instagramUserId || !connection.encryptedAccessToken) {
          return json({ error: "invalid_connection" }, 400);
        }
        await this.state.storage.put(CONNECTION_KEY, connection);
        return json({ success: true });
      }
      if (request.method === "DELETE") {
        const removed = await this.state.storage.delete(CONNECTION_KEY);
        return json({ success: true, removed });
      }
    }

    if (url.pathname === "/oauth-state" && request.method === "PUT") {
      const record = (await request.json()) as OAuthStateRecord;
      if (!record?.state || !record?.provider || !record?.expiresAt) {
        return json({ error: "invalid_oauth_state" }, 400);
      }
      await this.state.storage.put(OAUTH_STATE_KEY, record);
      return json({ success: true });
    }

    if (url.pathname === "/oauth-state/consume" && request.method === "POST") {
      const body = (await request.json()) as { provider?: OAuthProvider; state?: string };
      const record = await this.state.storage.get<OAuthStateRecord>(OAUTH_STATE_KEY);
      if (!record || !body.state || !body.provider || record.state !== body.state || record.provider !== body.provider) {
        return json({ error: "invalid_oauth_state" }, 403);
      }
      await this.state.storage.delete(OAUTH_STATE_KEY);
      if (record.expiresAt <= Date.now()) {
        return json({ error: "expired_oauth_state" }, 410);
      }
      return json(record);
    }

    if (url.pathname === "/facebook-selection" && request.method === "PUT") {
      const record = (await request.json()) as FacebookSelectionRecord;
      if (!record?.selectionId || !Array.isArray(record.candidates) || record.candidates.length < 2 || !record.expiresAt) {
        return json({ error: "invalid_facebook_selection" }, 400);
      }
      await this.state.storage.put(FACEBOOK_SELECTION_KEY, record);
      return json({ success: true });
    }

    if (url.pathname === "/facebook-selection/consume" && request.method === "POST") {
      const body = (await request.json()) as { selectionId?: string; pageId?: string };
      const record = await this.state.storage.get<FacebookSelectionRecord>(FACEBOOK_SELECTION_KEY);
      if (!record || !body.selectionId || !body.pageId || record.selectionId !== body.selectionId) {
        return json({ error: "invalid_facebook_selection" }, 403);
      }
      if (record.expiresAt <= Date.now()) {
        await this.state.storage.delete(FACEBOOK_SELECTION_KEY);
        return json({ error: "expired_facebook_selection" }, 410);
      }
      const candidate = record.candidates.find((item) => item.pageId === body.pageId);
      if (!candidate) return json({ error: "invalid_facebook_page" }, 400);
      await this.state.storage.delete(FACEBOOK_SELECTION_KEY);
      return json({ candidate, selection: record });
    }

    return json({ error: "not_found" }, 404);
  }
}
