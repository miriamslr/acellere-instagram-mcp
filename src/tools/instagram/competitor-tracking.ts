import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { igBusinessDiscoveryUsernameSchema } from "./profile.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { READ_ONLY_TOOL, WRITE_IDEMPOTENT_TOOL } from "../annotations.js";
import { fetchBusinessMedia } from "./business-media.js";
import {
  getGlobalCompetitorStore,
  type CompetitorStore,
  type CompetitorSnapshotRecord,
} from "../../services/competitor-store.js";

export function resolvePeriodDate(
  period?: "7d" | "30d" | "90d" | "custom",
  since?: string,
  until?: string
): {
  sinceIso?: string;
  untilIso?: string;
} {
  const now = until ? new Date(until) : new Date();
  if (period === "7d") {
    const d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { sinceIso: d.toISOString(), untilIso: now.toISOString() };
  }
  if (period === "30d") {
    const d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { sinceIso: d.toISOString(), untilIso: now.toISOString() };
  }
  if (period === "90d") {
    const d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    return { sinceIso: d.toISOString(), untilIso: now.toISOString() };
  }
  return {
    sinceIso: since ? new Date(since).toISOString() : undefined,
    untilIso: until ? new Date(until).toISOString() : new Date().toISOString(),
  };
}

