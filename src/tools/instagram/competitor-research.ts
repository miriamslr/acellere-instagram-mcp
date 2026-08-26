import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient, type RateLimit } from "../../services/meta-client.js";
import { igBusinessDiscoveryUsernameSchema } from "./profile.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { READ_ONLY_TOOL } from "../annotations.js";
import { fetchBusinessMedia } from "./business-media.js";
import {
  analyzeCompetitorMedia,
  type CompetitorAnalysisReport,
} from "../../utils/competitor-analytics.js";
import {
  fromAnalysisReport,
  extractLeaders,
  mapConcurrent,
  type CompetitorComparisonItem,
  type CompetitorLeaders,
} from "../../utils/competitor-comparison.js";
import {
  getGlobalCompetitorStore,
  type CompetitorStore,
  type CompetitorSnapshotRecord,
} from "../../services/competitor-store.js";
import { resolvePeriodDate } from "./competitor-tracking.js";

export const MAX_RESEARCH_ACCOUNTS = 10;
export const MAX_RESEARCH_POSTS_PER_ACCOUNT = 50;
export const DEFAULT_RESEARCH_POSTS_PER_ACCOUNT = 30;
export const RESEARCH_CONCURRENCY = 3;

export interface CompetitorResearchAccountDetail {
  username: string;
  status: "ok" | "not_found" | "unsupported" | "error";
  error_message?: string;
  analysis?: CompetitorAnalysisReport;
  recent_posts_sample?: Array<{
    id: string;
    caption: string | null;
    media_type: string;
    media_product_type: string | null;
    permalink: string | null;
    timestamp: string;
    like_count: number | null;
    comments_count: number | null;
    view_count: number | null;
    carousel_items_count?: number;
  }>;
  history?: {
    is_tracked: boolean;
    period?: string;
    snapshots_used?: number;
    followers_start?: number;
    followers_end?: number;
    followers_delta_percentage?: number;
    average_weekly_follower_growth?: number;
    note?: string;
  };
}

export interface CompetitorResearchDataset {
  [key: string]: unknown;
  research_metadata: {
    accounts_requested: number;
    accounts_successful: number;
    accounts_failed: number;
    posts_per_account_requested: number;
    generated_at: string;
    architecture_note: string;
  };
  benchmark_summary: {
    leaders: CompetitorLeaders;
    accounts_overview: CompetitorComparisonItem[];
  };
  accounts_detail: CompetitorResearchAccountDetail[];
}

