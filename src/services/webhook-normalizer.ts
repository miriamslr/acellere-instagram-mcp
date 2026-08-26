export interface NormalizedWebhookEvent {
  id: string;
  eventType:
    | "message_received"
    | "message_reaction"
    | "message_seen"
    | "message_postback"
    | "comment_created"
    | "mention_received"
    | "story_insight"
    | "unknown";
  timestamp: number;
  recipientId: string;
  senderId?: string;
  payload: Record<string, unknown>;
  raw: unknown;
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

    // 1. Check messaging events (Direct Messages, Reactions, Postbacks, Seen)
    if (Array.isArray(entry.messaging)) {
      for (const msgItem of entry.messaging) {
        if (!msgItem || typeof msgItem !== "object") continue;
        const msg = msgItem as Record<string, unknown>;
        const senderId = (msg.sender as { id?: string })?.id;
        const recipientId = (msg.recipient as { id?: string })?.id ?? entryId;
        const timestamp = typeof msg.timestamp === "number" ? msg.timestamp : entryTime;

        if (msg.message) {
          const msgDetails = msg.message as Record<string, unknown>;
          normalized.push({
            id: String(msgDetails.mid ?? `${entryId}_${timestamp}`),
            eventType: "message_received",
            timestamp,
            recipientId,
            senderId,
            payload: {
              mid: msgDetails.mid,
              text: msgDetails.text,
              attachments: msgDetails.attachments,
              quick_reply: msgDetails.quick_reply,
              is_echo: msgDetails.is_echo ?? false,
              reply_to: msgDetails.reply_to,
            },
            raw: msgItem,
          });
        } else if (msg.reaction) {
          const reactionDetails = msg.reaction as Record<string, unknown>;
          normalized.push({
            id: `${reactionDetails.mid}_${reactionDetails.action ?? "react"}`,
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
            id: `${entryId}_${timestamp}_postback`,
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
            id: `${entryId}_${timestamp}_seen`,
            eventType: "message_seen",
            timestamp,
            recipientId,
            senderId,
            payload: readDetails,
            raw: msgItem,
          });
        }
      }
    }

    // 2. Check changes events (comments, mentions, story_insights)
    if (Array.isArray(entry.changes)) {
      for (const changeItem of entry.changes) {
        if (!changeItem || typeof changeItem !== "object") continue;
        const change = changeItem as Record<string, unknown>;
        const field = String(change.field ?? "");
        const value = (change.value ?? {}) as Record<string, unknown>;

        if (field === "comments") {
          normalized.push({
            id: String(value.id ?? `${entryId}_${entryTime}`),
            eventType: "comment_created",
            timestamp: entryTime,
            recipientId: entryId,
            senderId: (value.from as { id?: string })?.id,
            payload: value,
            raw: changeItem,
          });
        } else if (field === "mentions") {
          normalized.push({
            id: String(value.comment_id ?? value.media_id ?? `${entryId}_${entryTime}`),
            eventType: "mention_received",
            timestamp: entryTime,
            recipientId: entryId,
            payload: value,
            raw: changeItem,
          });
        } else if (field === "story_insights") {
          normalized.push({
            id: String(value.media_id ?? `${entryId}_${entryTime}`),
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
