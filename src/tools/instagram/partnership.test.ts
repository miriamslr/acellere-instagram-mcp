import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerIgPartnershipTools } from "./partnership.js";
import { MetaClient } from "../../services/meta-client.js";
import { makeMockServer, type MockServer } from "../test-utils.js";

function makeMockClient(overrides?: Partial<MetaClient>): MetaClient {
  return {
    igUserId: "1784140001",
    getInstagramApiMode: () => "facebook-login",
    requireInstagramCapability: vi.fn(),
    ig: vi.fn(async () => ({
      data: { data: [] },
      rateLimit: undefined,
    })),
    ...overrides,
  } as unknown as MetaClient;
}

describe("Instagram Partnership Tools", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgPartnershipTools(server as never, client);
  });

  it("ig_get_branded_content_ad_permissions checks media eligibility", async () => {
    await server.callTool("ig_get_branded_content_ad_permissions", {
      media_id: "media_123",
    });
    expect(client.requireInstagramCapability).toHaveBeenCalledWith("partnership.adPermissions");
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("GET");
    expect(call[1]).toBe("/media_123/branded_content_ad_permissions");
  });

  it("ig_set_authorized_ad_account authorises brand partner", async () => {
    await server.callTool("ig_set_authorized_ad_account", {
      sponsor_id: "page_partner_789",
    });
    expect(client.requireInstagramCapability).toHaveBeenCalledWith("partnership.authorizedPartners");
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("POST");
    expect(call[1]).toBe("/1784140001/branded_content_ad_partners");
    expect(call[3].jsonBody.sponsor_id).toBe("page_partner_789");
  });

  it("ig_update_tag_approval decisions partner tag approval", async () => {
    await server.callTool("ig_update_tag_approval", {
      user_id: "creator_456",
      status: "APPROVED",
    });
    expect(client.requireInstagramCapability).toHaveBeenCalledWith("partnership.tagApproval");
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("POST");
    expect(call[1]).toBe("/1784140001/branded_content_tag_approval");
    expect(call[3].jsonBody.status).toBe("APPROVED");
  });
});