export function registerIgCompetitorResearchTools(
  server: McpServer,
  client: MetaClient,
  store: CompetitorStore = getGlobalCompetitorStore()
): void {
  server.registerTool(
    "ig_competitor_research",
    {
      description:
        "High-level market research orchestrator for Instagram competitor benchmarking. " +
        "Collects public profiles, recent posts, carousels, computes deterministic metrics, " +
        "and builds a structured dataset ready for downstream LLM analysis (copy, positioning, angles, JTBD). Read-only.",
      inputSchema: {
        usernames: z
          .array(igBusinessDiscoveryUsernameSchema)
          .min(1, "Provide at least 1 username to research")
          .max(MAX_RESEARCH_ACCOUNTS, `Maximum of ${MAX_RESEARCH_ACCOUNTS} accounts per research call`)
          .describe(`Array of Instagram Business/Creator usernames (1 to ${MAX_RESEARCH_ACCOUNTS})`),
        posts_per_account: z
          .number()
          .int()
          .positive()
          .max(MAX_RESEARCH_POSTS_PER_ACCOUNT)
          .optional()
          .default(DEFAULT_RESEARCH_POSTS_PER_ACCOUNT)
          .describe(
            `Number of recent posts to analyze per account (default: ${DEFAULT_RESEARCH_POSTS_PER_ACCOUNT}, max: ${MAX_RESEARCH_POSTS_PER_ACCOUNT})`
          ),
        include_children: z
          .boolean()
          .optional()
          .default(true)
          .describe("Whether to include carousel children/items (default: true)"),
        include_history: z
          .boolean()
          .optional()
          .default(false)
          .describe("Whether to attach stored historical snapshot growth data if tracked (default: false)"),
        history_period: z
          .enum(["7d", "30d", "90d"])
          .optional()
          .default("30d")
          .describe("Time period for historical growth data (default: 30d)"),
        since: z.string().optional().describe("Start date filter (Unix timestamp or ISO 8601 string)"),
        until: z.string().optional().describe("End date filter (Unix timestamp or ISO 8601 string)"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({
      usernames,
      posts_per_account,
      include_children,
      include_history,
      history_period,
      since,
      until,
    }) => {
      try {
        let lastRateLimit: RateLimit | undefined;

        const accountsDetail = await mapConcurrent(
          usernames,
          RESEARCH_CONCURRENCY,
          async (username): Promise<CompetitorResearchAccountDetail> => {
            try {
              const { data: mediaResponse, rateLimit } = await fetchBusinessMedia({
                client,
                username,
                limit: posts_per_account,
                includeChildren: include_children,
                includeMediaUrls: false,
                since,
                until,
              });

              if (rateLimit) lastRateLimit = rateLimit;

              const analysis = analyzeCompetitorMedia(
                mediaResponse.account,
                mediaResponse.media
              );

              // Compact content sample for downstream agent consumption
              const recentPostsSample = mediaResponse.media.map((m) => ({
                id: m.id,
                caption: m.caption,
                media_type: m.media_type,
                media_product_type: m.media_product_type,
                permalink: m.permalink,
                timestamp: m.timestamp,
                like_count: m.like_count,
                comments_count: m.comments_count,
                view_count: m.view_count,
                carousel_items_count: m.children?.length,
              }));

              let historyData: CompetitorResearchAccountDetail["history"] | undefined;

              if (include_history) {
                const comp = await store.getCompetitorByUsername(username);
                if (!comp) {
                  historyData = {
                    is_tracked: false,
                    note: "Account is not registered in historical tracking store.",
                  };
                } else {
                  const { sinceIso, untilIso } = resolvePeriodDate(history_period, since, until);
                  const effectiveUntil = until ? new Date(until).toISOString() : untilIso;
                  const snaps = await store.getCompetitorSnapshots(comp.id, sinceIso, effectiveUntil);

                  if (snaps.length >= 2) {
                    const firstSnap = snaps[0] as CompetitorSnapshotRecord;
                    const lastSnap = snaps[snaps.length - 1] as CompetitorSnapshotRecord;
                    const firstTime = Date.parse(firstSnap.captured_at);
                    const lastTime = Date.parse(lastSnap.captured_at);
                    const durationDays = Math.max(0.01, (lastTime - firstTime) / (1000 * 60 * 60 * 24));
                    const delta = lastSnap.followers_count - firstSnap.followers_count;
                    const deltaPct =
                      firstSnap.followers_count > 0
                        ? Number(((delta / firstSnap.followers_count) * 100).toFixed(2))
                        : 0;
                    const weeklyGrowth = Number(((delta / durationDays) * 7).toFixed(2));

                    historyData = {
                      is_tracked: true,
                      period: history_period,
                      snapshots_used: snaps.length,
                      followers_start: firstSnap.followers_count,
                      followers_end: lastSnap.followers_count,
                      followers_delta_percentage: deltaPct,
                      average_weekly_follower_growth: weeklyGrowth,
                    };
                  } else {
                    historyData = {
                      is_tracked: true,
                      snapshots_used: snaps.length,
                      note: "Insufficient snapshots for historical calculation (requires at least 2).",
                    };
                  }
                }
              }

              return {
                username,
                status: "ok",
                analysis,
                recent_posts_sample: recentPostsSample,
                history: historyData,
              };
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err);
              let status: CompetitorResearchAccountDetail["status"] = "error";

              if (/not found|does not exist|non-existent/i.test(message)) {
                status = "not_found";
              } else if (/unsupported|personal|permission|capability|business/i.test(message)) {
                status = "unsupported";
              }

              return {
                username,
                status,
                error_message: message,
              };
            }
          }
        );

        // Build comparison overview items
        const comparisonOverview: CompetitorComparisonItem[] = accountsDetail.map((acc) => {
          if (acc.status === "ok" && acc.analysis) {
            return fromAnalysisReport(acc.analysis);
          }
          return {
            username: acc.username,
            status: acc.status,
            error_message: acc.error_message,
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
        });

        const successfulCount = accountsDetail.filter((a) => a.status === "ok").length;
        const failedCount = accountsDetail.length - successfulCount;
        const leaders = extractLeaders(comparisonOverview);

        const dataset: CompetitorResearchDataset = {
          research_metadata: {
            accounts_requested: usernames.length,
            accounts_successful: successfulCount,
            accounts_failed: failedCount,
            posts_per_account_requested: posts_per_account,
            generated_at: new Date().toISOString(),
            architecture_note:
              "Deterministic data only. Semantic and qualitative analysis (positioning, hooks, CTAs, copy quality, JTBD) should be performed downstream by ChatGPT/Acellere Marketing Intelligence.",
          },
          benchmark_summary: {
            leaders,
            accounts_overview: comparisonOverview,
          },
          accounts_detail: accountsDetail,
        };

        return formatResponse(dataset, lastRateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Competitor research");
      }
    }
  );
}
