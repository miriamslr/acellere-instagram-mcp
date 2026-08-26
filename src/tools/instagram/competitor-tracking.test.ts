import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { registerIgCompetitorTrackingTools } from "./competitor-tracking.js";
import { MetaClient } from "../../services/meta-client.js";
import { MemoryCompetitorStore } from "../../services/competitor-store.js";
import { makeMockCache } from "../test-utils.js";

function makeMockServer() {
  const tools = new Map<string, (args?: Record<string, unknown>) => Promise<unknown>>();
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

      if (fields.includes("business_discovery.username(brand_monitored)")) {
        return {
          data: {
            business_discovery: {
              id: "1784140099",
              username: "brand_monitored",
              name: "Brand Monitored",
              followers_count: 50000,
              follows_count: 200,
              media_count: 80,
              media: {
                data: [
                  {
                    id: "post_m1",
                    caption: "Monitored post #trending",
                    media_type: "IMAGE",
                    permalink: "https://instagram.com/p/post_m1",
                    timestamp: "2026-05-01T12:00:00Z",
                    like_count: 1500,
                    comments_count: 120,
                  },
                ],
              },
            },
          },
          rateLimit: { callCount: 2 },
        };
      }

      throw new Error("Meta API error: User not found");
    }),
    ...makeMockCache(),
  } as unknown as MetaClient;
}

describe("competitor tracking tools", () => {
  let server: ReturnType<typeof makeMockServer>;
  let client: ReturnType<typeof makeMockClient>;
  let store: MemoryCompetitorStore;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    store = new MemoryCompetitorStore();
    registerIgCompetitorTrackingTools(server as never, client, store);
  });

  describe("ig_track_business", () => {
    it("adds account to tracking and captures initial snapshot and media", async () => {
      const handler = server.tools.get("ig_track_business");
      expect(handler).toBeDefined();

      const result = (await handler!({ username: "brand_monitored" })) as {
        content: { type: string; text: string }[];
      };
      const payload = JSON.parse(result.content[0].text);

      expect(payload.success).toBe(true);
      expect(payload.competitor.username).toBe("brand_monitored");
      expect(payload.initial_snapshot.followers_count).toBe(50000);
      expect(payload.media_captured).toBe(1);

      const inStore = await store.getCompetitorByUsername("brand_monitored");
      expect(inStore).toBeDefined();
      expect(inStore?.is_active).toBe(true);
    });
  });

  describe("ig_untrack_business", () => {
    it("deactivates tracking while preserving historical record", async () => {
      await store.upsertCompetitor({
        instagram_id: "1784140099",
        username: "brand_monitored",
        is_active: true,
      });

      const handler = server.tools.get("ig_untrack_business");
      const result = (await handler!({ username: "brand_monitored" })) as {
        content: { type: string; text: string }[];
      };
      const payload = JSON.parse(result.content[0].text);

      expect(payload.success).toBe(true);
      expect(payload.is_active).toBe(false);

      const inStore = await store.getCompetitorByUsername("brand_monitored");
      expect(inStore?.is_active).toBe(false);
    });
  });

  describe("ig_get_business_history", () => {
    it("returns not_tracked status if account was never tracked", async () => {
      const handler = server.tools.get("ig_get_business_history");
      const result = (await handler!({ username: "untracked_brand" })) as {
        content: { type: string; text: string }[];
      };
      const payload = JSON.parse(result.content[0].text);

      expect(payload.status).toBe("not_tracked");
    });

    it("returns insufficient_snapshots if only 1 snapshot is available", async () => {
      const comp = await store.upsertCompetitor({
        instagram_id: "1784140099",
        username: "brand_monitored",
      });
      await store.addCompetitorSnapshot({
        competitor_id: comp.id,
        captured_at: "2026-05-01T12:00:00Z",
        followers_count: 50000,
        follows_count: 200,
        media_count: 80,
      });

      const handler = server.tools.get("ig_get_business_history");
      const result = (await handler!({
        username: "brand_monitored",
        period: "custom",
        since: "2026-04-01T00:00:00Z",
      })) as { content: { type: string; text: string }[] };
      const payload = JSON.parse(result.content[0].text);

      expect(payload.status).toBe("insufficient_snapshots");
      expect(payload.snapshots_count).toBe(1);
    });

    it("calculates growth rates and delta across multiple snapshots", async () => {
      const comp = await store.upsertCompetitor({
        instagram_id: "1784140099",
        username: "brand_monitored",
      });

      // Snapshot 1 (May 1): 50,000 followers, 80 posts
      await store.addCompetitorSnapshot({
        competitor_id: comp.id,
        captured_at: "2026-05-01T00:00:00Z",
        followers_count: 50000,
        follows_count: 200,
        media_count: 80,
      });

      // Snapshot 2 (May 11 - 10 days later): 52,000 followers (+2,000 / +4%), 85 posts (+5)
      await store.addCompetitorSnapshot({
        competitor_id: comp.id,
        captured_at: "2026-05-11T00:00:00Z",
        followers_count: 52000,
        follows_count: 210,
        media_count: 85,
      });

      const handler = server.tools.get("ig_get_business_history");
      const result = (await handler!({
        username: "brand_monitored",
        period: "custom",
        since: "2026-04-30T00:00:00Z",
        until: "2026-05-12T00:00:00Z",
      })) as { content: { type: string; text: string }[] };
      const payload = JSON.parse(result.content[0].text);

      expect(payload.status).toBe("ok");
      expect(payload.profile_growth.followers_start).toBe(50000);
      expect(payload.profile_growth.followers_end).toBe(52000);
      expect(payload.profile_growth.followers_delta_absolute).toBe(2000);
      expect(payload.profile_growth.followers_delta_percentage).toBe(4);
      expect(payload.profile_growth.average_daily_follower_growth).toBe(200);
      expect(payload.profile_growth.average_weekly_follower_growth).toBe(1400);
      expect(payload.profile_growth.new_posts_in_period).toBe(5);
    });
  });

  describe("ig_run_competitor_collection", () => {
    it("runs recurrent collection for all active monitored competitors", async () => {
      await store.upsertCompetitor({
        instagram_id: "1784140099",
        username: "brand_monitored",
        is_active: true,
      });

      const handler = server.tools.get("ig_run_competitor_collection");
      const result = (await handler!({})) as { content: { type: string; text: string }[] };
      const payload = JSON.parse(result.content[0].text);

      expect(payload.collection_run.status).toBe("completed");
      expect(payload.summary.accounts_requested).toBe(1);
      expect(payload.summary.accounts_successful).toBe(1);
      expect(payload.summary.accounts_failed).toBe(0);

      const snapshots = await store.getCompetitorSnapshots(
        (await store.getCompetitorByUsername("brand_monitored"))!.id
      );
      expect(snapshots).toHaveLength(1);
    });
  });
});
