/**
 * Minimal Cloudflare Durable Object storage surface used by the deduplicator.
 * Durable Object storage does not provide per-key expirationTtl like Workers KV,
 * so TTL is enforced explicitly through expiresAt plus an alarm-driven cleanup.
 */
export interface DurableObjectStorageLike {
  get<T = unknown>(key: string): Promise<T | undefined>;
  put<T = unknown>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<boolean>;
  list?<T = unknown>(options?: { prefix?: string }): Promise<Map<string, T>>;
  getAlarm?(): Promise<number | null>;
  setAlarm?(scheduledTimeMs: number): Promise<void>;
  deleteAlarm?(): Promise<void>;
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

const DEFAULT_TTL_SECONDS = 86400;
const DEFAULT_PENDING_LEASE_MS = 30000;
const EVENT_KEY_PREFIX = "event:";

function normalizeTtlSeconds(value: number | undefined): number {
  if (value === undefined) return DEFAULT_TTL_SECONDS;
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_TTL_SECONDS;
  return Math.max(1, Math.floor(value));
}

function normalizePendingLeaseMs(value: number | undefined): number {
  if (value === undefined) return DEFAULT_PENDING_LEASE_MS;
  if (!Number.isFinite(value) || value <= 0) return DEFAULT_PENDING_LEASE_MS;
  return Math.max(1, Math.floor(value));
}

/**
 * Cloudflare Durable Object for strong webhook deduplication and ACK coordination.
 * All events currently route through one named DO instance, which serializes state
 * transitions. TTL is logical (expiresAt) and stale records are reclaimed by alarms.
 */
export class InstagramWebhookDeduplicatorDO {
  private readonly state: DurableObjectStateLike;

  constructor(state: DurableObjectStateLike, _env?: unknown) {
    this.state = state;
  }

  private eventKey(eventId: string): string {
    return `${EVENT_KEY_PREFIX}${eventId}`;
  }

  private async scheduleCleanup(expiresAt: number): Promise<void> {
    const storage = this.state.storage;
    if (!storage.setAlarm) return;

    if (!storage.getAlarm) {
      await storage.setAlarm(expiresAt);
      return;
    }

    const currentAlarm = await storage.getAlarm();
    if (currentAlarm === null || expiresAt < currentAlarm) {
      await storage.setAlarm(expiresAt);
    }
  }

  private async getLiveRecord(key: string, now: number): Promise<EventStateRecord | undefined> {
    const existing = await this.state.storage.get<EventStateRecord>(key);
    if (!existing) return undefined;

    if (existing.expiresAt <= now) {
      await this.state.storage.delete(key);
      return undefined;
    }

    return existing;
  }

  /**
   * Atomic check-and-set for an incoming webhook event.
   * If the event has not been seen, has expired, or has an abandoned pending lease,
   * it is marked pending and accepted. Delivered or active-pending events are rejected.
   */
  async checkAndSet(
    eventId: string,
    ttlSeconds: number = DEFAULT_TTL_SECONDS,
    pendingLeaseMs: number = DEFAULT_PENDING_LEASE_MS
  ): Promise<CheckAndSetResult> {
    const key = this.eventKey(eventId);
    const now = Date.now();
    const normalizedTtl = normalizeTtlSeconds(ttlSeconds);
    const normalizedLease = normalizePendingLeaseMs(pendingLeaseMs);
    const existing = await this.getLiveRecord(key, now);

    if (existing) {
      if (existing.status === "delivered") {
        return { isNew: false, status: "duplicate" };
      }
      if (existing.status === "pending" && now - existing.createdAt < normalizedLease) {
        return { isNew: false, status: "pending_in_progress" };
      }
      // Pending lease expired without delivery confirmation: overwrite and recover.
    }

    const expiresAt = now + normalizedTtl * 1000;
    const record: EventStateRecord = {
      status: "pending",
      createdAt: now,
      expiresAt,
    };
    await this.state.storage.put(key, record);
    await this.scheduleCleanup(expiresAt);
    return { isNew: true, status: "new" };
  }

  /** Mark an event as successfully delivered downstream (for example, Queue enqueue). */
  async markDelivered(eventId: string, ttlSeconds: number = DEFAULT_TTL_SECONDS): Promise<void> {
    const key = this.eventKey(eventId);
    const now = Date.now();
    const normalizedTtl = normalizeTtlSeconds(ttlSeconds);
    const existing = await this.getLiveRecord(key, now);
    const expiresAt = now + normalizedTtl * 1000;

    const record: EventStateRecord = {
      status: "delivered",
      createdAt: existing?.createdAt ?? now,
      deliveredAt: now,
      expiresAt,
    };
    await this.state.storage.put(key, record);
    await this.scheduleCleanup(expiresAt);
  }

  /** Release pending status on downstream failure so Meta can retry immediately. */
  async releasePending(eventId: string): Promise<void> {
    await this.state.storage.delete(this.eventKey(eventId));
  }

  /** Check whether an event is still inside the deduplication window. */
  async isDuplicate(eventId: string, pendingLeaseMs: number = DEFAULT_PENDING_LEASE_MS): Promise<boolean> {
    const now = Date.now();
    const existing = await this.getLiveRecord(this.eventKey(eventId), now);
    if (!existing) return false;
    if (existing.status === "delivered") return true;
    return now - existing.createdAt < normalizePendingLeaseMs(pendingLeaseMs);
  }

  /**
   * Alarm-driven garbage collection. Durable Object storage has no native per-key TTL,
   * so expired records are deleted and the next alarm is scheduled for the earliest
   * remaining expiry.
   */
  async alarm(): Promise<void> {
    const storage = this.state.storage;
    if (!storage.list) return;

    const now = Date.now();
    const records = await storage.list<EventStateRecord>({ prefix: EVENT_KEY_PREFIX });
    let nextExpiry: number | null = null;

    for (const [key, record] of records.entries()) {
      if (!record || typeof record.expiresAt !== "number" || record.expiresAt <= now) {
        await storage.delete(key);
        continue;
      }
      if (nextExpiry === null || record.expiresAt < nextExpiry) {
        nextExpiry = record.expiresAt;
      }
    }

    if (nextExpiry !== null && storage.setAlarm) {
      await storage.setAlarm(nextExpiry);
    } else if (storage.deleteAlarm) {
      await storage.deleteAlarm();
    }
  }

  /** HTTP endpoint handler for DO RPC / fetch invocations. */
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
        const isDup = await this.isDuplicate(eventId, body.pendingLeaseMs);
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
