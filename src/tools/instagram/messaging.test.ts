import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerIgMessagingTools } from "./messaging.js";
import { MetaClient } from "../../services/meta-client.js";
import { AcellereMetaClient } from "../../services/acellere-meta-client.js";
import { makeMockServer, type MockServer } from "../test-utils.js";

function makeMockClient(overrides?: Partial<MetaClient>): MetaClient {
  return {
    igUserId: "123",
    igConversationsTargetId: "123",
    ig: vi.fn(async () => ({
      data: { data: [] },
      rateLimit: undefined,
    })),
    ...overrides,
  } as unknown as MetaClient;
}

describe("ig_get_conversations fields override", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgMessagingTools(server as never, client);
  });

  it("uses schema default fields when fields is omitted", async () => {
    await server.callTool("ig_get_conversations", {});

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe("/123/conversations");
    expect(call[2]).toEqual({
      platform: "instagram",
      fields: "id,updated_time,participants,messages{id,message,from,created_time}",
    });
  });

  it("passes through caller-provided fields verbatim", async () => {
    await server.callTool("ig_get_conversations", { fields: "id,updated_time" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({
      platform: "instagram",
      fields: "id,updated_time",
    });
  });
});

describe("ig_get_messages fields override", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgMessagingTools(server as never, client);
  });

  it("uses schema default fields when fields is omitted", async () => {
    await server.callTool("ig_get_messages", { conversation_id: "conv_1" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe("/conv_1/messages");
    expect(call[2]).toEqual({
      fields: "id,message,from,created_time,attachments",
    });
  });

  it("passes through caller-provided fields verbatim", async () => {
    await server.callTool("ig_get_messages", { conversation_id: "conv_2", fields: "id,message" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ fields: "id,message" });
  });
});

describe("ig_get_message fields override", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgMessagingTools(server as never, client);
  });

  it("uses schema default fields when fields is omitted", async () => {
    await server.callTool("ig_get_message", { message_id: "msg_1" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[1]).toBe("/msg_1");
    expect(call[2]).toEqual({
      fields: "id,message,from,created_time,attachments",
    });
  });

  it("passes through caller-provided fields verbatim", async () => {
    await server.callTool("ig_get_message", { message_id: "msg_2", fields: "id,message,reply_to" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toEqual({ fields: "id,message,reply_to" });
  });
});

describe("ig_get_conversations pagination cursors", () => {
  let server: ReturnType<typeof makeMockServer>;
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgMessagingTools(server as never, client);
  });

  it("omits both cursors when neither is provided", async () => {
    await server.callTool("ig_get_conversations", {});

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).not.toHaveProperty("after");
    expect(call[2]).not.toHaveProperty("before");
  });

  it("forwards before cursor when provided alone", async () => {
    await server.callTool("ig_get_conversations", { before: "cursor-prev" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ before: "cursor-prev" });
    expect(call[2]).not.toHaveProperty("after");
  });

  it("forwards both cursors when both are provided", async () => {
    await server.callTool("ig_get_conversations", { after: "cursor-next", before: "cursor-prev" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ after: "cursor-next", before: "cursor-prev" });
  });
});

describe("ig_get_messages pagination cursors", () => {
  let server: ReturnType<typeof makeMockServer>;
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgMessagingTools(server as never, client);
  });

  it("omits both cursors when neither is provided", async () => {
    await server.callTool("ig_get_messages", { conversation_id: "conv_1" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).not.toHaveProperty("after");
    expect(call[2]).not.toHaveProperty("before");
  });

  it("forwards before cursor when provided alone", async () => {
    await server.callTool("ig_get_messages", { conversation_id: "conv_1", before: "cursor-prev" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ before: "cursor-prev" });
    expect(call[2]).not.toHaveProperty("after");
  });

  it("forwards both cursors when both are provided", async () => {
    await server.callTool("ig_get_messages", { conversation_id: "conv_1", after: "cursor-next", before: "cursor-prev" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2]).toMatchObject({ after: "cursor-next", before: "cursor-prev" });
  });
});