export function registerIgCompetitorTrackingTools(
  server: McpServer,
  client: MetaClient,
  store: CompetitorStore = getGlobalCompetitorStore()
): void {
  // ─── ig_track_business ───────────────────────────────────────
  server.registerTool(
    "ig_track_business",
    {
      description:
        "Add another Instagram Business/Creator account to the active tracking list and capture an initial snapshot. " +
        "Stores baseline profile and recent media metrics for future historical tracking. Idempotent.",
      inputSchema: {
        username: igBusinessDiscoveryUsernameSchema,
      },
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async ({ username }) => {
      try {
        const { data: mediaResponse, rateLimit } = await fetchBusinessMedia({
          client,
          username,
          limit: 25,
          includeChildren: true,
          includeMediaUrls: false,
        });

        const account = mediaResponse.account;
        const now = new Date().toISOString();

        // 1. Upsert competitor
        const competitor = await store.upsertCompetitor({
          instagram_id: account.id,
          username: account.username,
          name: account.name,
          is_active: true,
        });

        // 2. Add initial profile snapshot
        const snapshot = await store.addCompetitorSnapshot({
          competitor_id: competitor.id,
          captured_at: now,
          followers_count: account.followers_count ?? 0,
          follows_count: account.follows_count ?? 0,
          media_count: account.media_count ?? 0,
          biography: account.biography,
          website: account.website,
          profile_picture_url: account.profile_picture_url,
        });

        // 3. Upsert media and media snapshots
        let mediaCaptured = 0;
        for (const item of mediaResponse.media) {
          const mediaRec = await store.upsertCompetitorMedia({
            instagram_media_id: item.id,
            competitor_id: competitor.id,
            caption: item.caption,
            media_type: item.media_type,
            media_product_type: item.media_product_type,
            permalink: item.permalink,
            published_at: item.timestamp,
            children_count: item.children?.length ?? 0,
          });

          await store.addMediaSnapshot({
            media_id: mediaRec.id,
            captured_at: now,
            like_count: item.like_count,
            comments_count: item.comments_count,
            view_count: item.view_count,
          });
          mediaCaptured++;
        }

        return formatResponse(
          {
            success: true,
            message: `Account @${competitor.username} successfully registered for tracking. Initial snapshot captured.`,
            competitor,
            initial_snapshot: snapshot,
            media_captured: mediaCaptured,
          },
          rateLimit
        );
      } catch (error) {
        return formatErrorResponse(error, "Track business");
      }
    }
  );

  // ─── ig_untrack_business ─────────────────────────────────────
  server.registerTool(
    "ig_untrack_business",
    {
      description:
        "Deactivate automatic recurrent collection for a tracked Instagram Business/Creator account. " +
        "Preserves all previously captured historical snapshots and media. Idempotent.",
      inputSchema: {
        username: igBusinessDiscoveryUsernameSchema,
      },
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async ({ username }) => {
      try {
        const found = await store.getCompetitorByUsername(username);
        if (!found) {
          return formatResponse({
            success: false,
            message: `Account @${username} is not currently registered in the tracking store.`,
          });
        }

        await store.setCompetitorActiveStatus(username, false);
        return formatResponse({
          success: true,
          username: found.username,
          is_active: false,
          message: `Tracking deactivated for @${found.username}. All existing historical data and snapshots remain safely stored.`,
        });
      } catch (error) {
        return formatErrorResponse(error, "Untrack business");
      }
    }
  );

  // ─── ig_get_business_history ─────────────────────────────────
  server.registerTool(
    "ig_get_business_history",
    {
      description:
        "Query historical evolution and metrics changes for a tracked Instagram Business/Creator account based on stored snapshots. " +
        "Calculates follower growth, publishing pace, and content performance trends across periods like 7d, 30d, 90d, or custom dates. Read-only.",
      inputSchema: {
        username: igBusinessDiscoveryUsernameSchema,
        period: z
          .enum(["7d", "30d", "90d", "custom"])
          .optional()
          .default("30d")
          .describe("Time period to analyze ('7d', '30d', '90d', or 'custom')"),
        since: z.string().optional().describe("Start date filter for 'custom' period (Unix or ISO 8601)"),
        until: z.string().optional().describe("End date filter for 'custom' period (Unix or ISO 8601)"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ username, period, since, until }) => {
      try {
        const competitor = await store.getCompetitorByUsername(username);
        if (!competitor) {
          return formatResponse({
            status: "not_tracked",
            message: `Account @${username} is not currently monitored. Use ig_track_business to start capturing snapshots.`,
          });
        }

        const { sinceIso, untilIso } = resolvePeriodDate(period, since);
        const effectiveUntil = until ? new Date(until).toISOString() : untilIso;

        const snapshots = await store.getCompetitorSnapshots(
          competitor.id,
          sinceIso,
          effectiveUntil
        );

        if (snapshots.length === 0) {
          return formatResponse({
            status: "no_snapshots_in_period",
            competitor,
            period,
            message: `No snapshots found for @${username} in the requested interval.`,
          });
        }

        if (snapshots.length === 1) {
          const onlySnap = snapshots[0] as CompetitorSnapshotRecord;
          return formatResponse({
            status: "insufficient_snapshots",
            competitor,
            period,
            snapshots_count: 1,
            single_snapshot: onlySnap,
            message: `Only 1 snapshot is available for @${username} in this period (captured at ${onlySnap.captured_at}). Historical variation requires at least 2 snapshots.`,
          });
        }

        const firstSnap = snapshots[0] as CompetitorSnapshotRecord;
        const lastSnap = snapshots[snapshots.length - 1] as CompetitorSnapshotRecord;

        const firstTime = Date.parse(firstSnap.captured_at);
        const lastTime = Date.parse(lastSnap.captured_at);
        const durationDays = Math.max(
          0.01,
          Number(((lastTime - firstTime) / (1000 * 60 * 60 * 24)).toFixed(2))
        );

        const followersDeltaAbs = lastSnap.followers_count - firstSnap.followers_count;
        const followersDeltaPct =
          firstSnap.followers_count > 0
            ? Number(((followersDeltaAbs / firstSnap.followers_count) * 100).toFixed(2))
            : 0;

        const followsDeltaAbs = lastSnap.follows_count - firstSnap.follows_count;
        const mediaCountDeltaAbs = lastSnap.media_count - firstSnap.media_count;

        const avgDailyGrowth = Number((followersDeltaAbs / durationDays).toFixed(2));
        const avgWeeklyGrowth = Number((avgDailyGrowth * 7).toFixed(2));

        // Content evolution
        const mediaWithSnaps = await store.getMediaWithSnapshots(
          competitor.id,
          sinceIso,
          effectiveUntil
        );

        const contentEvolution = mediaWithSnaps.map(({ media, snapshots: snaps }) => {
          const firstMediaSnap = snaps[0];
          const lastMediaSnap = snaps[snaps.length - 1];
          const likesDelta =
            firstMediaSnap && lastMediaSnap && lastMediaSnap.like_count !== null && firstMediaSnap.like_count !== null
              ? lastMediaSnap.like_count - firstMediaSnap.like_count
              : 0;
          return {
            id: media.instagram_media_id,
            caption: media.caption,
            media_type: media.media_type,
            published_at: media.published_at,
            snapshots_count: snaps.length,
            likes_start: firstMediaSnap?.like_count ?? null,
            likes_end: lastMediaSnap?.like_count ?? null,
            likes_delta: likesDelta,
            comments_end: lastMediaSnap?.comments_count ?? null,
            views_end: lastMediaSnap?.view_count ?? null,
          };
        });

        return formatResponse({
          status: "ok",
          competitor,
          period_analyzed: {
            period,
            start_snapshot_at: firstSnap.captured_at,
            end_snapshot_at: lastSnap.captured_at,
            duration_days: durationDays,
            total_snapshots_used: snapshots.length,
          },
          profile_growth: {
            followers_start: firstSnap.followers_count,
            followers_end: lastSnap.followers_count,
            followers_delta_absolute: followersDeltaAbs,
            followers_delta_percentage: followersDeltaPct,
            average_daily_follower_growth: avgDailyGrowth,
            average_weekly_follower_growth: avgWeeklyGrowth,
            follows_start: firstSnap.follows_count,
            follows_end: lastSnap.follows_count,
            follows_delta_absolute: followsDeltaAbs,
            media_count_start: firstSnap.media_count,
            media_count_end: lastSnap.media_count,
            new_posts_in_period: mediaCountDeltaAbs,
          },
          content_evolution: contentEvolution.slice(0, 10),
        });
      } catch (error) {
        return formatErrorResponse(error, "Get business history");
      }
    }
  );

  // ─── ig_run_competitor_collection ────────────────────────────
  server.registerTool(
    "ig_run_competitor_collection",
    {
      description:
        "Execute recurrent snapshot collection cycle for all actively monitored competitor accounts. " +
        "Queries fresh profile and media metrics, persists snapshots, and logs collection run audit. Idempotent.",
      inputSchema: {},
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async () => {
      const startTime = new Date().toISOString();
      const activeCompetitors = await store.listActiveCompetitors();

      const runRecord = await store.createCollectionRun({
        started_at: startTime,
        status: "running",
        accounts_requested: activeCompetitors.length,
        accounts_successful: 0,
        accounts_failed: 0,
        api_calls: 0,
      });

      let successful = 0;
      let failed = 0;
      let apiCalls = 0;
      const errors: Array<{ username: string; error: string }> = [];

      for (const competitor of activeCompetitors) {
        try {
          const { data: mediaResponse } = await fetchBusinessMedia({
            client,
            username: competitor.username,
            limit: 25,
            includeChildren: true,
            includeMediaUrls: false,
          });
          apiCalls++;

          const account = mediaResponse.account;
          const captureTime = new Date().toISOString();

          await store.addCompetitorSnapshot({
            competitor_id: competitor.id,
            captured_at: captureTime,
            followers_count: account.followers_count ?? 0,
            follows_count: account.follows_count ?? 0,
            media_count: account.media_count ?? 0,
            biography: account.biography,
            website: account.website,
            profile_picture_url: account.profile_picture_url,
          });

          for (const item of mediaResponse.media) {
            const mediaRec = await store.upsertCompetitorMedia({
              instagram_media_id: item.id,
              competitor_id: competitor.id,
              caption: item.caption,
              media_type: item.media_type,
              media_product_type: item.media_product_type,
              permalink: item.permalink,
              published_at: item.timestamp,
              children_count: item.children?.length ?? 0,
            });

            await store.addMediaSnapshot({
              media_id: mediaRec.id,
              captured_at: captureTime,
              like_count: item.like_count,
              comments_count: item.comments_count,
              view_count: item.view_count,
            });
          }

          successful++;
        } catch (err: unknown) {
          failed++;
          const msg = err instanceof Error ? err.message : String(err);
          errors.push({ username: competitor.username, error: msg });
        }
      }

      const finishTime = new Date().toISOString();
      const finalStatus: "completed" | "failed" | "partial" =
        failed === 0 ? "completed" : successful > 0 ? "partial" : "failed";

      const updatedRun = await store.updateCollectionRun(runRecord.id, {
        finished_at: finishTime,
        status: finalStatus,
        accounts_successful: successful,
        accounts_failed: failed,
        api_calls: apiCalls,
        errors: errors.length > 0 ? errors : null,
      });

      return formatResponse({
        collection_run: updatedRun,
        summary: {
          accounts_requested: activeCompetitors.length,
          accounts_successful: successful,
          accounts_failed: failed,
          api_calls: apiCalls,
          errors,
        },
      });
    }
  );
}
