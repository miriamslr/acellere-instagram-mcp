import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { registerIgBusinessAnalyticsTools } from "./business-analytics.js";
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
    ig: vi.fn(async () => ({
      data: {
        business_discovery: {
          id: "1784140001",
          username: "targetbrand",
          name: "Target Brand",
          followers_count: 5000,
          follows_count: 300,
          media_count: 40,
          media: {
            data: [
              {
                id: "p1",
                caption: "Reels video",
                media_type: "VIDEO",
                media_product_type: "REELS",
                permalink: "https://instagram.com/reel/p1",
                timestamp: "2026-05-01T10:00:00Z",
                like_count: 250,
                comments_count: 25,
                view_count: 5000,
              },
              {
                id: "p2",
                caption: "Static image post",
                media_type: "IMAGE",
                permalink: "https://instagram.com/p/p2",
                timestamp: "2026-05-03T18:00:00Z",
                like_count: 100,
                comments_count: 10,
              },
            ],
          },
        },
      },
      rateLimit: { callCount: 3 },
    })),
    ...makeMockCache(),
  } as unknown as MetaClient;
}

describe("ig_analyze_business tool", () => {
  let server: ReturnType<typeof makeMockServer>;
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgBusinessAnalyticsTools(server as never, client);
  });

  it("analyzes account metrics and returns structured report", async () => {
    const handler = server.tools.get("ig_analyze_business");
    expect(handler).toBeDefined();

    const result = (await handler!({ username: "targetbrand", limit: 10 })) as {
      content: { type: string; text: string }[];
    };
    const payload = JSON.parse(result.content[0].text);

    expect(payload.account.username).toBe("targetbrand");
    expect(payload.account.followers_count).toBe(5000);
    expect(payload.sample.posts_analyzed).toBe(2);

    // Engagement rates: p1 = (250+25)/5000*100 = 5.5%, p2 = (100+10)/5000*100 = 2.2%
    expect(payload.metrics.public_engagement_rate.average).toBe(3.85);
    expect(payload.metrics.public_engagement_rate.max).toBe(5.5);
    expect(payload.metrics.public_engagement_rate.min).toBe(2.2);

    // Formats
    expect(payload.formats.reels.count).toBe(1);
    expect(payload.formats.images.count).toBe(1);

    // RateLimit forwarded
    expect(payload._rateLimit).toEqual({ callCount: 3 });
  });

  it("handles errors gracefully with isError result", async () => {
    (client.ig as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Meta API error: account restricted")
    );
    const handler = server.tools.get("ig_analyze_business");
    const result = (await handler!({ username: "targetbrand" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Analyze business failed");
    expect(result.content[0].text).toContain("account restricted");
  });
});
