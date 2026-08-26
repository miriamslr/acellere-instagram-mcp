import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import {
  registerIgBusinessMediaTools,
  buildBusinessMediaQuery,
} from "./business-media.js";
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

function makeMockClient(mockData?: unknown): MetaClient {
  return {
    igUserId: "123456",
    ig: vi.fn(async () => ({
      data: mockData ?? {
        business_discovery: {
          id: "1784140001",
          username: "targetbrand",
          name: "Target Brand",
          followers_count: 10000,
          media_count: 50,
          media: {
            data: [
              {
                id: "post-1",
                caption: "Post 1 #great",
                media_type: "IMAGE",
                media_url: "https://example.com/p1.jpg",
                permalink: "https://instagram.com/p/post-1",
                timestamp: "2026-05-01T12:00:00+0000",
                like_count: 120,
                comments_count: 10,
              },
              {
                id: "post-2",
                caption: "Reel 2",
                media_type: "VIDEO",
                media_product_type: "REELS",
                media_url: "https://example.com/p2.mp4",
                thumbnail_url: "https://example.com/p2.jpg",
                permalink: "https://instagram.com/reel/post-2",
                timestamp: "2026-05-02T12:00:00+0000",
                like_count: 500,
                comments_count: 45,
                view_count: 12000,
              },
              {
                id: "post-3",
                caption: "Carousel 3",
                media_type: "CAROUSEL_ALBUM",
                permalink: "https://instagram.com/p/post-3",
                timestamp: "2026-05-03T12:00:00+0000",
                like_count: 300,
                comments_count: 20,
                children: {
                  data: [
                    { id: "c1", media_type: "IMAGE", media_url: "https://example.com/c1.jpg" },
                    { id: "c2", media_type: "IMAGE", media_url: "https://example.com/c2.jpg" },
                  ],
                },
              },
            ],
            paging: {
              cursors: { after: "cursor_next_page" },
            },
          },
        },
      },
      rateLimit: { callCount: 2 },
    })),
    ...makeMockCache(),
  } as unknown as MetaClient;
}

describe("buildBusinessMediaQuery", () => {
  it("builds query with all requested children and media URLs", () => {
    const query = buildBusinessMediaQuery({
      username: "targetbrand",
      batchLimit: 25,
      includeChildren: true,
      includeMediaUrls: true,
    });

    expect(query).toContain("business_discovery.username(targetbrand)");
    expect(query).toContain("media.limit(25)");
    expect(query).toContain("like_count,comments_count,view_count");
    expect(query).toContain("children{id,media_type,permalink,timestamp,username,media_url,thumbnail_url}");
  });

  it("omits media URLs when includeMediaUrls is false", () => {
    const query = buildBusinessMediaQuery({
      username: "targetbrand",
      batchLimit: 25,
      includeChildren: false,
      includeMediaUrls: false,
    });

    expect(query).not.toContain("media_url");
    expect(query).not.toContain("thumbnail_url");
    expect(query).not.toContain("children{");
  });

  it("adds cursor after clause when provided", () => {
    const query = buildBusinessMediaQuery({
      username: "targetbrand",
      batchLimit: 10,
      after: "cursor_abc",
    });

    expect(query).toContain("media.limit(10).after(cursor_abc)");
  });
});

describe("ig_get_business_media tool", () => {
  let server: ReturnType<typeof makeMockServer>;
  let client: ReturnType<typeof makeMockClient>;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgBusinessMediaTools(server as never, client);
  });

  it("fetches posts and returns normalized structure", async () => {
    const handler = server.tools.get("ig_get_business_media");
    expect(handler).toBeDefined();

    const result = (await handler!({ username: "targetbrand" })) as {
      content: { type: string; text: string }[];
    };
    const payload = JSON.parse(result.content[0].text);

    expect(payload.account.username).toBe("targetbrand");
    expect(payload.account.followers_count).toBe(10000);
    expect(payload.media).toHaveLength(3);

    // Validate IMAGE item
    expect(payload.media[0].id).toBe("post-1");
    expect(payload.media[0].media_type).toBe("IMAGE");
    expect(payload.media[0].view_count).toBeNull();

    // Validate REEL item
    expect(payload.media[1].id).toBe("post-2");
    expect(payload.media[1].media_product_type).toBe("REELS");
    expect(payload.media[1].view_count).toBe(12000);

    // Validate CAROUSEL item
    expect(payload.media[2].id).toBe("post-3");
    expect(payload.media[2].media_type).toBe("CAROUSEL_ALBUM");
    expect(payload.media[2].children).toHaveLength(2);

    expect(payload.metadata.returned_count).toBe(3);
    expect(payload.paging.cursors.after).toBe("cursor_next_page");
  });

  it("normalizes username by stripping leading @", async () => {
    const handler = server.tools.get("ig_get_business_media");
    await handler!({ username: "@targetbrand" });

    const call = (client.ig as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[2].fields).toContain("business_discovery.username(targetbrand)");
  });

  it("filters returned media by date range", async () => {
    const handler = server.tools.get("ig_get_business_media");
    const result = (await handler!({
      username: "targetbrand",
      since: "2026-05-02T00:00:00Z",
    })) as { content: { type: string; text: string }[] };

    const payload = JSON.parse(result.content[0].text);
    // post-1 is 2026-05-01 so it should be excluded
    expect(payload.media.map((p: { id: string }) => p.id)).toEqual(["post-2", "post-3"]);
  });

  it("handles client errors gracefully with formatErrorResponse", async () => {
    (client.ig as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Meta API error: account not found")
    );
    const handler = server.tools.get("ig_get_business_media");
    const result = (await handler!({ username: "unknownuser" })) as {
      isError?: boolean;
      content: { type: string; text: string }[];
    };

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Get business media failed");
    expect(result.content[0].text).toContain("account not found");
  });
});
