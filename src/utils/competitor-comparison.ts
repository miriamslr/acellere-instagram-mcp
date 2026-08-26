import type { CompetitorAnalysisReport } from "./competitor-analytics.js";

export interface CompetitorComparisonItem {
  username: string;
  status: "ok" | "not_found" | "unsupported" | "error";
  error_message?: string;
  name?: string;
  followers_count: number;
  follows_count?: number;
  media_count?: number;
  posts_analyzed: number;
  posts_per_week: number;
  public_engagement_rate: {
    average: number;
    median: number;
  };
  average_likes: number;
  average_comments: number;
  average_views: number | null;
  reels_percentage: number;
  carousel_percentage: number;
  image_percentage: number;
  top_post?: {
    id: string;
    permalink: string | null;
    public_engagement_rate: number;
    like_count: number | null;
  };
}

export interface LeaderEntry {
  username: string;
  value: number;
}

export interface CompetitorLeaders {
  followers: LeaderEntry | null;
  public_engagement_rate: LeaderEntry | null;
  posting_frequency: LeaderEntry | null;
  average_likes: LeaderEntry | null;
  average_comments: LeaderEntry | null;
  average_views: LeaderEntry | null;
}

export interface CompetitorComparisonReport {
  [key: string]: unknown;
  summary: {
    total_accounts_requested: number;
    successful_accounts: number;
    failed_accounts: number;
    media_limit_per_account: number;
  };
  leaders: CompetitorLeaders;
  accounts: CompetitorComparisonItem[];
}

export function fromAnalysisReport(report: CompetitorAnalysisReport): CompetitorComparisonItem {
  const topPost = report.rankings.top_posts_by_engagement[0];
  return {
    username: report.account.username,
    status: "ok",
    name: report.account.name,
    followers_count: report.account.followers_count,
    follows_count: report.account.follows_count,
    media_count: report.account.media_count,
    posts_analyzed: report.sample.posts_analyzed,
    posts_per_week: report.sample.posts_per_week,
    public_engagement_rate: {
      average: report.metrics.public_engagement_rate.average,
      median: report.metrics.public_engagement_rate.median,
    },
    average_likes: report.metrics.likes.average,
    average_comments: report.metrics.comments.average,
    average_views: report.metrics.views.average,
    reels_percentage: report.formats.reels.percentage,
    carousel_percentage: report.formats.carousels.percentage,
    image_percentage: report.formats.images.percentage,
    top_post: topPost
      ? {
          id: topPost.id,
          permalink: topPost.permalink,
          public_engagement_rate: topPost.public_engagement_rate,
          like_count: topPost.like_count,
        }
      : undefined,
  };
}

export function extractLeaders(accounts: CompetitorComparisonItem[]): CompetitorLeaders {
  const okAccounts = accounts.filter((a) => a.status === "ok");

  const findMax = (
    getValue: (a: CompetitorComparisonItem) => number | null | undefined
  ): LeaderEntry | null => {
    let maxVal = -Infinity;
    let leader: string | null = null;

    for (const acc of okAccounts) {
      const v = getValue(acc);
      if (typeof v === "number" && !Number.isNaN(v) && v > maxVal) {
        maxVal = v;
        leader = acc.username;
      }
    }

    return leader !== null && maxVal > -Infinity
      ? { username: leader, value: Number(maxVal.toFixed(2)) }
      : null;
  };

  return {
    followers: findMax((a) => a.followers_count),
    public_engagement_rate: findMax((a) => a.public_engagement_rate.average),
    posting_frequency: findMax((a) => a.posts_per_week),
    average_likes: findMax((a) => a.average_likes),
    average_comments: findMax((a) => a.average_comments),
    average_views: findMax((a) => a.average_views),
  };
}

/**
 * Runs async tasks with a concurrency cap.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let currentIndex = 0;

  const workers = new Array(Math.min(concurrency, items.length))
    .fill(null)
    .map(async () => {
      while (currentIndex < items.length) {
        const idx = currentIndex++;
        const item = items[idx];
        if (item !== undefined) {
          results[idx] = await fn(item);
        }
      }
    });

  await Promise.all(workers);
  return results;
}
