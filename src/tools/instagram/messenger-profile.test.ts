import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerIgMessengerProfileTools } from "./messenger-profile.js";
import { MetaClient } from "../../services/meta-client.js";
import { makeMockServer, type MockServer } from "../test-utils.js";

function makeMockClient(overrides?: Partial<MetaClient>): MetaClient {
  return {
    igUserId: "1784140001",
    ig: vi.fn(async () => ({
      data: { success: true },
      rateLimit: undefined,
    })),
    ...overrides,
  } as unknown as MetaClient;
}

describe("Instagram Messenger Profile Tools", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgMessengerProfileTools(server as never, client);
  });

  it("ig_get_messenger_profile queries profile settings", async () => {
    await server.callTool("ig_get_messenger_profile", {});
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("GET");
    expect(call[1]).toBe("/1784140001/messenger_profile");
  });

  it("ig_set_ice_breakers sends structured prompt questions", async () => {
    await server.callTool("ig_set_ice_breakers", {
      ice_breakers: [
        { question: "What are your hours?", payload: "HOURS_PAYLOAD" },
      ],
    });
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("POST");
    expect(call[3].jsonBody.ice_breakers).toHaveLength(1);
    expect(call[3].jsonBody.ice_breakers[0].question).toBe("What are your hours?");
  });

  it("ig_delete_ice_breakers requests deletion of ice_breakers field", async () => {
    await server.callTool("ig_delete_ice_breakers", {});
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("DELETE");
    expect(call[3].jsonBody.fields).toEqual(["ice_breakers"]);
  });

  it("ig_set_persistent_menu sends persistent menu config", async () => {
    await server.callTool("ig_set_persistent_menu", {
      persistent_menu: [
        {
          locale: "default",
          composer_input_disabled: false,
          call_to_actions: [
            { type: "web_url", title: "Visit Website", url: "https://acellere.com" },
          ],
        },
      ],
    });
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("POST");
    expect(call[3].jsonBody.persistent_menu[0].call_to_actions[0].title).toBe("Visit Website");
  });
});
