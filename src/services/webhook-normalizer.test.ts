import { describe, it, expect } from "vitest";
import {
  normalizeInstagramWebhook,
  verifyWebhookSignature,
  InMemoryEventDeduplicator,
  isTimestampWithinReplayWindow,
  DefaultWebhookEventSink,
} from "./webhook-normalizer.js";

describe("Instagram Webhook Normalizer", () => {
  it("normalizes direct message received event", () => {
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
  });

  it("normalizes comment and live comment events", () => {
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

  it("deduplicates events deterministically and handles dispatching", async () => {
    const dedup = new InMemoryEventDeduplicator({ ttlMs: 60000 });
    expect(dedup.isDuplicate("event_1")).toBe(false);
    expect(dedup.isDuplicate("event_1")).toBe(true);
    expect(dedup.isDuplicate("event_2")).toBe(false);

    const sink = new DefaultWebhookEventSink(dedup);
    const result = await sink.dispatch([
      {
        id: "event_1",
        eventType: "message_received",
        timestamp: Date.now(),
        recipientId: "123",
        payload: {},
        raw: {},
      },
      {
        id: "event_3",
        eventType: "message_received",
        timestamp: Date.now(),
        recipientId: "123",
        payload: {},
        raw: {},
      },
    ]);

    expect(result.dispatched).toBe(1);
    expect(result.ignoredDuplicates).toBe(1);
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
