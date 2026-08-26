import { describe, it, expect } from "vitest";
import {
  normalizeMediaItem,
  normalizeBusinessMediaResponse,
  filterMediaByDate,
  parseDateFilter,
} from "./business-media-normalizer.js";

describe("business-media-normalizer", () => {
  describe("parseDateFilter", () => {
    it("parses Unix timestamp in seconds", () => {
      expect(parseDateFilter("1714564800")).toBe(1714564800000);
    });

    it("parses ISO 8601 string", () => {
      const iso = "2026-05-01T12:00:00.000Z";
      expect(parseDateFilter(iso)).toBe(new Date(iso).getTime());
    });

    it("returns undefined for empty/invalid values", () => {
      expect(parseDateFilter("")).toBeUndefined();
      expect(parseDateFilter(undefined)).toBeUndefined();
      expect(parseDateFilter("invalid-date-string")).toBeUndefined();
    });
  });

  describe("normalizeMediaItem", () => {
    it("normalizes an IMAGE post preserving null view_count when missing", () => {
      const normalized = normalizeMediaItem({
        id: "1001",
        caption: "Hello world",
        media_type: "IMAGE",
        media_url: "https://example.com/img.jpg",
        permalink: "https://instagram.com/p/1001",
        timestamp: "2026-05-01T12:00:00+0000",
        like_count: 50,
        comments_count: 5,
      });

      expect(normalized.id).toBe("1001");
      expect(normalized.media_type).toBe("IMAGE");
      expect(normalized.media_product_type).toBeNull();
      expect(normalized.like_count).toBe(50);
      expect(normalized.comments_count).toBe(5);
      expect(normalized.view_count).toBeNull();
      expect(normalized.children).toBeUndefined();
    });

    it("normalizes a VIDEO / REELS post with view_count", () => {
      const normalized = normalizeMediaItem({
        id: "1002",
        caption: "Reels post",
        media_type: "VIDEO",
        media_product_type: "REELS",
        media_url: "https://example.com/video.mp4",
        thumbnail_url: "https://example.com/thumb.jpg",
        permalink: "https://instagram.com/reel/1002",
        timestamp: "2026-05-01T12:00:00+0000",
        like_count: 1500,
        comments_count: 120,
        view_count: 45000,
      });

      expect(normalized.media_type).toBe("VIDEO");
      expect(normalized.media_product_type).toBe("REELS");
      expect(normalized.view_count).toBe(45000);
      expect(normalized.thumbnail_url).toBe("https://example.com/thumb.jpg");
    });

    it("normalizes a CAROUSEL_ALBUM with children", () => {
      const normalized = normalizeMediaItem({
        id: "1003",
        caption: "Carousel post",
        media_type: "CAROUSEL_ALBUM",
        permalink: "https://instagram.com/p/1003",
        timestamp: "2026-05-01T12:00:00+0000",
        like_count: 300,
        comments_count: 25,
        children: {
          data: [
            { id: "child-1", media_type: "IMAGE", media_url: "https://example.com/1.jpg" },
            { id: "child-2", media_type: "IMAGE", media_url: "https://example.com/2.jpg" },
          ],
        },
      });

      expect(normalized.media_type).toBe("CAROUSEL_ALBUM");
      expect(normalized.children).toHaveLength(2);
      expect(normalized.children?.[0].id).toBe("child-1");
    });
  });

  describe("filterMediaByDate", () => {
    const items = [
      normalizeMediaItem({ id: "1", timestamp: "2026-05-01T00:00:00Z" }),
      normalizeMediaItem({ id: "2", timestamp: "2026-05-05T00:00:00Z" }),
      normalizeMediaItem({ id: "3", timestamp: "2026-05-10T00:00:00Z" }),
    ];

    it("filters items with since filter", () => {
      const filtered = filterMediaByDate(items, "2026-05-04T00:00:00Z");
      expect(filtered.map((i) => i.id)).toEqual(["2", "3"]);
    });

    it("filters items with until filter", () => {
      const filtered = filterMediaByDate(items, undefined, "2026-05-06T00:00:00Z");
      expect(filtered.map((i) => i.id)).toEqual(["1", "2"]);
    });

    it("filters items within since and until window", () => {
      const filtered = filterMediaByDate(items, "2026-05-02T00:00:00Z", "2026-05-08T00:00:00Z");
      expect(filtered.map((i) => i.id)).toEqual(["2"]);
    });
  });

  describe("normalizeBusinessMediaResponse", () => {
    it("builds account summary and metadata accurately", () => {
      const raw = {
        business_discovery: {
          id: "1784140000",
          username: "targetbrand",
          name: "Target Brand",
          followers_count: 50000,
          follows_count: 200,
          media_count: 450,
          media: {
            data: [
              { id: "p1", caption: "Post 1", media_type: "IMAGE", like_count: 100 },
              { id: "p2", caption: "Post 2", media_type: "VIDEO", like_count: 200 },
            ],
            paging: {
              cursors: { after: "cursor-123" },
            },
          },
        },
      };

      const res = normalizeBusinessMediaResponse(raw, 25);
      expect(res.account.username).toBe("targetbrand");
      expect(res.account.followers_count).toBe(50000);
      expect(res.media).toHaveLength(2);
      expect(res.metadata.returned_count).toBe(2);
      expect(res.metadata.requested_limit).toBe(25);
      expect(res.metadata.has_more).toBe(true);
      expect(res.paging?.cursors?.after).toBe("cursor-123");
    });
  });
});
