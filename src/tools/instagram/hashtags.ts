import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient, HASHTAG_CACHE_TTL_MS } from "../../services/meta-client.js";
import { metaId } from "../../schemas.js";
import { IG_HASHTAG_MEDIA_FIELDS } from "../../constants/fields.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { buildParams } from "../../utils/params.js";
import { READ_ONLY_TOOL } from "../annotations.js";

// Meta's hashtag search is case-insensitive — `"Puppies"` and `"puppies"`
// resolve to the same hashtag ID. Lowercase the query so both spellings share
// one cache slot against the 30-unique-per-7-days quota.
export const igHashtagCacheKey = (userId: string, q: string): string =>
  `ig:hashtag:${userId}:${q.toLowerCase()}`;

export function registerIgHashtagTools(server: McpServer, client: MetaClient): void {
  // ─── ig_search_hashtag ───────────────────────────────────────
  server.registerTool(
    "ig_search_hashtag",
    {
      description: "Search for a hashtag ID by name. Required before querying hashtag media. Limited to 30 unique hashtags per 7-day rolling window — meta-mcp caches results in-process to maximize quota utilization on repeated lookups.",
      inputSchema: {
        q: z.string().describe("Hashtag name to search (without #)"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ q }) => {
      try {
        const cacheKey = igHashtagCacheKey(client.igUserId, q);
        const cached = client.getCached<Record<string, unknown>>(cacheKey);
        if (cached) return formatResponse(cached);
        const { data, rateLimit } = await client.ig("GET", "/ig_hashtag_search", {
          q,
          user_id: client.igUserId,
        });
        client.setCache(cacheKey, data, HASHTAG_CACHE_TTL_MS);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Hashtag search");
      }
    }
  );

  // ─── ig_get_hashtag ──────────────────────────────────────────
  server.registerTool(
    "ig_get_hashtag",
    {
      description: "Get hashtag information by ID. Meta Graph API exposes the hashtag object's id and name; media is queried separately through recent/top media endpoints.",
      inputSchema: {
        hashtag_id: metaId.describe("Hashtag ID (from ig_search_hashtag)"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ hashtag_id }) => {
      try {
        const { data, rateLimit } = await client.ig("GET", `/${hashtag_id}`, {
          // `media_count` is not a supported field on the Instagram Hashtag
          // object in current Graph API versions (including v26.0). Requesting
          // it causes Meta error #100 even though hashtag media endpoints work.
          fields: "id,name",
        });
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get hashtag");
      }
    }
  );

  // ─── ig_get_hashtag_recent ───────────────────────────────────
  server.registerTool(
    "ig_get_hashtag_recent",
    {
      description: "Get recent media tagged with a specific hashtag.",
      inputSchema: {
        hashtag_id: metaId.describe("Hashtag ID"),
        limit: z.number().optional().describe("Number of results"),
        after: z.string().optional().describe("Pagination cursor for next page"),
        before: z.string().optional().describe("Pagination cursor for previous page"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ hashtag_id, limit, after, before }) => {
      try {
        const params = buildParams(
          {
            user_id: client.igUserId,
            fields: IG_HASHTAG_MEDIA_FIELDS,
          },
          { limit, after, before }
        );
        const { data, rateLimit } = await client.ig("GET", `/${hashtag_id}/recent_media`, params);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get hashtag recent");
      }
    }
  );

  // ─── ig_get_hashtag_top ──────────────────────────────────────
  server.registerTool(
    "ig_get_hashtag_top",
    {
      description: "Get top (most popular) media tagged with a specific hashtag.",
      inputSchema: {
        hashtag_id: metaId.describe("Hashtag ID"),
        limit: z.number().optional().describe("Number of results"),
        after: z.string().optional().describe("Pagination cursor for next page"),
        before: z.string().optional().describe("Pagination cursor for previous page"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ hashtag_id, limit, after, before }) => {
      try {
        const params = buildParams(
          {
            user_id: client.igUserId,
            fields: IG_HASHTAG_MEDIA_FIELDS,
          },
          { limit, after, before }
        );
        const { data, rateLimit } = await client.ig("GET", `/${hashtag_id}/top_media`, params);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get hashtag top");
      }
    }
  );

  // ─── ig_get_recently_searched_hashtags ───────────────────────
  server.registerTool(
    "ig_get_recently_searched_hashtags",
    {
      description:
        "Get list of hashtags searched by the account in the current 7-day rolling window. " +
        "Allows monitoring the 30-unique-hashtags quota. Requires Facebook Login. Read-only.",
      inputSchema: {
        limit: z.number().optional().describe("Number of results"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ limit }) => {
      try {
        client.requireInstagramCapability("hashtags.recentlySearched");
        const params = buildParams({}, { limit });
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${client.igUserId}/recently_searched_hashtags`,
          params
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get recently searched hashtags");
      }
    }
  );
}
