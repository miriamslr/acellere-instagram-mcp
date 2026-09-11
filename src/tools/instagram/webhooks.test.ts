import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerIgWebhookTools } from "./webhooks.js";
import { MetaClient } from "../../services/meta-client.js";
import { makeMockServer, type MockServer } from "../test-utils.js";

function makeMockClient(overrides?: Partial<MetaClient>): MetaClient {
  return {
    igUserId: "1784140001",
    igConversationsTargetId: "page_12345",
    ig: vi.fn(async () => ({
      data: { success: true },
      rateLimit: undefined,
    })),
    ...overrides,
  } as unknown as MetaClient;
}

describe("Instagram Webhooks Tools", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgWebhookTools(server as never, client);
  });

  it("ig_get_subscribed_apps queries subscribed_apps on target", async () => {
    await server.callTool("ig_get_subscribed_apps", {});
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("GET");
    expect(call[1]).toBe("/page_12345/subscribed_apps");
  });

  it("ig_subscribe_app sends subscribed_fields string", async () => {
    await server.callTool("ig_subscribe_app", {
      subscribed_fields: ["messages", "comments"],
    });
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("POST");
    expect(call[1]).toBe("/page_12345/subscribed_apps");
    expect(call[2].subscribed_fields).toBe("messages,comments");
  });

  it("ig_unsubscribe_app deletes subscriptions on target", async () => {
    await server.callTool("ig_unsubscribe_app", {});
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("DELETE");
    expect(call[1]).toBe("/page_12345/subscribed_apps");
  });
});
