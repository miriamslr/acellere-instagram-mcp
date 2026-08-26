import type {
  NormalizedBusinessMediaItem,
  NormalizedBusinessMediaResponse,
} from "./business-media-normalizer.js";

export function calculateMean(values: number[]): number {
  if (values.length === 0) return 0;
  const sum = values.reduce((acc, v) => acc + v, 0);
  return Number((sum / values.length).toFixed(2));
}

export function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 !== 0
      ? (sorted[mid] ?? 0)
      : ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) / 2;
  return Number(median.toFixed(2));
}

export function calculatePublicEngagementRate(
  likes: number | null | undefined,
  comments: number | null | undefined,
  followers: number | null | undefined
): number {
  const safeFollowers = followers ?? 0;
  if (safeFollowers <= 0) return 0;
  const safeLikes = likes ?? 0;
  const safeComments = comments ?? 0;
  const er = ((safeLikes + safeComments) / safeFollowers) * 100;
  return Number(er.toFixed(4));
}

export interface MetricSummary {
  average: number;
  median: number;
  min: number;
  max: number;
  total: number;
}

export interface OptionalMetricSummary {
  available_count: number;
  average: number | null;
  median: number | null;
  min: number | null;
  max: number | null;
}

export interface FormatPerformance {
  count: number;
  percentage: number;
  average_likes: number;
  median_likes: number;
  average_comments: number;
  average_views: number | null;
  average_engagement_rate: number;
  average_items_per_carousel?: number;
}

export interface TemporalSlot {
  label: string;
  count: number;
  percentage: number;
  average_likes: number;
  average_comments: number;
  average_engagement_rate: number;
}

export interface RankedPostSummary {
  id: string;
  permalink: string | null;
  timestamp: string;
  media_type: string;
  media_product_type: string | null;
  caption_snippet: string | null;
  like_count: number | null;
  comments_count: number | null;
  view_count: number | null;
  public_engagement_rate: number;
}

export interface CompetitorAnalysisReport {
  [key: string]: unknown;
  account: {
    id: string;
    username: string;
    name?: string;
    followers_count: number;
    follows_count?: number;
    media_count?: number;
    biography?: string;
    website?: string;
    profile_picture_url?: string;
  };
  sample: {
    posts_analyzed: number;
    observed_period: {
      start: string | null;
      end: string | null;
      duration_days: number;
    };
    posts_per_week: number;
    average_posting_interval_hours: number;
  };
  metrics: {
    likes: MetricSummary;
    comments: MetricSummary;
    views: OptionalMetricSummary;
    public_engagement_rate: {
      average: number;
      median: number;
      min: number;
      max: number;
      formula: string;
      note: string;
    };
  };
  formats: {
    reels: FormatPerformance;
    carousels: FormatPerformance;
    images: FormatPerformance;
    videos_other: FormatPerformance;
  };
  temporal: {
    by_day_of_week: Record<string, TemporalSlot>;
    by_hour_slot: Record<string, TemporalSlot>;
  };
  rankings: {
    top_posts_by_engagement: RankedPostSummary[];
    top_posts_by_likes: RankedPostSummary[];
    top_posts_by_comments: RankedPostSummary[];
    top_posts_by_views: RankedPostSummary[];
    bottom_posts_by_engagement: RankedPostSummary[];
  };
}

const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const HOUR_SLOTS = [
  { key: "night", label: "00:00 - 05:59 (Night)", start: 0, end: 5 },
  { key: "morning", label: "06:00 - 11:59 (Morning)", start: 6, end: 11 },
  { key: "afternoon", label: "12:00 - 17:59 (Afternoon)", start: 12, end: 17 },
  { key: "evening", label: "18:00 - 23:59 (Evening)", start: 18, end: 23 },
];

function summarizeNumbers(arr: number[]): MetricSummary {
  if (arr.length === 0) {
    return { average: 0, median: 0, min: 0, max: 0, total: 0 };
  }
  const total = arr.reduce((acc, v) => acc + v, 0);
  return {
    average: calculateMean(arr),
    median: calculateMedian(arr),
    min: Math.min(...arr),
    max: Math.max(...arr),
    total,
  };
}

function summarizeOptionalNumbers(arr: (number | null | undefined)[]): OptionalMetricSummary {
  const filtered = arr.filter((v): v is number => typeof v === "number" && !Number.isNaN(v));
  if (filtered.length === 0) {
    return {
      available_count: 0,
      average: null,
      median: null,
      min: null,
      max: null,
    };
  }
  return {
    available_count: filtered.length,
    average: calculateMean(filtered),
    median: calculateMedian(filtered),
    min: Math.min(...filtered),
    max: Math.max(...filtered),
  };
}

