import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerIgCommerceTools } from "./commerce.js";
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
    meta: vi.fn(async () => ({
      data: { data: [] },
      rateLimit: undefined,
    })),
    ...overrides,
  } as unknown as MetaClient;
}

describe("Instagram Commerce Tools", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgCommerceTools(server as never, client);
  });

  it("ig_get_available_catalogs queries catalogs endpoint", async () => {
    await server.callTool("ig_get_available_catalogs", {});
    expect(client.requireInstagramCapability).toHaveBeenCalledWith("commerce.catalogs");
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("GET");
    expect(call[1]).toBe("/1784140001/available_catalogs");
  });

  it("ig_get_catalog_products queries products with fields", async () => {
    await server.callTool("ig_get_catalog_products", {
      catalog_id: "cat_123",
      limit: 10,
    });
    expect(client.requireInstagramCapability).toHaveBeenCalledWith("commerce.catalogs");
    const call = (client.meta as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("GET");
    expect(call[1]).toBe("/cat_123/products");
  });

  it("ig_create_product_tags updates tags on media post", async () => {
    await server.callTool("ig_create_product_tags", {
      media_id: "media_999",
      updated_tags: [{ product_id: "prod_1", x: 0.5, y: 0.5 }],
    });
    expect(client.requireInstagramCapability).toHaveBeenCalledWith("commerce.productTags");
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("POST");
    expect(call[1]).toBe("/media_999/product_tags");
  });

  it("ig_submit_product_appeal sends appeal review request", async () => {
    await server.callTool("ig_submit_product_appeal", {
      product_id: "prod_1",
      appeal_reason: "This product adheres fully to commerce merchant policies.",
    });
    expect(client.requireInstagramCapability).toHaveBeenCalledWith("commerce.productAppeal");
    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("POST");
    expect(call[1]).toBe("/1784140001/product_appeal");
  });
});
