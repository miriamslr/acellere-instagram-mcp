/**
 * Cloudflare Durable Object State Storage Interface for transactional operations
 */
export interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<boolean>;
  deleteAll?(): Promise<void>;
}

export interface DurableObjectStateLike {
  storage: DurableObjectStorageLike;
  id: { toString(): string; name?: string };
  waitUntil?(promise: Promise<unknown>): void;
}

export interface EventStateRecord {
  status: "pending" | "delivered";
  createdAt: number;
  deliveredAt?: number;
  expiresAt: number;
}

export interface CheckAndSetResult {
  isNew: boolean;
  status: "new" | "duplicate" | "pending_in_progress";
}

/**
 * Cloudflare Durable Object for strong atomic webhook deduplication and ACK coordination.
 * Serializes all check-and-set and delivery state transitions with strong consistency.
 */
export class InstagramWebhookDeduplicatorDO {
  private readonly state: DurableObjectStateLike;

  constructor(state: DurableObjectStateLike, _env?: unknown) {
    this.state = state;
  }

  /**
   * Atomic check-and-set for an incoming webhook event.
   * If the event is not seen (or has an expired pending lease), marks as 'pending' and returns isNew: true.
   * If already delivered or active pending, returns isNew: false.
   */
  async checkAndSet(
    eventId: string,
    ttlSeconds: number = 86400,
    pendingLeaseMs: number = 30000
  ): Promise<CheckAndSetResult> {
    const key = `event:${eventId}`;
    const now = Date.now();
    const existing = await this.state.storage.get<EventStateRecord>(key);

    if (existing) {
      if (existing.status === "delivered") {
        return { isNew: false, status: "duplicate" };
      }
      if (existing.status === "pending") {
        if (now - existing.createdAt < pendingLeaseMs) {
          return { isNew: false, status: "pending_in_progress" };
        }
        // Pending lease expired without delivery confirmation: allow recovery
      }
    }

    const record: EventStateRecord = {
      status: "pending",
      createdAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };
    await this.state.storage.put(key, record, { expirationTtl: ttlSeconds });
    return { isNew: true, status: "new" };
  }

  /**
   * Mark event as successfully delivered downstream (e.g. enqueued to Queue).
   */
  async markDelivered(eventId: string, ttlSeconds: number = 86400): Promise<void> {
    const key = `event:${eventId}`;
    const now = Date.now();
    const existing = await this.state.storage.get<EventStateRecord>(key);
    const createdAt = existing?.createdAt ?? now;

    const record: EventStateRecord = {
      status: "delivered",
      createdAt,
      deliveredAt: now,
      expiresAt: now + ttlSeconds * 1000,
    };
    await this.state.storage.put(key, record, { expirationTtl: ttlSeconds });
  }

  /**
   * Release pending status on failure so Meta can retry and succeed immediately.
   */
  async releasePending(eventId: string): Promise<void> {
    const key = `event:${eventId}`;
    await this.state.storage.delete(key);
  }

  /**
   * Check if event was already delivered or is currently pending.
   */
  async isDuplicate(eventId: string): Promise<boolean> {
    const key = `event:${eventId}`;
    const existing = await this.state.storage.get<EventStateRecord>(key);
    if (!existing) return false;
    if (existing.status === "delivered") return true;
    if (existing.status === "pending") {
      return Date.now() - existing.createdAt < 30000;
    }
    return false;
  }

  /**
   * HTTP endpoint handler for DO RPC / fetch invocations.
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST") {
      const body = (await request.json().catch(() => ({}))) as {
        eventId?: string;
        ttlSeconds?: number;
        pendingLeaseMs?: number;
      };
      const eventId = body.eventId;
      if (!eventId) {
        return new Response(JSON.stringify({ error: "eventId is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/check-and-set") {
        const result = await this.checkAndSet(eventId, body.ttlSeconds, body.pendingLeaseMs);
        return new Response(JSON.stringify(result), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/mark-delivered") {
        await this.markDelivered(eventId, body.ttlSeconds);
        return new Response(JSON.stringify({ success: true, eventId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/release-pending") {
        await this.releasePending(eventId);
        return new Response(JSON.stringify({ success: true, eventId, released: true }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }

      if (url.pathname === "/is-duplicate") {
        const isDup = await this.isDuplicate(eventId);
        return new Response(JSON.stringify({ isDuplicate: isDup, eventId }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
}