describe("ig_send_message messaging_type and tag", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgMessagingTools(server as never, client);
  });

  it("defaults messaging_type to RESPONSE and omits tag", async () => {
    await server.callTool("ig_send_message", { recipient_id: "user_1", message: "hello" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("POST");
    expect(call[1]).toBe("/123/messages");
    expect(call[2]).toBeUndefined();
    expect(call[3].jsonBody).toEqual({
      recipient: { id: "user_1" },
      message: { text: "hello" },
      messaging_type: "RESPONSE",
    });
    expect(call[3].jsonBody).not.toHaveProperty("tag");
  });

  it("forwards explicit messaging_type=UPDATE without a tag", async () => {
    await server.callTool("ig_send_message", {
      recipient_id: "user_1",
      message: "shipping update",
      messaging_type: "UPDATE",
    });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].jsonBody.messaging_type).toBe("UPDATE");
    expect(call[3].jsonBody).not.toHaveProperty("tag");
  });

  it("forwards MESSAGE_TAG + HUMAN_AGENT for the 7-day window", async () => {
    await server.callTool("ig_send_message", {
      recipient_id: "user_1",
      message: "support follow-up",
      messaging_type: "MESSAGE_TAG",
      tag: "HUMAN_AGENT",
    });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].jsonBody).toEqual({
      recipient: { id: "user_1" },
      message: { text: "support follow-up" },
      messaging_type: "MESSAGE_TAG",
      tag: "HUMAN_AGENT",
    });
  });

  it.each([
    "CONFIRMED_EVENT_UPDATE",
    "POST_PURCHASE_UPDATE",
    "ACCOUNT_UPDATE",
    "CUSTOMER_FEEDBACK",
  ] as const)("accepts %s tag via MESSAGE_TAG", async (tag) => {
    await server.callTool("ig_send_message", {
      recipient_id: "user_1",
      message: "tagged",
      messaging_type: "MESSAGE_TAG",
      tag,
    });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].jsonBody.messaging_type).toBe("MESSAGE_TAG");
    expect(call[3].jsonBody.tag).toBe(tag);
  });

  it("rejects MESSAGE_TAG without a tag and skips the API call", async () => {
    const result = await server.callTool("ig_send_message", {
      recipient_id: "user_1",
      message: "missing tag",
      messaging_type: "MESSAGE_TAG",
    }) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error_type).toBe("validation");
    expect(payload.message).toMatch(/messaging_type=MESSAGE_TAG requires a tag/);
    expect(client.ig).not.toHaveBeenCalled();
  });

  it("rejects tag when messaging_type defaults to RESPONSE", async () => {
    const result = await server.callTool("ig_send_message", {
      recipient_id: "user_1",
      message: "stray tag",
      tag: "HUMAN_AGENT",
    }) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error_type).toBe("validation");
    expect(payload.message).toMatch(/tag is only valid when messaging_type=MESSAGE_TAG/);
    expect(client.ig).not.toHaveBeenCalled();
  });

  it("rejects tag when messaging_type is explicit UPDATE", async () => {
    const result = await server.callTool("ig_send_message", {
      recipient_id: "user_1",
      message: "stray tag with UPDATE",
      messaging_type: "UPDATE",
      tag: "HUMAN_AGENT",
    }) as { isError?: boolean; content: { text: string }[] };

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.error_type).toBe("validation");
    expect(payload.message).toMatch(/tag is only valid when messaging_type=MESSAGE_TAG/);
    expect(client.ig).not.toHaveBeenCalled();
  });

  it("rejects unknown tag values via the Zod enum", async () => {
    await expect(
      server.callTool("ig_send_message", {
        recipient_id: "user_1",
        message: "bad tag",
        messaging_type: "MESSAGE_TAG",
        tag: "NOT_A_REAL_TAG",
      })
    ).rejects.toThrow();
    expect(client.ig).not.toHaveBeenCalled();
  });
});

