export const IG_PROFILE_FIELDS =
  "id,name,username,biography,followers_count,follows_count,media_count,profile_picture_url,website";

export const IG_BUSINESS_DISCOVERY_DEFAULT_FIELDS =
  "id,ig_id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count";

export const IG_BUSINESS_DISCOVERY_ALLOWED_PROFILE_FIELDS = new Set([
  "id",
  "ig_id",
  "username",
  "name",
  "biography",
  "website",
  "profile_picture_url",
  "followers_count",
  "follows_count",
  "media_count",
]);

export const IG_BUSINESS_DISCOVERY_ALLOWED_TOP_LEVEL = new Set([
  ...IG_BUSINESS_DISCOVERY_ALLOWED_PROFILE_FIELDS,
  "media",
  "stories",
]);

export const IG_BUSINESS_DISCOVERY_UNSUPPORTED_FIELDS = new Set([
  "account_type",
  "insights",
  "saved_count",
  "shares_count",
  "comments",
  "total_like_count",
  "total_comments_count",
  "total_views_count",
  "reach",
  "impressions",
]);

export const IG_MEDIA_FIELDS =
  "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp,like_count,comments_count";

export const IG_MEDIA_CHILDREN_FIELDS =
  "id,media_type,media_url,permalink,timestamp";

export const IG_STORY_FIELDS =
  "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count";

export const IG_LIVE_MEDIA_FIELDS =
  "id,media_type,permalink,timestamp";

// thumbnail_url is intentionally omitted — the Instagram Hashtag Search API
// does not return it on hashtag media results, only on user-owned media.
export const IG_HASHTAG_MEDIA_FIELDS =
  "id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count";

export const THREADS_PROFILE_FIELDS =
  "id,username,name,threads_profile_picture_url,threads_biography,is_verified,is_eligible_for_geo_gating";

export const THREADS_MEDIA_FIELDS = [
  "id",
  "media_product_type",
  "media_type",
  "media_url",
  "permalink",
  "text",
  "timestamp",
  "shortcode",
  "is_quote_post",
  "has_replies",
  "reply_audience",
  "topic_tag",
  "link_attachment_url",
  "poll_attachment{option_a,option_b,option_c,option_d,option_a_votes_percentage,option_b_votes_percentage,option_c_votes_percentage,option_d_votes_percentage,total_votes,expiration_timestamp}",
  "gif_url",
  "alt_text",
].join(",");