function formatRankedPost(
  item: NormalizedBusinessMediaItem,
  followersCount: number
): RankedPostSummary {
  const er = calculatePublicEngagementRate(item.like_count, item.comments_count, followersCount);
  const snippet = item.caption ? (item.caption.length > 80 ? item.caption.slice(0, 77) + "..." : item.caption) : null;
  return {
    id: item.id,
    permalink: item.permalink,
    timestamp: item.timestamp,
    media_type: item.media_type,
    media_product_type: item.media_product_type,
    caption_snippet: snippet,
    like_count: item.like_count,
    comments_count: item.comments_count,
    view_count: item.view_count,
    public_engagement_rate: er,
  };
}

export function analyzeCompetitorMedia(
  account: NormalizedBusinessMediaResponse["account"],
  media: NormalizedBusinessMediaItem[]
): CompetitorAnalysisReport {
  const followersCount = account.followers_count ?? 0;
  const postsAnalyzed = media.length;

  // Timestamps and period
  const timestamps = media
    .map((m) => Date.parse(m.timestamp))
    .filter((ts) => !Number.isNaN(ts))
    .sort((a, b) => a - b);

  let startIso: string | null = null;
  let endIso: string | null = null;
  let durationDays = 0;
  let postsPerWeek = 0;
  let avgIntervalHours = 0;

  const firstTimestamp = timestamps[0];
  const lastTimestamp = timestamps[timestamps.length - 1];

  if (firstTimestamp !== undefined && lastTimestamp !== undefined) {
    startIso = new Date(firstTimestamp).toISOString();
    endIso = new Date(lastTimestamp).toISOString();
    const diffMs = Math.max(1000, lastTimestamp - firstTimestamp);
    durationDays = Number((diffMs / (1000 * 60 * 60 * 24)).toFixed(2));
    const effectiveDays = Math.max(1, durationDays);
    postsPerWeek = Number(((postsAnalyzed / effectiveDays) * 7).toFixed(2));

    if (timestamps.length > 1) {
      const intervals: number[] = [];
      for (let i = 1; i < timestamps.length; i++) {
        const curr = timestamps[i];
        const prev = timestamps[i - 1];
        if (curr !== undefined && prev !== undefined) {
          intervals.push((curr - prev) / (1000 * 60 * 60));
        }
      }
      avgIntervalHours = calculateMean(intervals);
    }
  }

  // Aggregate metrics
  const likesList = media.map((m) => m.like_count ?? 0);
  const commentsList = media.map((m) => m.comments_count ?? 0);
  const viewsList = media.map((m) => m.view_count);
  const erList = media.map((m) =>
    calculatePublicEngagementRate(m.like_count, m.comments_count, followersCount)
  );

  const likesSummary = summarizeNumbers(likesList);
  const commentsSummary = summarizeNumbers(commentsList);
  const viewsSummary = summarizeOptionalNumbers(viewsList);

  const erSummary = {
    average: calculateMean(erList),
    median: calculateMedian(erList),
    min: erList.length > 0 ? Math.min(...erList) : 0,
    max: erList.length > 0 ? Math.max(...erList) : 0,
    formula: "(like_count + comments_count) / followers_count * 100",
    note: "Public apparent engagement rate based on visible interactions. Private metrics (reach, impressions, saves, shares) are not available for third-party accounts.",
  };

  // Formats classification
  const reelsItems = media.filter(
    (m) => m.media_product_type === "REELS" || (m.media_type === "VIDEO" && m.media_product_type !== "FEED")
  );
  const carouselItems = media.filter((m) => m.media_type === "CAROUSEL_ALBUM");
  const imageItems = media.filter((m) => m.media_type === "IMAGE");
  const otherVideoItems = media.filter(
    (m) => m.media_type === "VIDEO" && m.media_product_type === "FEED"
  );

  const formatPerformance = (
    items: NormalizedBusinessMediaItem[],
    extra?: { average_items_per_carousel?: number }
  ): FormatPerformance => {
    const count = items.length;
    const percentage = postsAnalyzed > 0 ? Number(((count / postsAnalyzed) * 100).toFixed(2)) : 0;
    const lks = items.map((i) => i.like_count ?? 0);
    const cmts = items.map((i) => i.comments_count ?? 0);
    const ers = items.map((i) =>
      calculatePublicEngagementRate(i.like_count, i.comments_count, followersCount)
    );
    const vws = summarizeOptionalNumbers(items.map((i) => i.view_count));

    return {
      count,
      percentage,
      average_likes: calculateMean(lks),
      median_likes: calculateMedian(lks),
      average_comments: calculateMean(cmts),
      average_views: vws.average,
      average_engagement_rate: calculateMean(ers),
      ...extra,
    };
  };

  const carouselChildCounts = carouselItems.map((c) => c.children?.length ?? 0).filter((c) => c > 0);
  const avgItemsPerCarousel = carouselChildCounts.length > 0 ? calculateMean(carouselChildCounts) : 0;

  const formats = {
    reels: formatPerformance(reelsItems),
    carousels: formatPerformance(carouselItems, {
      average_items_per_carousel: avgItemsPerCarousel,
    }),
    images: formatPerformance(imageItems),
    videos_other: formatPerformance(otherVideoItems),
  };

  // Temporal analysis
  const byDayOfWeek: Record<string, TemporalSlot> = {};
  for (const day of DAYS_OF_WEEK) {
    byDayOfWeek[day] = {
      label: day,
      count: 0,
      percentage: 0,
      average_likes: 0,
      average_comments: 0,
      average_engagement_rate: 0,
    };
  }

  const byHourSlot: Record<string, TemporalSlot> = {};
  for (const slot of HOUR_SLOTS) {
    byHourSlot[slot.key] = {
      label: slot.label,
      count: 0,
      percentage: 0,
      average_likes: 0,
      average_comments: 0,
      average_engagement_rate: 0,
    };
  }

  const dayBuckets: Record<string, NormalizedBusinessMediaItem[]> = {};
  const hourBuckets: Record<string, NormalizedBusinessMediaItem[]> = {};

  for (const item of media) {
    const date = new Date(item.timestamp);
    if (Number.isNaN(date.getTime())) continue;

    const dayIndex = date.getUTCDay();
    const dayName = DAYS_OF_WEEK[dayIndex] ?? "Sunday";
    if (!dayBuckets[dayName]) dayBuckets[dayName] = [];
    dayBuckets[dayName]!.push(item);

    const hour = date.getUTCHours();
    const defaultSlot = HOUR_SLOTS[0] as (typeof HOUR_SLOTS)[0];
    const slot = HOUR_SLOTS.find((s) => hour >= s.start && hour <= s.end) ?? defaultSlot;
    if (!hourBuckets[slot.key]) hourBuckets[slot.key] = [];
    hourBuckets[slot.key]!.push(item);
  }

  for (const day of DAYS_OF_WEEK) {
    const items = dayBuckets[day] ?? [];
    if (items.length > 0) {
      const p = formatPerformance(items);
      byDayOfWeek[day] = {
        label: day,
        count: items.length,
        percentage: Number(((items.length / postsAnalyzed) * 100).toFixed(2)),
        average_likes: p.average_likes,
        average_comments: p.average_comments,
        average_engagement_rate: p.average_engagement_rate,
      };
    }
  }

  for (const slot of HOUR_SLOTS) {
    const items = hourBuckets[slot.key] ?? [];
    if (items.length > 0) {
      const p = formatPerformance(items);
      byHourSlot[slot.key] = {
        label: slot.label,
        count: items.length,
        percentage: Number(((items.length / postsAnalyzed) * 100).toFixed(2)),
        average_likes: p.average_likes,
        average_comments: p.average_comments,
        average_engagement_rate: p.average_engagement_rate,
      };
    }
  }

  // Rankings
  const rankedItems = media.map((item) => formatRankedPost(item, followersCount));

  const topByEngagement = [...rankedItems]
    .sort((a, b) => b.public_engagement_rate - a.public_engagement_rate)
    .slice(0, 5);

  const bottomByEngagement = [...rankedItems]
    .sort((a, b) => a.public_engagement_rate - b.public_engagement_rate)
    .slice(0, 5);

  const topByLikes = [...rankedItems]
    .sort((a, b) => (b.like_count ?? 0) - (a.like_count ?? 0))
    .slice(0, 5);

  const topByComments = [...rankedItems]
    .sort((a, b) => (b.comments_count ?? 0) - (a.comments_count ?? 0))
    .slice(0, 5);

  const topByViews = [...rankedItems]
    .filter((item) => typeof item.view_count === "number")
    .sort((a, b) => (b.view_count ?? 0) - (a.view_count ?? 0))
    .slice(0, 5);

  return {
    account: {
      id: account.id,
      username: account.username,
      name: account.name,
      followers_count: followersCount,
      follows_count: account.follows_count,
      media_count: account.media_count,
      biography: account.biography,
      website: account.website,
      profile_picture_url: account.profile_picture_url,
    },
    sample: {
      posts_analyzed: postsAnalyzed,
      observed_period: {
        start: startIso,
        end: endIso,
        duration_days: durationDays,
      },
      posts_per_week: postsPerWeek,
      average_posting_interval_hours: avgIntervalHours,
    },
    metrics: {
      likes: likesSummary,
      comments: commentsSummary,
      views: viewsSummary,
      public_engagement_rate: erSummary,
    },
    formats,
    temporal: {
      by_day_of_week: byDayOfWeek,
      by_hour_slot: byHourSlot,
    },
    rankings: {
      top_posts_by_engagement: topByEngagement,
      top_posts_by_likes: topByLikes,
      top_posts_by_comments: topByComments,
      top_posts_by_views: topByViews,
      bottom_posts_by_engagement: bottomByEngagement,
    },
  };
}