describe("ig_send_message message length validation", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgMessagingTools(server as never, client);
  });

  it("accepts an ASCII message at the 1000-byte boundary", async () => {
    await expect(
      server.callTool("ig_send_message", { recipient_id: "u_1", message: "a".repeat(1000) })
    ).resolves.toBeDefined();
  });

  it("rejects an ASCII message exceeding 1000 bytes", async () => {
    await expect(
      server.callTool("ig_send_message", { recipient_id: "u_1", message: "a".repeat(1001) })
    ).rejects.toThrow();
    expect(client.ig).not.toHaveBeenCalled();
  });

  it("rejects an empty message", async () => {
    await expect(
      server.callTool("ig_send_message", { recipient_id: "u_1", message: "" })
    ).rejects.toThrow();
    expect(client.ig).not.toHaveBeenCalled();
  });

  it("rejects a multibyte string under 1000 chars but over 1000 bytes", async () => {
    // "😀" encodes to 4 UTF-8 bytes; 251 copies = 1004 bytes from only 251 code points
    // (502 JS string units since each emoji is a surrogate pair).
    const overByteLimit = "😀".repeat(251);
    expect(overByteLimit.length).toBeLessThan(1000);
    expect(new TextEncoder().encode(overByteLimit).length).toBeGreaterThan(1000);
    await expect(
      server.callTool("ig_send_message", { recipient_id: "u_1", message: overByteLimit })
    ).rejects.toThrow();
    expect(client.ig).not.toHaveBeenCalled();
  });

  it("accepts a multibyte string whose byte length is exactly 1000", async () => {
    // "😀" is 4 bytes; 250 copies = 1000 bytes exactly.
    const atByteLimit = "😀".repeat(250);
    expect(new TextEncoder().encode(atByteLimit).length).toBe(1000);
    await expect(
      server.callTool("ig_send_message", { recipient_id: "u_1", message: atByteLimit })
    ).resolves.toBeDefined();
  });
});

