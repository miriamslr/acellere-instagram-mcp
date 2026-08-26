export type NormalizedEventType =
  | "message_received"
  | "message_edited"
  | "message_echo"
  | "message_reaction"
  | "message_seen"
  | "message_postback"
  | "message_referral"
  | "messaging_handover"
  | "standby"
  | "comment_created"
  | "live_comment"
  | "mention_received"
  | "story_insight"
  | "unknown";

export interface NormalizedWebhookEvent {
  id: string;
  eventType: NormalizedEventType;
  timestamp: number;
  recipientId: string;
  senderId?: string;
  payload: Record<string, unknown>;
  raw: unknown;
}

export interface WebhookDispatchResult {
  dispatched: number;
  ignoredDuplicates: number;
  ignoredReplays: number;
  errors?: string[];
}

export interface WebhookEventDeduplicator {
  isDuplicate(id: string, now?: number): boolean | Promise<boolean>;
}

export class InMemoryEventDeduplicator implements WebhookEventDeduplicator {
  private readonly seen = new Map<string, number>();
  private readonly ttlMs: number;
  private readonly maxEntries: number;

  constructor(options?: { ttlMs?: number; maxEntries?: number }) {
    this.ttlMs = options?.ttlMs ?? 3600 * 1000; // 1 hour default
    this.maxEntries = options?.maxEntries ?? 10000;
  }

  public isDuplicate(id: string, now: number = Date.now()): boolean {
    this.cleanup(now);
    const existing = this.seen.get(id);
    if (existing && now - existing < this.ttlMs) {
      return true;
    }
    if (this.seen.size >= this.maxEntries) {
      const oldestKey = this.seen.keys().next().value;
      if (oldestKey) this.seen.delete(oldestKey);
    }
    this.seen.set(id, now);
    return false;
  }

  private cleanup(now: number): void {
    if (this.seen.size < 100) return;
    for (const [id, time] of this.seen.entries()) {
      if (now - time > this.ttlMs) {
        this.seen.delete(id);
      }
    }
  }

  public clear(): void {
    this.seen.clear();
  }
}

export interface CloudflareKVLike {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

export class KVEventDeduplicator implements WebhookEventDeduplicator {
  private readonly kv: CloudflareKVLike;
  private readonly ttlSeconds: number;
  private readonly fallbackMemory: InMemoryEventDeduplicator;

  constructor(kv: CloudflareKVLike, ttlSeconds: number = 3600) {
    this.kv = kv;
    this.ttlSeconds = ttlSeconds;
    this.fallbackMemory = new InMemoryEventDeduplicator({ ttlMs: ttlSeconds * 1000 });
  }

  public async isDuplicate(id: string, now: number = Date.now()): Promise<boolean> {
    try {
      const key = `webhook_dedup:${id}`;
      const existing = await this.kv.get(key);
      if (existing !== null) {
        return true;
      }
      await this.kv.put(key, String(now), { expirationTtl: this.ttlSeconds });
      return false;
    } catch {
      // Graceful fallback to memory on KV failure
      return this.fallbackMemory.isDuplicate(id, now);
    }
  }
}

export interface InstagramWebhookEventSink {
  dispatch(events: NormalizedWebhookEvent[]): Promise<WebhookDispatchResult>;
}

/**
 * Validate that an event timestamp is within a safe replay window (e.g. not older than 24h, not >5 min in future).
 */
export function isTimestampWithinReplayWindow(
  timestampMs: number,
  nowMs: number = Date.now(),
  maxAgeMs: number = 24 * 3600 * 1000,
  maxFutureSkewMs: number = 5 * 60 * 1000
): boolean {
  if (timestampMs < nowMs - maxAgeMs) return false;
  if (timestampMs > nowMs + maxFutureSkewMs) return false;
  return true;
}

export class DefaultWebhookEventSink implements InstagramWebhookEventSink {
  private readonly deduplicator: WebhookEventDeduplicator;
  private readonly maxAgeMs: number;
  private readonly maxFutureSkewMs: number;

  constructor(
    deduplicator?: WebhookEventDeduplicator,
    options?: { maxAgeMs?: number; maxFutureSkewMs?: number }
  ) {
    this.deduplicator = deduplicator ?? new InMemoryEventDeduplicator();
    this.maxAgeMs = options?.maxAgeMs ?? 24 * 3600 * 1000;
    this.maxFutureSkewMs = options?.maxFutureSkewMs ?? 5 * 60 * 1000;
  }

