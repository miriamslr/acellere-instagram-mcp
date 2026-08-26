import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient, type RateLimit } from "../../services/meta-client.js";
import { igBusinessDiscoveryUsernameSchema } from "./profile.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { READ_ONLY_TOOL } from "../annotations.js";
import { fetchBusinessMedia } from "./business-media.js";
import { analyzeCompetitorMedia } from "../../utils/competitor-analytics.js";
import {
  fromAnalysisReport,
  extractLeaders,
  mapConcurrent,
  type CompetitorComparisonItem,
  type CompetitorComparisonReport,
} from "../../utils/competitor-comparison.js";

export const MAX_COMPARE_ACCOUNTS = 10;
export const DEFAULT_COMPARE_MEDIA_LIMIT = 30;
export const COMPARE_CONCURRENCY = 3;

export function registerIgBusinessComparisonTools(server: McpServer, client: MetaClient): void {
  server.registerTool(
    "ig_compare_businesses",
    {
      description:
        "Compare multiple Instagram Business/Creator accounts side-by-side using public metrics. " +
        "Analyzes apparent engagement rate, posting frequency, format distribution (% Reels, % Carousels), " +
        "and identifies objective metric leaders. Supports up to 10 accounts with isolated error handling. Read-only.",
      inputSchema: {
        usernames: z
          .array(igBusinessDiscoveryUsernameSchema)
          .min(1, "Provide at least 1 account username to compare")
          .max(MAX_COMPARE_ACCOUNTS, `Maximum of ${MAX_COMPARE_ACCOUNTS} accounts per comparison`)
          .describe(
            `Array of Instagram Business/Creator usernames (1 to ${MAX_COMPARE_ACCOUNTS} accounts)`
          ),
        media_limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .default(DEFAULT_COMPARE_MEDIA_LIMIT)
          .describe(
            `Number of recent posts to analyze per account (default: ${DEFAULT_COMPARE_MEDIA_LIMIT})`
          ),
        since: z.string().optional().describe("Start date filter (Unix timestamp or ISO 8601 string)"),
        until: z.string().optional().describe("End date filter (Unix timestamp or ISO 8601 string)"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ usernames, media_limit, since, until }) => {
      try {
        let lastRateLimit: RateLimit | undefined;

        // Execute queries with controlled concurrency to respect rate limits
        const comparisonItems = await mapConcurrent(
          usernames,
          COMPARE_CONCURRENCY,
          async (username): Promise<CompetitorComparisonItem> => {
            try {
              const { data: mediaResponse, rateLimit } = await fetchBusinessMedia({
                client,
                username,
                limit: media_limit,
                since,
                until,
                includeChildren: true,
                includeMediaUrls: false,
              });

              if (rateLimit) lastRateLimit = rateLimit;

              const report = analyzeCompetitorMedia(
                mediaResponse.account,
                mediaResponse.media
              );
              return fromAnalysisReport(report);
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              let status: CompetitorComparisonItem["status"] = "error";

              if (/not found|does not exist|non-existent/i.test(message)) {
                status = "not_found";
              } else if (/unsupported|personal|permission|capability|not eligible|not (?:a )?(?:business|creator|professional)|(?:business|creator|professional) account (?:is )?required/i.test(message)) {
                status = "unsupported";
              }

              return {
                username,
                status,
                error_message: message,
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
              };
            }
          }
        );

        const successfulCount = comparisonItems.filter((item) => item.status === "ok").length;
        const failedCount = comparisonItems.length - successfulCount;
        const leaders = extractLeaders(comparisonItems);

        const report: CompetitorComparisonReport = {
          summary: {
            total_accounts_requested: usernames.length,
            successful_accounts: successfulCount,
            failed_accounts: failedCount,
            media_limit_per_account: media_limit,
          },
          leaders,
          accounts: comparisonItems,
        };

        return formatResponse(report, lastRateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Compare businesses");
      }
    }
  );
}
