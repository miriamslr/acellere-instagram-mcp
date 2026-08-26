import { describe, it, expect } from "vitest";
import { normalizeInstagramWebhook, verifyWebhookSignature } from "./webhook-normalizer.js";

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

  it("normalizes comment created event", () => {
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
          ],
        },
      ],
    };

    const normalized = normalizeInstagramWebhook(rawPayload);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].eventType).toBe("comment_created");
    expect(normalized[0].id).toBe("comment_555");
    expect(normalized[0].senderId).toBe("user_777");
    expect(normalized[0].payload.text).toBe("Amazing post!");
  });

  it("normalizes mention received event", () => {
    const rawPayload = {
      object: "instagram",
      entry: [
        {
          id: "1784140001",
          time: 1715000000,
          changes: [
            {
              field: "mentions",
              value: {
                comment_id: "comment_mention_888",
                media_id: "media_444",
              },
            },
          ],
        },
      ],
    };

    const normalized = normalizeInstagramWebhook(rawPayload);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].eventType).toBe("mention_received");
    expect(normalized[0].id).toBe("comment_mention_888");
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
