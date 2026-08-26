import { describe, it, expect, vi } from "vitest";
import {
  normalizeInstagramWebhook,
  verifyWebhookSignature,
  InMemoryEventDeduplicator,
  KVEventDeduplicator,
  isTimestampWithinReplayWindow,
  DefaultWebhookEventSink,
  type CloudflareKVLike,
} from "./webhook-normalizer.js";

describe("Instagram Webhook Normalizer", () => {
  it("normalizes direct message received event with full official metadata", () => {
    const rawPayload = {
      object: "instagram",
      entry: [
        {
          id: "1784140001",
          time: 1715000000,
          messaging: [
            {
              sender: { id: "igsid_123" },
              recipient: { id: "1784140001" },
              timestamp: 1715000001,
              message: {
                mid: "mid_999",
                text: "Hello Acellere!",
                is_deleted: false,
                is_self: false,
                is_unsupported: false,
                referral: { source: "ADS", ref: "campaign_1" },
              },
            },
          ],
        },
      ],
    };

    const normalized = normalizeInstagramWebhook(rawPayload);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].eventType).toBe("message_received");
    expect(normalized[0].id).toBe("mid_999");
    expect(normalized[0].senderId).toBe("igsid_123");
    expect(normalized[0].recipientId).toBe("1784140001");
    expect(normalized[0].payload.text).toBe("Hello Acellere!");
    expect(normalized[0].payload.is_deleted).toBe(false);
    expect(normalized[0].payload.is_self).toBe(false);
    expect(normalized[0].payload.is_unsupported).toBe(false);
    expect(normalized[0].payload.referral).toEqual({ source: "ADS", ref: "campaign_1" });
  });

  it("normalizes message_edited events", () => {
    const rawPayload = {
      object: "instagram",
      entry: [
        {
          id: "1784140001",
          time: 1715000000,
          messaging: [
            {
              sender: { id: "igsid_123" },
              recipient: { id: "1784140001" },
              timestamp: 1715000002,
              message_edit: {
                mid: "mid_edited_123",
                text: "Updated text message",
                num_edit: 1,
              },
            },
          ],
        },
      ],
    };

    const normalized = normalizeInstagramWebhook(rawPayload);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].eventType).toBe("message_edited");
    expect(normalized[0].id).toBe("mid_edited_123");
    expect(normalized[0].payload.text).toBe("Updated text message");
    expect(normalized[0].payload.num_edit).toBe(1);
  });

  it("normalizes comment and live comment events from changes array (Form 1)", () => {
    const rawPayload = {
      object: "instagram",
      entry: [
        {
          id: "1784140001",
          time: 1715000000,
          changes: [
            {
              field: "comments",
              value: {
                id: "comment_555",
                text: "Amazing post!",
                from: { id: "user_777", username: "fan123" },
              },
            },
            {
              field: "live_comments",
              value: {
                id: "live_comment_888",
                text: "Watching live!",
                from: { id: "user_999" },
              },
            },
          ],
        },
      ],
    };

    const normalized = normalizeInstagramWebhook(rawPayload);
    expect(normalized).toHaveLength(2);
    expect(normalized[0].eventType).toBe("comment_created");
    expect(normalized[0].id).toBe("comment_555");
    expect(normalized[1].eventType).toBe("live_comment");
    expect(normalized[1].id).toBe("live_comment_888");
  });

  it("normalizes comments sent directly on entry root (Form 2)", () => {
    const rawPayload = {
      object: "instagram",
      entry: [
        {
          id: "1784140001",
          time: 1715000000,
          field: "comments",
          value: {
            id: "comment_direct_form_2",
            text: "Direct entry comment format",
            from: { id: "user_888" },
          },
        },
      ],
    };

    const normalized = normalizeInstagramWebhook(rawPayload);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].eventType).toBe("comment_created");
    expect(normalized[0].id).toBe("comment_direct_form_2");
    expect(normalized[0].payload.text).toBe("Direct entry comment format");
  });

  it("normalizes standby, handover, and referral events", () => {
    const rawPayload = {
      object: "instagram",
      entry: [
        {
          id: "1784140001",
          time: 1715000000,
          messaging: [
            {
              sender: { id: "igsid_123" },
              recipient: { id: "1784140001" },
              timestamp: 1715000001,
              referral: {
                ref: "promo_summer_2026",
                source: "ADS",
              },
            },
            {
              sender: { id: "igsid_123" },
              recipient: { id: "1784140001" },
              pass_thread_control: {
                new_owner_app_id: "123456",
              },
            },
          ],
          standby: [
            {
              sender: { id: "igsid_123" },
              recipient: { id: "1784140001" },
              message: { text: "Standby message" },
            },
          ],
        },
      ],
    };

    const normalized = normalizeInstagramWebhook(rawPayload);
    expect(normalized).toHaveLength(3);
    expect(normalized[0].eventType).toBe("message_referral");
    expect(normalized[1].eventType).toBe("messaging_handover");
    expect(normalized[2].eventType).toBe("standby");
  });

  it("deduplicates events deterministically and handles dispatching with runtime replay check", async () => {
    const dedup = new InMemoryEventDeduplicator({ ttlMs: 60000 });
    expect(dedup.isDuplicate("event_1")).toBe(false);
    expect(dedup.isDuplicate("event_1")).toBe(true);
    expect(dedup.isDuplicate("event_2")).toBe(false);

    const now = Date.now();
    const sink = new DefaultWebhookEventSink(dedup);
    const result = await sink.dispatch([
      {
        id: "event_1",
        eventType: "message_received",
        timestamp: now,
        recipientId: "123",
        payload: {},
        raw: {},
      },
      {
        id: "event_3",
        eventType: "message_received",
        timestamp: now,
        recipientId: "123",
        payload: {},
        raw: {},
      },
      {
        id: "event_old_replay",
        eventType: "message_received",
        timestamp: now - 3 * 24 * 3600 * 1000, // 3 days old
        recipientId: "123",
        payload: {},
        raw: {},
      },
    ]);

    expect(result.dispatched).toBe(1);
    expect(result.ignoredDuplicates).toBe(1);
    expect(result.ignoredReplays).toBe(1);
  });

  it("supports KVEventDeduplicator with Cloudflare KV storage", async () => {
    const store = new Map<string, string>();
    const mockKv: CloudflareKVLike = {
      get: vi.fn(async (key: string) => store.get(key) ?? null),
      put: vi.fn(async (key: string, value: string) => {
        store.set(key, value);
      }),
    };

    const kvDedup = new KVEventDeduplicator(mockKv, 3600);
    expect(await kvDedup.isDuplicate("kv_event_1")).toBe(false);
    expect(await kvDedup.isDuplicate("kv_event_1")).toBe(true);
    expect(await kvDedup.isDuplicate("kv_event_2")).toBe(false);
  });

  it("checks replay window validity", () => {
    const now = 1715000000000;
    expect(isTimestampWithinReplayWindow(now - 1000, now)).toBe(true);
    expect(isTimestampWithinReplayWindow(now - 48 * 3600 * 1000, now)).toBe(false); // 48h old -> false
    expect(isTimestampWithinReplayWindow(now + 10 * 60 * 1000, now)).toBe(false); // 10 min in future -> false
  });

  it("verifies valid HMAC-SHA256 signature", async () => {
    const secret = "test_app_secret_123";
    const body = '{"object":"instagram"}';

    // Compute signature for test
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signatureBuf = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
    const hex = Array.from(new Uint8Array(signatureBuf))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    const isValid = await verifyWebhookSignature(body, `sha256=${hex}`, secret);
    expect(isValid).toBe(true);

    const isInvalid = await verifyWebhookSignature(body, "sha256=wrong_signature", secret);
    expect(isInvalid).toBe(false);
  });
});
