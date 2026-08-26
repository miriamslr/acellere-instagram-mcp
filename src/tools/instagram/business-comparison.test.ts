import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { registerIgBusinessComparisonTools } from "./business-comparison.js";
import { MetaClient } from "../../services/meta-client.js";
import { makeMockCache } from "../test-utils.js";

function makeMockServer() {
  const tools = new Map<string, (...args: unknown[]) => unknown>();
  const schemas = new Map<string, z.ZodRawShape>();
  return {
    tools,
    schemas,
    registerTool: vi.fn(
      (
        name: string,
        config: { inputSchema?: z.ZodRawShape },
        handler: (...args: unknown[]) => unknown
      ) => {
        const schema = config.inputSchema ?? {};
        const parsed = z.object(schema);
        tools.set(name, async (args: Record<string, unknown> = {}) =>
          handler(parsed.parse(args))
        );
        schemas.set(name, schema);
      }
    ),
  };
}

function makeMockClient(): MetaClient {
  return {
    igUserId: "123456",
    ig: vi.fn(async (_method: string, _path: string, params?: { fields?: string }) => {
      const fields = params?.fields ?? "";

      if (fields.includes("business_discovery.username(brand_one)")) {
        return {
          data: {
            business_discovery: {
              id: "1001",
              username: "brand_one",
              name: "Brand One",
              followers_count: 20000,
              media_count: 50,
              media: {
                data: [
                  {
                    id: "p1",
                    media_type: "VIDEO",
                    media_product_type: "REELS",
                    permalink: "https://instagram.com/reel/p1",
                    timestamp: "2026-05-01T12:00:00Z",
                    like_count: 800,
                    comments_count: 80,
                    view_count: 10000,
                  },
                ],
              },
            },
          },
          rateLimit: { callCount: 2 },
        };
      }

      if (fields.includes("business_discovery.username(brand_two)")) {
        return {
          data: {
            business_discovery: {
              id: "1002",
              username: "brand_two",
              name: "Brand Two",
              followers_count: 5000,
              media_count: 30,
              media: {
                data: [
                  {
                    id: "p2",
                    media_type: "IMAGE",
                    permalink: "https://instagram.com/p/p2",
                    timestamp: "2026-05-02T12:00:00Z",
                    like_count: 500,
                    comments_count: 50,
                  },
                ],
              },
            },
          },
          rateLimit: { callCount: 3 },
        };
      }

      if (fields.includes("business_discovery.username(brand_invalid)")) {
        throw new Error("Meta API error: User does not exist");
      }

      throw new Error("Meta API error: unknown user");
    }),
    ...makeMockCache(),
  } as unknown as MetaClient;
}

describe("ig_compare_businesses tool", () => {
  let server: ReturnType<typeof makeMockServer>;
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgBusinessComparisonTools(server as never, client);
  });

  it("compares multiple accounts and identifies leaders", async () => {
    const handler = server.tools.get("ig_compare_businesses");
    expect(handler).toBeDefined();

    const result = (await handler!({
      usernames: ["brand_one", "brand_two"],
      media_limit: 10,
    })) as { content: { type: string; text: string }[] };

    const payload = JSON.parse(result.content[0].text);

    expect(payload.summary.total_accounts_requested).toBe(2);
    expect(payload.summary.successful_accounts).toBe(2);
    expect(payload.summary.failed_accounts).toBe(0);

    expect(payload.accounts).toHaveLength(2);
    expect(payload.accounts[0].username).toBe("brand_one");
    expect(payload.accounts[0].followers_count).toBe(20000);
    expect(payload.accounts[1].username).toBe("brand_two");
    expect(payload.accounts[1].followers_count).toBe(5000);

    // brand_two ER: (500+50)/5000*100 = 11% vs brand_one ER: (800+80)/20000*100 = 4.4%
    expect(payload.leaders.followers.username).toBe("brand_one");
    expect(payload.leaders.public_engagement_rate.username).toBe("brand_two");
    expect(payload.leaders.public_engagement_rate.value).toBe(11);
  });

  it("handles partial failure without failing the entire comparison", async () => {
    const handler = server.tools.get("ig_compare_businesses");
    const result = (await handler!({
      usernames: ["brand_one", "brand_invalid"],
    })) as { content: { type: string; text: string }[] };

    const payload = JSON.parse(result.content[0].text);

    expect(payload.summary.total_accounts_requested).toBe(2);
    expect(payload.summary.successful_accounts).toBe(1);
    expect(payload.summary.failed_accounts).toBe(1);

    expect(payload.accounts[0].status).toBe("ok");
    expect(payload.accounts[1].status).toBe("not_found");
    expect(payload.accounts[1].error_message).toContain("does not exist");

    expect(payload.leaders.followers.username).toBe("brand_one");
  });
});
