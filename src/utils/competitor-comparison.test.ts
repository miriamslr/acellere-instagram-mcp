import { describe, it, expect } from "vitest";
import {
  extractLeaders,
  mapConcurrent,
  type CompetitorComparisonItem,
} from "./competitor-comparison.js";

describe("competitor-comparison utils", () => {
  describe("extractLeaders", () => {
    const items: CompetitorComparisonItem[] = [
      {
        username: "brand_a",
        status: "ok",
        followers_count: 50000,
        posts_analyzed: 20,
        posts_per_week: 3.5,
        posting_frequency_status: "available",
        public_engagement_rate: { average: 4.2, median: 3.8 },
        average_likes: 2000,
        average_comments: 100,
        average_views: 15000,
        reels_percentage: 40,
        carousel_percentage: 30,
        image_percentage: 30,
      },
      {
        username: "brand_b",
        status: "ok",
        followers_count: 10000,
        posts_analyzed: 20,
        posts_per_week: 7.0,
        posting_frequency_status: "available",
        public_engagement_rate: { average: 8.5, median: 7.2 },
        average_likes: 800,
        average_comments: 50,
        average_views: 25000,
        reels_percentage: 80,
        carousel_percentage: 10,
        image_percentage: 10,
      },
      {
        username: "brand_c",
        status: "not_found",
        followers_count: 0,
        posts_analyzed: 0,
        posts_per_week: 0,
        posting_frequency_status: "available",
        public_engagement_rate: { average: 0, median: 0 },
        average_likes: 0,
        average_comments: 0,
        average_views: null,
        reels_percentage: 0,
        carousel_percentage: 0,
        image_percentage: 0,
      },
    ];

    it("identifies leaders accurately for each objective metric", () => {
      const leaders = extractLeaders(items);

      expect(leaders.followers?.username).toBe("brand_a");
      expect(leaders.followers?.value).toBe(50000);

      expect(leaders.public_engagement_rate?.username).toBe("brand_b");
      expect(leaders.public_engagement_rate?.value).toBe(8.5);

      expect(leaders.posting_frequency?.username).toBe("brand_b");
      expect(leaders.posting_frequency?.value).toBe(7.0);

      expect(leaders.average_likes?.username).toBe("brand_a");
      expect(leaders.average_likes?.value).toBe(2000);

      expect(leaders.average_views?.username).toBe("brand_b");
      expect(leaders.average_views?.value).toBe(25000);
    });

    it("ignores failed or not_found accounts when picking leaders", () => {
      const failedOnly: CompetitorComparisonItem[] = [
        {
          username: "brand_fail",
          status: "error",
          followers_count: 0,
          posts_analyzed: 0,
          posts_per_week: 0,
          public_engagement_rate: { average: 0, median: 0 },
          average_likes: 0,
          average_comments: 0,
          average_views: null,
          reels_percentage: 0,
          carousel_percentage: 0,
          image_percentage: 0,
        },
      ];

      const leaders = extractLeaders(failedOnly);
      expect(leaders.followers).toBeNull();
      expect(leaders.public_engagement_rate).toBeNull();
    });
  });

  describe("mapConcurrent", () => {
    it("processes all items respecting concurrency limit", async () => {
      let active = 0;
      let maxActive = 0;

      const items = [1, 2, 3, 4, 5];
      const results = await mapConcurrent(items, 2, async (item) => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active--;
        return item * 10;
      });

      expect(results).toEqual([10, 20, 30, 40, 50]);
      expect(maxActive).toBeLessThanOrEqual(2);
    });
  });
});
