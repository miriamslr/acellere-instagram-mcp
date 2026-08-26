export type NormalizedEventType =
  | "message_received"
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
  errors?: string[];
}

export interface InstagramWebhookEventSink {
  dispatch(events: NormalizedWebhookEvent[]): Promise<WebhookDispatchResult>;
}

export class InMemoryEventDeduplicator {
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

export class DefaultWebhookEventSink implements InstagramWebhookEventSink {
  private readonly deduplicator: InMemoryEventDeduplicator;

  constructor(deduplicator?: InMemoryEventDeduplicator) {
    this.deduplicator = deduplicator ?? new InMemoryEventDeduplicator();
  }

  public async dispatch(events: NormalizedWebhookEvent[]): Promise<WebhookDispatchResult> {
    let dispatched = 0;
    let ignoredDuplicates = 0;

    for (const event of events) {
      if (this.deduplicator.isDuplicate(event.id)) {
        ignoredDuplicates++;
        continue;
      }
      dispatched++;
    }

    return { dispatched, ignoredDuplicates };
  }
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

    // 1. Messaging events (Direct Messages, Reactions, Postbacks, Seen, Referrals, Handover)
    if (Array.isArray(entry.messaging)) {
      for (const msgItem of entry.messaging) {
        if (!msgItem || typeof msgItem !== "object") continue;
        const msg = msgItem as Record<string, unknown>;
        const senderId = (msg.sender as { id?: string })?.id;
        const recipientId = (msg.recipient as { id?: string })?.id ?? entryId;
        const timestamp = typeof msg.timestamp === "number" ? msg.timestamp : entryTime;

        if (msg.message) {
          const msgDetails = msg.message as Record<string, unknown>;
          const isEcho = Boolean(msgDetails.is_echo);
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
              reply_to: msgDetails.reply_to,
            },
            raw: msgItem,
          });
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

    // 3. Changes events (comments, live comments, mentions, story_insights)
    if (Array.isArray(entry.changes)) {
      for (const changeItem of entry.changes) {
        if (!changeItem || typeof changeItem !== "object") continue;
        const change = changeItem as Record<string, unknown>;
        const field = String(change.field ?? "");
        const value = (change.value ?? {}) as Record<string, unknown>;

        if (field === "comments") {
          normalized.push({
            id: String(value.id ?? `${entryId}_${entryTime}_comment`),
            eventType: "comment_created",
            timestamp: entryTime,
            recipientId: entryId,
            senderId: (value.from as { id?: string })?.id,
            payload: value,
            raw: changeItem,
          });
        } else if (field === "live_comments") {
          normalized.push({
            id: String(value.id ?? `${entryId}_${entryTime}_live_comment`),
            eventType: "live_comment",
            timestamp: entryTime,
            recipientId: entryId,
            senderId: (value.from as { id?: string })?.id,
            payload: value,
            raw: changeItem,
          });
        } else if (field === "mentions") {
          normalized.push({
            id: String(value.comment_id ?? value.media_id ?? `${entryId}_${entryTime}_mention`),
            eventType: "mention_received",
            timestamp: entryTime,
            recipientId: entryId,
            payload: value,
            raw: changeItem,
          });
        } else if (field === "story_insights") {
          normalized.push({
            id: String(value.media_id ?? `${entryId}_${entryTime}_story_insight`),
            eventType: "story_insight",
            timestamp: entryTime,
            recipientId: entryId,
            payload: value,
            raw: changeItem,
          });
        } else {
          normalized.push({
            id: `${entryId}_${field}_${entryTime}`,
            eventType: "unknown",
            timestamp: entryTime,
            recipientId: entryId,
            payload: { field, value },
            raw: changeItem,
          });
        }
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
