export interface NormalizedBusinessMediaChild {
  id: string;
  media_type: string;
  media_url?: string | null;
  thumbnail_url?: string | null;
  timestamp?: string;
  username?: string;
  permalink?: string;
}

export interface NormalizedBusinessMediaItem {
  id: string;
  caption: string | null;
  media_type: string;
  media_product_type: string | null;
  media_url?: string | null;
  thumbnail_url?: string | null;
  permalink: string | null;
  timestamp: string;
  username?: string;
  like_count: number | null;
  comments_count: number | null;
  view_count: number | null;
  children?: NormalizedBusinessMediaChild[];
}

export interface NormalizedBusinessMediaResponse {
  [key: string]: unknown;
  account: {
    id: string;
    username: string;
    name?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    biography?: string;
    website?: string;
    profile_picture_url?: string;
  };
  media: NormalizedBusinessMediaItem[];
  paging?: {
    cursors?: {
      after?: string;
      before?: string;
    };
    next?: string;
  };
  metadata: {
    requested_limit: number;
    returned_count: number;
    has_more: boolean;
  };
}

export interface RawMediaChild {
  id?: string;
  media_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  timestamp?: string;
  username?: string;
  permalink?: string;
}

export interface RawMediaItem {
  id?: string;
  caption?: string;
  media_type?: string;
  media_product_type?: string;
  media_url?: string;
  thumbnail_url?: string;
  permalink?: string;
  timestamp?: string;
  username?: string;
  like_count?: number;
  comments_count?: number;
  view_count?: number;
  children?: {
    data?: RawMediaChild[];
  };
}

export interface RawBusinessDiscoveryData {
  business_discovery?: {
    id?: string;
    username?: string;
    name?: string;
    followers_count?: number;
    follows_count?: number;
    media_count?: number;
    biography?: string;
    website?: string;
    profile_picture_url?: string;
    media?: {
      data?: RawMediaItem[];
      paging?: {
        cursors?: {
          after?: string;
          before?: string;
        };
        next?: string;
      };
    };
  };
}

/**
 * Normalizes a single raw media item from Business Discovery.
 * Crucially preserves view_count as null when absent, rather than defaulting to 0.
 */
export function normalizeMediaItem(raw: RawMediaItem): NormalizedBusinessMediaItem {
  const children: NormalizedBusinessMediaChild[] | undefined = raw.children?.data
    ? raw.children.data.map((c) => ({
        id: String(c.id ?? ""),
        media_type: String(c.media_type ?? "IMAGE"),
        media_url: c.media_url ?? null,
        thumbnail_url: c.thumbnail_url ?? null,
        timestamp: c.timestamp,
        username: c.username,
        permalink: c.permalink,
      }))
    : undefined;

  return {
    id: String(raw.id ?? ""),
    caption: raw.caption ?? null,
    media_type: String(raw.media_type ?? "IMAGE"),
    media_product_type: raw.media_product_type ?? (raw.media_type === "VIDEO" ? "FEED" : null),
    media_url: raw.media_url ?? null,
    thumbnail_url: raw.thumbnail_url ?? null,
    permalink: raw.permalink ?? null,
    timestamp: raw.timestamp ?? new Date().toISOString(),
    username: raw.username,
    like_count: typeof raw.like_count === "number" ? raw.like_count : null,
    comments_count: typeof raw.comments_count === "number" ? raw.comments_count : null,
    view_count: typeof raw.view_count === "number" ? raw.view_count : null,
    ...(children ? { children } : {}),
  };
}

/**
 * Parses timestamps in either ISO 8601 string or Unix timestamp format (seconds or ms).
 */
export function parseDateFilter(value?: string): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    // If in seconds (< 10^11), convert to ms
    return num < 1e11 ? num * 1000 : num;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * Filters normalized media items within an optional date window.
 */
export function filterMediaByDate(
  items: NormalizedBusinessMediaItem[],
  since?: string,
  until?: string
): NormalizedBusinessMediaItem[] {
  const sinceMs = parseDateFilter(since);
  const untilMs = parseDateFilter(until);

  if (sinceMs === undefined && untilMs === undefined) {
    return items;
  }

  return items.filter((item) => {
    const itemMs = Date.parse(item.timestamp);
    if (Number.isNaN(itemMs)) return true;
    if (sinceMs !== undefined && itemMs < sinceMs) return false;
    if (untilMs !== undefined && itemMs > untilMs) return false;
    return true;
  });
}

/**
 * Normalizes full Business Discovery graph payload into a structured, audit-ready dataset.
 */
export function normalizeBusinessMediaResponse(
  raw: RawBusinessDiscoveryData,
  requestedLimit: number,
  since?: string,
  until?: string
): NormalizedBusinessMediaResponse {
  const bd = raw.business_discovery ?? {};
  const rawMediaList = bd.media?.data ?? [];
  const rawPaging = bd.media?.paging;

  const normalizedMedia = rawMediaList.map(normalizeMediaItem);
  const filteredMedia = filterMediaByDate(normalizedMedia, since, until);
  const finalMedia = filteredMedia.slice(0, requestedLimit);

  const afterCursor = rawPaging?.cursors?.after;
  const hasMore = Boolean(afterCursor || (rawMediaList.length >= requestedLimit && Boolean(rawPaging?.next)));

  return {
    account: {
      id: String(bd.id ?? ""),
      username: String(bd.username ?? ""),
      name: bd.name,
      followers_count: bd.followers_count,
      follows_count: bd.follows_count,
      media_count: bd.media_count,
      biography: bd.biography,
      website: bd.website,
      profile_picture_url: bd.profile_picture_url,
    },
    media: finalMedia,
    paging: rawPaging
      ? {
          cursors: rawPaging.cursors,
          next: rawPaging.next,
        }
      : undefined,
    metadata: {
      requested_limit: requestedLimit,
      returned_count: finalMedia.length,
      has_more: hasMore,
    },
  };
}