  public async dispatch(events: NormalizedWebhookEvent[]): Promise<WebhookDispatchResult> {
    let dispatched = 0;
    let ignoredDuplicates = 0;
    let ignoredReplays = 0;

    const now = Date.now();

    for (const event of events) {
      const eventTs = event.timestamp < 1e11 ? event.timestamp * 1000 : event.timestamp;
      if (!isTimestampWithinReplayWindow(eventTs, now, this.maxAgeMs, this.maxFutureSkewMs)) {
        ignoredReplays++;
        continue;
      }

      const isDup = await this.deduplicator.isDuplicate(event.id, now);
      if (isDup) {
        ignoredDuplicates++;
        continue;
      }

      dispatched++;
    }

    return { dispatched, ignoredDuplicates, ignoredReplays };
  }
}

export function normalizeInstagramWebhook(body: unknown): NormalizedWebhookEvent[] {
  if (!body || typeof body !== "object") return [];

  const rawObj = body as { object?: string; entry?: unknown[] };
  if (!Array.isArray(rawObj.entry)) return [];

  const normalized: NormalizedWebhookEvent[] = [];

  for (const entryItem of rawObj.entry) {
    if (!entryItem || typeof entryItem !== "object") continue;
    const entry = entryItem as Record<string, unknown>;
    const entryId = String(entry.id ?? "");
    const entryTime = typeof entry.time === "number" ? entry.time : Date.now();

    // 1. Messaging events (Direct Messages, Edits, Reactions, Postbacks, Seen, Referrals, Handover)
    if (Array.isArray(entry.messaging)) {
      for (const msgItem of entry.messaging) {
        if (!msgItem || typeof msgItem !== "object") continue;
        const msg = msgItem as Record<string, unknown>;
        const senderId = (msg.sender as { id?: string })?.id;
        const recipientId = (msg.recipient as { id?: string })?.id ?? entryId;
        const timestamp = typeof msg.timestamp === "number" ? msg.timestamp : entryTime;

        if (msg.message_edit) {
          const editDetails = msg.message_edit as Record<string, unknown>;
          const numEdit = typeof editDetails.num_edit === "number" ? editDetails.num_edit : 1;
          const id = editDetails.mid
            ? `${editDetails.mid}:edit:${numEdit}`
            : `${entryId}_${timestamp}_edit_${numEdit}`;
          normalized.push({
            id,
            eventType: "message_edited",
            timestamp,
            recipientId,
            senderId,
            payload: {
              mid: editDetails.mid,
              text: editDetails.text,
              num_edit: numEdit,
            },
            raw: msgItem,
          });
        } else if (msg.message) {
          const msgDetails = msg.message as Record<string, unknown>;
          const isEcho = Boolean(msgDetails.is_echo);
          const isDeleted = Boolean(msgDetails.is_deleted);
          const isSelf = Boolean(msgDetails.is_self);
          const isUnsupported = Boolean(msgDetails.is_unsupported);
          const numEdit = msgDetails.num_edit as number | undefined;

          if (numEdit !== undefined && numEdit > 0) {
            normalized.push({
              id: msgDetails.mid
                ? `${msgDetails.mid}:edit:${numEdit}`
                : `${entryId}_${timestamp}_edit_${numEdit}`,
              eventType: "message_edited",
              timestamp,
              recipientId,
              senderId,
              payload: {
                mid: msgDetails.mid,
                text: msgDetails.text,
                num_edit: numEdit,
                is_echo: isEcho,
                is_deleted: isDeleted,
                is_self: isSelf,
                is_unsupported: isUnsupported,
              },
              raw: msgItem,
            });
          } else {
            normalized.push({
              id: String(msgDetails.mid ?? `${entryId}_${timestamp}`),
              eventType: isEcho ? "message_echo" : "message_received",
              timestamp,
              recipientId,
              senderId,
              payload: {
                mid: msgDetails.mid,
                text: msgDetails.text,
                attachments: msgDetails.attachments,
                quick_reply: msgDetails.quick_reply,
                is_echo: isEcho,
                is_deleted: isDeleted,
                is_self: isSelf,
                is_unsupported: isUnsupported,
                referral: msgDetails.referral,
                reply_to: msgDetails.reply_to,
                commands: msgDetails.commands,
                shares: msgDetails.shares,
              },
              raw: msgItem,
            });
          }
        } else if (msg.reaction) {
          const reactionDetails = msg.reaction as Record<string, unknown>;
          normalized.push({
            id: `${reactionDetails.mid}_${reactionDetails.action ?? "react"}_${timestamp}`,
            eventType: "message_reaction",
            timestamp,
            recipientId,
            senderId,
            payload: reactionDetails,
            raw: msgItem,
          });
        } else if (msg.postback) {
          const postbackDetails = msg.postback as Record<string, unknown>;
          normalized.push({
            id: `${entryId}_${timestamp}_postback_${postbackDetails.payload ?? ""}`,
            eventType: "message_postback",
            timestamp,
            recipientId,
            senderId,
            payload: postbackDetails,
            raw: msgItem,
          });
        } else if (msg.read) {
          const readDetails = msg.read as Record<string, unknown>;
          normalized.push({
            id: `${entryId}_${senderId ?? "user"}_seen_${readDetails.watermark ?? timestamp}`,
            eventType: "message_seen",
            timestamp,
            recipientId,
            senderId,
            payload: readDetails,
            raw: msgItem,
          });
        } else if (msg.referral) {
          const referralDetails = msg.referral as Record<string, unknown>;
          normalized.push({
            id: `${entryId}_${timestamp}_referral_${referralDetails.ref ?? ""}`,
            eventType: "message_referral",
            timestamp,
            recipientId,
            senderId,
            payload: referralDetails,
            raw: msgItem,
          });
        } else if (msg.pass_thread_control || msg.take_thread_control || msg.request_thread_control) {
          normalized.push({
            id: `${entryId}_${timestamp}_handover`,
            eventType: "messaging_handover",
            timestamp,
            recipientId,
            senderId,
            payload: msg,
            raw: msgItem,
          });
        }
      }
    }

    // 2. Standby events (when app is in standby in Handover protocol)
    if (Array.isArray(entry.standby)) {
      for (const standbyItem of entry.standby) {
        if (!standbyItem || typeof standbyItem !== "object") continue;
        const s = standbyItem as Record<string, unknown>;
        normalized.push({
          id: `${entryId}_${entryTime}_standby`,
          eventType: "standby",
          timestamp: entryTime,
          recipientId: entryId,
          payload: s,
          raw: standbyItem,
        });
      }
    }

    // 3. Changes events (Form 1: entry.changes[]; Form 2: direct entry.field & entry.value)
    const collectedChanges: Array<{ field: string; value: Record<string, unknown>; raw: unknown }> = [];

    if (Array.isArray(entry.changes)) {
      for (const changeItem of entry.changes) {
        if (!changeItem || typeof changeItem !== "object") continue;
        const change = changeItem as Record<string, unknown>;
        collectedChanges.push({
          field: String(change.field ?? ""),
          value: (change.value ?? {}) as Record<string, unknown>,
          raw: changeItem,
        });
      }
    } else if (entry.field !== undefined && entry.value !== undefined) {
      collectedChanges.push({
        field: String(entry.field),
        value: (entry.value ?? {}) as Record<string, unknown>,
        raw: entryItem,
      });
    }

    for (const { field, value, raw } of collectedChanges) {
      if (field === "comments") {
        normalized.push({
          id: String(value.id ?? `${entryId}_${entryTime}_comment`),
          eventType: "comment_created",
          timestamp: entryTime,
          recipientId: entryId,
          senderId: (value.from as { id?: string })?.id,
          payload: value,
          raw,
        });
      } else if (field === "live_comments") {
        normalized.push({
          id: String(value.id ?? `${entryId}_${entryTime}_live_comment`),
          eventType: "live_comment",
          timestamp: entryTime,
          recipientId: entryId,
          senderId: (value.from as { id?: string })?.id,
          payload: value,
          raw,
        });
      } else if (field === "mentions") {
        normalized.push({
          id: String(value.comment_id ?? value.media_id ?? `${entryId}_${entryTime}_mention`),
          eventType: "mention_received",
          timestamp: entryTime,
          recipientId: entryId,
          payload: value,
          raw,
        });
      } else if (field === "story_insights") {
        normalized.push({
          id: String(value.media_id ?? `${entryId}_${entryTime}_story_insight`),
          eventType: "story_insight",
          timestamp: entryTime,
          recipientId: entryId,
          payload: value,
          raw,
        });
      } else {
        normalized.push({
          id: `${entryId}_${field}_${entryTime}`,
          eventType: "unknown",
          timestamp: entryTime,
          recipientId: entryId,
          payload: { field, value },
          raw,
        });
      }
    }
  }

  return normalized;
}

/**
 * Verify HMAC-SHA256 signature from X-Hub-Signature-256 header.
 */
export async function verifyWebhookSignature(
  rawBody: string,
  signatureHeader: string | null | undefined,
  appSecret: string
): Promise<boolean> {
  if (!signatureHeader || !appSecret) return false;

  const expectedPrefix = "sha256=";
  if (!signatureHeader.startsWith(expectedPrefix)) return false;
  const signatureHex = signatureHeader.slice(expectedPrefix.length);

  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(appSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signedBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(rawBody));
    const signedHex = Array.from(new Uint8Array(signedBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return signedHex.toLowerCase() === signatureHex.toLowerCase();
  } catch {
    return false;
  }
}
