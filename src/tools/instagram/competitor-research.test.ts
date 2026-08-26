import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { registerIgCompetitorResearchTools } from "./competitor-research.js";
import { MetaClient } from "../../services/meta-client.js";
import { MemoryCompetitorStore } from "../../services/competitor-store.js";
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

      if (fields.includes("business_discovery.username(brand_alpha)")) {
        return {
          data: {
            business_discovery: {
              id: "1001",
              username: "brand_alpha",
              name: "Brand Alpha",
              followers_count: 50000,
              media_count: 200,
              media: {
                data: [
                  {
                    id: "p1",
                    caption: "Top Reel for copy analysis",
                    media_type: "VIDEO",
                    media_product_type: "REELS",
                    permalink: "https://instagram.com/reel/p1",
                    timestamp: "2026-05-01T12:00:00Z",
                    like_count: 2500,
                    comments_count: 300,
                    view_count: 80000,
                  },
                ],
              },
            },
          },
          rateLimit: { callCount: 4 },
        };
      }

      if (fields.includes("business_discovery.username(brand_beta)")) {
        return {
          data: {
            business_discovery: {
              id: "1002",
              username: "brand_beta",
              name: "Brand Beta",
              followers_count: 10000,
              media_count: 80,
              media: {
                data: [
                  {
                    id: "p2",
                    caption: "Carousel on marketing angles",
                    media_type: "CAROUSEL_ALBUM",
                    permalink: "https://instagram.com/p/p2",
                    timestamp: "2026-05-02T12:00:00Z",
                    like_count: 800,
                    comments_count: 90,
                    children: {
                      data: [
                        { id: "c1", media_type: "IMAGE" },
                        { id: "c2", media_type: "IMAGE" },
                      ],
                    },
                  },
                ],
              },
            },
          },
          rateLimit: { callCount: 5 },
        };
      }

      if (fields.includes("business_discovery.username(brand_ghost)")) {
        throw new Error("Meta API error: User does not exist");
      }

      throw new Error("Meta API error: unknown error");
    }),
    ...makeMockCache(),
  } as unknown as MetaClient;
}

describe("ig_competitor_research tool", () => {
  let server: ReturnType<typeof makeMockServer>;
  let client: ReturnType<typeof makeMockClient>;
  let store: MemoryCompetitorStore;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    store = new MemoryCompetitorStore();
    registerIgCompetitorResearchTools(server as never, client, store);
  });

  it("orchestrates full research pipeline across multiple competitor accounts", async () => {
    const handler = server.tools.get("ig_competitor_research");
    expect(handler).toBeDefined();

    const result = (await handler!({
      usernames: ["brand_alpha", "brand_beta"],
      posts_per_account: 20,
    })) as { content: { type: string; text: string }[] };

    const payload = JSON.parse(result.content[0].text);

    expect(payload.research_metadata.accounts_requested).toBe(2);
    expect(payload.research_metadata.accounts_successful).toBe(2);
    expect(payload.research_metadata.accounts_failed).toBe(0);

    // Benchmark summary
    expect(payload.benchmark_summary.leaders.followers.username).toBe("brand_alpha");
    expect(payload.benchmark_summary.leaders.public_engagement_rate.username).toBe("brand_beta");

    // Accounts detail
    expect(payload.accounts_detail).toHaveLength(2);
    const alphaDetail = payload.accounts_detail[0];
    expect(alphaDetail.username).toBe("brand_alpha");
    expect(alphaDetail.analysis.formats.reels.count).toBe(1);
    expect(alphaDetail.recent_posts_sample[0].caption).toBe("Top Reel for copy analysis");
    expect(alphaDetail.recent_posts_sample[0].view_count).toBe(80000);

    const betaDetail = payload.accounts_detail[1];
    expect(betaDetail.username).toBe("brand_beta");
    expect(betaDetail.recent_posts_sample[0].carousel_items_count).toBe(2);
  });

  it("attaches historical snapshot growth when include_history is true", async () => {
    const comp = await store.upsertCompetitor({
      instagram_id: "1001",
      username: "brand_alpha",
    });

    const now = Date.now();
    const t1 = new Date(now - 14 * 24 * 60 * 60 * 1000).toISOString();
    const t2 = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();

    await store.addCompetitorSnapshot({
      competitor_id: comp.id,
      captured_at: t1,
      followers_count: 48000,
      follows_count: 100,
      media_count: 190,
    });

    await store.addCompetitorSnapshot({
      competitor_id: comp.id,
      captured_at: t2,
      followers_count: 50000,
      follows_count: 105,
      media_count: 200,
    });

    const handler = server.tools.get("ig_competitor_research");
    const result = (await handler!({
      usernames: ["brand_alpha"],
      include_history: true,
    })) as { content: { type: string; text: string }[] };

    const payload = JSON.parse(result.content[0].text);
    const history = payload.accounts_detail[0].history;

    expect(history.is_tracked).toBe(true);
    expect(history.followers_start).toBe(48000);
    expect(history.followers_end).toBe(50000);
    expect(history.followers_delta_percentage).toBe(4.17);
  });

  it("isolates errors for failed accounts during multi-account research", async () => {
    const handler = server.tools.get("ig_competitor_research");
    const result = (await handler!({
      usernames: ["brand_alpha", "brand_ghost"],
    })) as { content: { type: string; text: string }[] };

    const payload = JSON.parse(result.content[0].text);

    expect(payload.research_metadata.accounts_requested).toBe(2);
    expect(payload.research_metadata.accounts_successful).toBe(1);
    expect(payload.research_metadata.accounts_failed).toBe(1);

    expect(payload.accounts_detail[0].status).toBe("ok");
    expect(payload.accounts_detail[1].status).toBe("not_found");
  });
});
