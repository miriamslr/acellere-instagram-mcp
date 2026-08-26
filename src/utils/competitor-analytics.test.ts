import { describe, it, expect } from "vitest";
import {
  calculateMean,
  calculateMedian,
  calculatePublicEngagementRate,
  analyzeCompetitorMedia,
} from "./competitor-analytics.js";
import { normalizeMediaItem } from "./business-media-normalizer.js";

describe("competitor-analytics utils", () => {
  describe("calculateMean", () => {
    it("computes average accurately", () => {
      expect(calculateMean([10, 20, 30])).toBe(20);
      expect(calculateMean([10, 15])).toBe(12.5);
    });

    it("returns 0 for empty array", () => {
      expect(calculateMean([])).toBe(0);
    });
  });

  describe("calculateMedian", () => {
    it("computes median for odd length array", () => {
      expect(calculateMedian([5, 1, 9])).toBe(5);
    });

    it("computes median for even length array", () => {
      expect(calculateMedian([10, 20, 30, 40])).toBe(25);
    });

    it("returns 0 for empty array", () => {
      expect(calculateMedian([])).toBe(0);
    });
  });

  describe("calculatePublicEngagementRate", () => {
    it("computes engagement rate formula: (likes + comments) / followers * 100", () => {
      // (100 likes + 20 comments) / 1000 followers * 100 = 12%
      expect(calculatePublicEngagementRate(100, 20, 1000)).toBe(12);
    });

    it("safely handles 0 followers without dividing by zero", () => {
      expect(calculatePublicEngagementRate(100, 20, 0)).toBe(0);
    });

    it("handles null / undefined likes and comments", () => {
      expect(calculatePublicEngagementRate(null, undefined, 500)).toBe(0);
      expect(calculatePublicEngagementRate(50, null, 1000)).toBe(5);
    });
  });

  describe("analyzeCompetitorMedia", () => {
    const account = {
      id: "acc-1",
      username: "fitnesscoach",
      name: "Fitness Coach",
      followers_count: 10000,
      follows_count: 500,
      media_count: 120,
    };

    const media = [
      normalizeMediaItem({
        id: "p1",
        caption: "Morning workout tips #fitness",
        media_type: "VIDEO",
        media_product_type: "REELS",
        like_count: 1000,
        comments_count: 100,
        view_count: 20000,
        timestamp: "2026-05-01T08:30:00Z", // Friday Morning
      }),
      normalizeMediaItem({
        id: "p2",
        caption: "Nutrition guide carousel",
        media_type: "CAROUSEL_ALBUM",
        like_count: 400,
        comments_count: 50,
        timestamp: "2026-05-03T14:00:00Z", // Sunday Afternoon
        children: {
          data: [
            { id: "c1", media_type: "IMAGE" },
            { id: "c2", media_type: "IMAGE" },
            { id: "c3", media_type: "IMAGE" },
          ],
        },
      }),
      normalizeMediaItem({
        id: "p3",
        caption: "Quote image",
        media_type: "IMAGE",
        like_count: 200,
        comments_count: 10,
        timestamp: "2026-05-05T20:00:00Z", // Tuesday Evening
      }),
    ];

    it("does not extrapolate posting frequency from a single post", () => {
      const singlePost = [
        normalizeMediaItem({
          id: "single-1",
          caption: "Single observed post",
          media_type: "IMAGE",
          like_count: 10,
          comments_count: 1,
          timestamp: "2026-08-25T00:35:06Z",
        }),
      ];

      const report = analyzeCompetitorMedia(account, singlePost);

      expect(report.sample.posts_analyzed).toBe(1);
      expect(report.sample.observed_period.duration_days).toBe(0);
      expect(report.sample.posts_per_week).toBeNull();
      expect(report.sample.average_posting_interval_hours).toBeNull();
    });

    it("computes complete deterministic analysis report", () => {
      const report = analyzeCompetitorMedia(account, media);

      expect(report.account.username).toBe("fitnesscoach");
      expect(report.sample.posts_analyzed).toBe(3);
      expect(report.sample.posts_per_week).toBeGreaterThan(0);

      // Metrics
      expect(report.metrics.likes.total).toBe(1600);
      expect(report.metrics.likes.average).toBe(533.33);
      expect(report.metrics.likes.median).toBe(400);

      expect(report.metrics.comments.total).toBe(160);
      expect(report.metrics.comments.average).toBe(53.33);

      expect(report.metrics.views.available_count).toBe(1);
      expect(report.metrics.views.average).toBe(20000);

      // Public engagement rate: (1000+100)/10000 = 11%, (400+50)/10000 = 4.5%, (200+10)/10000 = 2.1%
      expect(report.metrics.public_engagement_rate.max).toBe(11);
      expect(report.metrics.public_engagement_rate.min).toBe(2.1);
      expect(report.metrics.public_engagement_rate.average).toBe(5.87);

      // Formats breakdown
      expect(report.formats.reels.count).toBe(1);
      expect(report.formats.reels.percentage).toBe(33.33);
      expect(report.formats.carousels.count).toBe(1);
      expect(report.formats.carousels.average_items_per_carousel).toBe(3);
      expect(report.formats.images.count).toBe(1);

      // Rankings
      expect(report.rankings.top_posts_by_engagement[0].id).toBe("p1");
      expect(report.rankings.bottom_posts_by_engagement[0].id).toBe("p3");
      expect(report.rankings.top_posts_by_likes[0].id).toBe("p1");
      expect(report.rankings.top_posts_by_views[0].id).toBe("p1");
    });
  });
});