describe("ig_get_conversations mode-aware routing with AcellereMetaClient", () => {
  it("uses FACEBOOK_PAGE_ID and never INSTAGRAM_USER_ID when in facebook-login mode", async () => {
    const server = makeMockServer();
    const client = new AcellereMetaClient(
      {
        appId: "",
        appSecret: "",
        facebookPageId: "1266932313170442",
        instagramAccessToken: "test-token",
        instagramUserId: "17841421598761181",
        threadsAccessToken: "",
        threadsUserId: "",
      },
      {
        instagramApiMode: "facebook-login",
        writeMode: "read-only",
      }
    );

    const igSpy = vi.spyOn(client, "ig").mockResolvedValue({
      data: { data: [{ id: "conv_123" }] },
      rateLimit: undefined,
    });

    registerIgMessagingTools(server as never, client);

    const result = (await server.callTool("ig_get_conversations", {})) as {
      isError?: boolean;
      content: { text: string }[];
    };

    expect(result.isError).toBeFalsy();
    expect(igSpy).toHaveBeenCalledTimes(1);
    const [method, path, params] = igSpy.mock.calls[0];
    expect(method).toBe("GET");
    expect(path).toBe("/1266932313170442/conversations");
    expect(path).not.toContain("17841421598761181");
    expect(params).toMatchObject({
      platform: "instagram",
    });
  });

  it("uses INSTAGRAM_USER_ID when in instagram-login mode", async () => {
    const server = makeMockServer();
    const client = new AcellereMetaClient(
      {
        appId: "",
        appSecret: "",
        facebookPageId: "1266932313170442",
        instagramAccessToken: "test-token",
        instagramUserId: "17841421598761181",
        threadsAccessToken: "",
        threadsUserId: "",
      },
      {
        instagramApiMode: "instagram-login",
        writeMode: "read-only",
      }
    );

    const igSpy = vi.spyOn(client, "ig").mockResolvedValue({
      data: { data: [{ id: "conv_456" }] },
      rateLimit: undefined,
    });

    registerIgMessagingTools(server as never, client);

    const result = (await server.callTool("ig_get_conversations", {})) as {
      isError?: boolean;
      content: { text: string }[];
    };

    expect(result.isError).toBeFalsy();
    expect(igSpy).toHaveBeenCalledTimes(1);
    const [method, path, params] = igSpy.mock.calls[0];
    expect(method).toBe("GET");
    expect(path).toBe("/17841421598761181/conversations");
    expect(params).toMatchObject({
      platform: "instagram",
    });
  });

  it("returns clear configuration error when FACEBOOK_PAGE_ID is missing in facebook-login mode", async () => {
    const server = makeMockServer();
    const client = new AcellereMetaClient(
      {
        appId: "",
        appSecret: "",
        facebookPageId: "",
        instagramAccessToken: "test-token",
        instagramUserId: "17841421598761181",
        threadsAccessToken: "",
        threadsUserId: "",
      },
      {
        instagramApiMode: "facebook-login",
        writeMode: "read-only",
      }
    );

    const igSpy = vi.spyOn(client, "ig");

    registerIgMessagingTools(server as never, client);

    const result = (await server.callTool("ig_get_conversations", {})) as {
      isError?: boolean;
      content: { text: string }[];
    };

    expect(result.isError).toBe(true);
    const payload = JSON.parse(result.content[0].text);
    expect(payload.message).toMatch(
      /FACEBOOK_PAGE_ID is not configured.*INSTAGRAM_API_MODE=facebook-login/
    );
    expect(igSpy).not.toHaveBeenCalled();
  });

  it("ig_send_media_message dispatches correct attachment payload", async () => {
    const server = makeMockServer();
    const client = makeMockClient({
      ig: vi.fn(async () => ({
        data: { recipient_id: "user_456", message_id: "m_123" },
        rateLimit: undefined,
      })),
    });
    registerIgMessagingTools(server as never, client);

    const result = (await server.callTool("ig_send_media_message", {
      recipient_id: "user_456",
      attachment_type: "image",
      media_url: "https://example.com/img.jpg",
    })) as { content: { text: string }[] };

    const payload = JSON.parse(result.content[0].text);
    expect(payload.message_id).toBe("m_123");

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].jsonBody.message.attachment.type).toBe("image");
    expect(call[3].jsonBody.message.attachment.payload.url).toBe("https://example.com/img.jpg");
  });

  it("ig_send_quick_replies sends text with quick reply choices", async () => {
    const server = makeMockServer();
    const client = makeMockClient({
      ig: vi.fn(async () => ({
        data: { recipient_id: "user_456", message_id: "m_qr" },
        rateLimit: undefined,
      })),
    });
    registerIgMessagingTools(server as never, client);

    await server.callTool("ig_send_quick_replies", {
      recipient_id: "user_456",
      text: "Choose an option:",
      quick_replies: [
        { content_type: "text", title: "Pricing", payload: "PAYLOAD_PRICING" },
        { content_type: "user_phone_number", title: "Send Phone", payload: "PHONE_PAYLOAD" },
        { content_type: "user_email", title: "Send Email", payload: "EMAIL_PAYLOAD" },
      ],
    });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].jsonBody.message.quick_replies).toHaveLength(3);
    expect(call[3].jsonBody.message.quick_replies[0]).toEqual({
      content_type: "text",
      title: "Pricing",
      payload: "PAYLOAD_PRICING",
    });
    expect(call[3].jsonBody.message.quick_replies[1]).toEqual({
      content_type: "user_phone_number",
      title: "Send Phone",
      payload: "PHONE_PAYLOAD",
    });
    expect(call[3].jsonBody.message.quick_replies[2]).toEqual({
      content_type: "user_email",
      title: "Send Email",
      payload: "EMAIL_PAYLOAD",
    });
  });

  it("ig_send_generic_template supports default_action on elements", async () => {
    const server = makeMockServer();
    const client = makeMockClient({
      ig: vi.fn(async () => ({
        data: { recipient_id: "user_456", message_id: "m_gen" },
        rateLimit: undefined,
      })),
    });
    registerIgMessagingTools(server as never, client);

    await server.callTool("ig_send_generic_template", {
      recipient_id: "user_456",
      elements: [
        {
          title: "Acellere AI Platform",
          subtitle: "Enterprise Marketing Automation",
          image_url: "https://example.com/banner.png",
          default_action: {
            type: "web_url",
            url: "https://acellere.ai/dashboard",
            webview_height_ratio: "tall",
          },
          buttons: [
            {
              type: "web_url",
              title: "Explore",
              url: "https://acellere.ai/explore",
            },
          ],
        },
      ],
    });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    const element = call[3].jsonBody.message.attachment.payload.elements[0];
    expect(element.default_action).toEqual({
      type: "web_url",
      url: "https://acellere.ai/dashboard",
      webview_height_ratio: "tall",
    });
  });

  it("ig_send_sticker sends like_heart attachment", async () => {
    const server = makeMockServer();
    const client = makeMockClient();
    registerIgMessagingTools(server as never, client);

    await server.callTool("ig_send_sticker", {
      recipient_id: "user_456",
      sticker_type: "like_heart",
    });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].jsonBody).toEqual({
      recipient: { id: "user_456" },
      message: {
        attachment: {
          type: "like_heart",
        },
      },
    });
  });

  it("ig_send_published_post sends MEDIA_SHARE attachment", async () => {
    const server = makeMockServer();
    const client = makeMockClient();
    registerIgMessagingTools(server as never, client);

    await server.callTool("ig_send_published_post", {
      recipient_id: "user_456",
      media_id: "17891234567890",
    });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3].jsonBody).toEqual({
      recipient: { id: "user_456" },
      message: {
        attachment: {
          type: "MEDIA_SHARE",
          payload: {
            id: "17891234567890",
          },
        },
      },
    });
  });

  it("ig_send_reaction and ig_delete_reaction dispatch official Meta reaction payloads", async () => {
    const server = makeMockServer();
    const client = makeMockClient({
      ig: vi.fn(async () => ({
        data: { success: true },
        rateLimit: undefined,
      })),
    });
    registerIgMessagingTools(server as never, client);

    await server.callTool("ig_send_reaction", {
      recipient_id: "user_456",
      message_id: "mid_999",
      reaction: "love",
    });

    const reactCall = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(reactCall[3].jsonBody).toEqual({
      recipient: { id: "user_456" },
      sender_action: "react",
      payload: {
        message_id: "mid_999",
        reaction: "love",
      },
    });

    await server.callTool("ig_delete_reaction", {
      recipient_id: "user_456",
      message_id: "mid_999",
    });

    const unreactCall = (client.ig as ReturnType<typeof vi.fn>).mock.calls[1];
    expect(unreactCall[3].jsonBody).toEqual({
      recipient: { id: "user_456" },
      sender_action: "unreact",
      payload: {
        message_id: "mid_999",
      },
    });
  });

  it("ig_upload_attachment sends attachment registration", async () => {
    const server = makeMockServer();
    const client = makeMockClient({
      ig: vi.fn(async () => ({
        data: { attachment_id: "att_123456" },
        rateLimit: undefined,
      })),
    });
    registerIgMessagingTools(server as never, client);

    const result = (await server.callTool("ig_upload_attachment", {
      attachment_type: "image",
      url: "https://example.com/asset.png",
      is_reusable: true,
    })) as { content: { text: string }[] };

    const payload = JSON.parse(result.content[0].text);
    expect(payload.attachment_id).toBe("att_123456");
  });
});
