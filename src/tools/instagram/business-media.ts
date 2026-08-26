import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient, type RateLimit } from "../../services/meta-client.js";
import { igBusinessDiscoveryUsernameSchema } from "./profile.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { READ_ONLY_TOOL } from "../annotations.js";
import {
  normalizeBusinessMediaResponse,
  type RawBusinessDiscoveryData,
  type RawMediaItem,
} from "../../utils/business-media-normalizer.js";

export const DEFAULT_BUSINESS_MEDIA_LIMIT = 25;
export const MAX_BUSINESS_MEDIA_LIMIT = 100;
export const BATCH_PAGE_SIZE = 25;

export interface BuildBusinessMediaQueryOptions {
  username: string;
  batchLimit: number;
  after?: string;
  includeChildren?: boolean;
  includeMediaUrls?: boolean;
}

export function buildBusinessMediaQuery(options: BuildBusinessMediaQueryOptions): string {
  const { username, batchLimit, after, includeChildren = true, includeMediaUrls = true } = options;

  const mediaFields = [
    "id",
    "caption",
    "media_type",
    "media_product_type",
    "permalink",
    "timestamp",
    "username",
    "like_count",
    "comments_count",
    "view_count",
  ];

  if (includeMediaUrls) {
    mediaFields.push("media_url", "thumbnail_url");
  }

  if (includeChildren) {
    const childFields = ["id", "media_type", "permalink", "timestamp", "username"];
    if (includeMediaUrls) {
      childFields.push("media_url", "thumbnail_url");
    }
    mediaFields.push(`children{${childFields.join(",")}}`);
  }

  const afterClause = after ? `.after(${after})` : "";
  const mediaClause = `media.limit(${batchLimit})${afterClause}{${mediaFields.join(",")}}`;
  const accountFields = "id,username,name,followers_count,follows_count,media_count,biography,website,profile_picture_url";

  return `business_discovery.username(${username}){${accountFields},${mediaClause}}`;
}

export interface FetchBusinessMediaParams {
  client: MetaClient;
  username: string;
  limit: number;
  after?: string;
  since?: string;
  until?: string;
  includeChildren?: boolean;
  includeMediaUrls?: boolean;
}

export async function fetchBusinessMedia(params: FetchBusinessMediaParams): Promise<{
  data: ReturnType<typeof normalizeBusinessMediaResponse>;
  rateLimit?: RateLimit;
}> {
  const { client, username, limit, after, since, until, includeChildren, includeMediaUrls } = params;

  const targetLimit = Math.min(Math.max(1, limit), MAX_BUSINESS_MEDIA_LIMIT);
  const collectedItems: RawMediaItem[] = [];
  let currentCursor: string | undefined = after;
  let lastAccountData: RawBusinessDiscoveryData["business_discovery"] | undefined;
  let lastRateLimit: RateLimit | undefined;
  let hasMore = false;
  let nextCursor: string | undefined;

  // Single page fetch if explicit cursor was requested, otherwise multi-page up to limit
  const maxIterations = after ? 1 : Math.ceil(targetLimit / BATCH_PAGE_SIZE);

  for (let i = 0; i < maxIterations; i++) {
    const remaining = targetLimit - collectedItems.length;
    if (remaining <= 0) break;

    const batchLimit = Math.min(remaining, BATCH_PAGE_SIZE);
    const fieldsQuery = buildBusinessMediaQuery({
      username,
      batchLimit,
      after: currentCursor,
      includeChildren,
      includeMediaUrls,
    });

    const response = await client.ig("GET", `/${client.igUserId}`, {
      fields: fieldsQuery,
    });

    lastRateLimit = response.rateLimit;
    const rawData = response.data as RawBusinessDiscoveryData;
    const bd = rawData?.business_discovery;
    if (!bd) break;

    lastAccountData = { ...bd };
    const pageItems = bd.media?.data ?? [];
    collectedItems.push(...pageItems);

    const paging = bd.media?.paging;
    const afterToken = paging?.cursors?.after;

    if (afterToken) {
      nextCursor = afterToken;
    }

    if (afterToken && afterToken !== currentCursor && pageItems.length >= batchLimit) {
      currentCursor = afterToken;
      hasMore = true;
    } else {
      hasMore = false;
      break;
    }
  }

  const combinedRaw: RawBusinessDiscoveryData = {
    business_discovery: {
      ...(lastAccountData ?? { username }),
      media: {
        data: collectedItems,
        paging: nextCursor
          ? {
              cursors: { after: nextCursor },
            }
          : undefined,
      },
    },
  };

  const normalized = normalizeBusinessMediaResponse(combinedRaw, targetLimit, since, until);
  normalized.metadata.has_more = hasMore;
  if (nextCursor) {
    if (!normalized.paging) normalized.paging = {};
    if (!normalized.paging.cursors) normalized.paging.cursors = {};
    normalized.paging.cursors.after = nextCursor;
  }

  return {
    data: normalized,
    rateLimit: lastRateLimit,
  };
}

export function registerIgBusinessMediaTools(server: McpServer, client: MetaClient): void {
  server.registerTool(
    "ig_get_business_media",
    {
      description:
        "Fetch public posts and carousels from another Instagram Business/Creator account via Business Discovery. " +
        "Includes likes, comments, timestamp, format metadata, and carousel children when requested. Read-only.",
      inputSchema: {
        username: igBusinessDiscoveryUsernameSchema,
        limit: z
          .number()
          .int()
          .positive()
          .max(MAX_BUSINESS_MEDIA_LIMIT)
          .optional()
          .default(DEFAULT_BUSINESS_MEDIA_LIMIT)
          .describe(
            `Number of posts to retrieve (1-${MAX_BUSINESS_MEDIA_LIMIT}, default: ${DEFAULT_BUSINESS_MEDIA_LIMIT})`
          ),
        after: z.string().optional().describe("Pagination cursor for next page of media"),
        since: z.string().optional().describe("Start date filter (Unix timestamp or ISO 8601 string)"),
        until: z.string().optional().describe("End date filter (Unix timestamp or ISO 8601 string)"),
        include_children: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to include carousel items/children (default: true)"),
        include_media_urls: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to request direct media URLs (default: true)"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ username, limit, after, since, until, include_children, include_media_urls }) => {
      try {
        const { data, rateLimit } = await fetchBusinessMedia({
          client,
          username,
          limit,
          after,
          since,
          until,
          includeChildren: include_children,
          includeMediaUrls: include_media_urls,
        });
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get business media");
      }
    }
  );
}
