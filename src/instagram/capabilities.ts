import type { HttpMethod } from "../services/meta-client.js";
import type { InstagramApiMode } from "../services/acellere-meta-client.js";

export type CapabilityStatus =
  | "COVERED"
  | "COVERED_BY_ABSTRACTION"
  | "FACEBOOK_LOGIN_ONLY"
  | "INSTAGRAM_LOGIN_ONLY"
  | "DEPRECATED"
  | "NOT_EXPOSED_BY_META";

export type CapabilityCategory =
  | "auth"
  | "profile"
  | "media"
  | "publishing"
  | "insights"
  | "comments"
  | "hashtags"
  | "mentions"
  | "collaboration"
  | "messaging"
  | "messenger_profile"
  | "welcome_flows"
  | "webhooks"
  | "commerce"
  | "partnership"
  | "discovery"
  | "oembed";

export type ReadWriteClassification =
  | "READ"
  | "WRITE"
  | "WRITE_IDEMPOTENT"
  | "DESTRUCTIVE";

export type CapabilitySurface = "meta_official" | "acellere_extension";

export interface InstagramCapability {
  id: string;
  surface: CapabilitySurface;
  category: CapabilityCategory;
  name: string;
  description: string;
  endpoint: string;
  method: HttpMethod;
  facebookLogin: boolean;
  instagramLogin: boolean;
  permissionsByMode: {
    "facebook-login": string[];
    "instagram-login": string[];
  };
  readWrite: ReadWriteClassification;
  status: CapabilityStatus;
  mcpTool?: string;
  notes?: string;
  verifiedDate: string;
}

export const INSTAGRAM_CAPABILITIES: Record<string, InstagramCapability> = {
  // ─── AUTH & TOKEN LIFECYCLE ──────────────────────────────────
  "auth.tokenDebug": {
    id: "auth.tokenDebug",
    surface: "meta_official",
    category: "auth",
    name: "Debug Access Token",
    description: "Inspect token scopes, expiration, and app associations via /debug_token",
    endpoint: "GET /debug_token",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": [],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "meta_debug_token",
    verifiedDate: "2026-08-26",
  },
  "auth.tokenExchangeInstagram": {
    id: "auth.tokenExchangeInstagram",
    surface: "meta_official",
    category: "auth",
    name: "Exchange Short-Lived Token (Instagram Login)",
    description: "Exchange short-lived User token for long-lived 60-day token via graph.instagram.com/access_token",
    endpoint: "GET /access_token?grant_type=ig_exchange_token",
    method: "GET",
    facebookLogin: false,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": [],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "INSTAGRAM_LOGIN_ONLY",
    mcpTool: "meta_exchange_token",
    notes: "Requires client_secret and short-lived user token",
    verifiedDate: "2026-08-26",
  },
  "auth.tokenExchangeFacebook": {
    id: "auth.tokenExchangeFacebook",
    surface: "meta_official",
    category: "auth",
    name: "Exchange Short-Lived Token (Facebook Login)",
    description: "Exchange short-lived Facebook User token for long-lived User/Page token via graph.facebook.com/oauth/access_token",
    endpoint: "GET /oauth/access_token?grant_type=fb_exchange_token",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["pages_show_list", "instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "meta_exchange_token",
    notes: "Requires client_id, client_secret, and short-lived fb_exchange_token",
    verifiedDate: "2026-08-26",
  },
  "auth.tokenRefreshInstagram": {
    id: "auth.tokenRefreshInstagram",
    surface: "meta_official",
    category: "auth",
    name: "Refresh Long-Lived Token (Instagram Login)",
    description: "Refresh long-lived access token before 60-day expiration via graph.instagram.com/refresh_access_token",
    endpoint: "GET /refresh_access_token?grant_type=ig_refresh_token",
    method: "GET",
    facebookLogin: false,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": [],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "INSTAGRAM_LOGIN_ONLY",
    mcpTool: "meta_refresh_token",
    notes: "Facebook Page tokens with long-lived user tokens do not expire; only Instagram Login tokens require refresh",
    verifiedDate: "2026-08-26",
  },
  "auth.appInfo": {
    id: "auth.appInfo",
    surface: "meta_official",
    category: "auth",
    name: "Get Meta App Info",
    description: "Query Meta application information and settings",
    endpoint: "GET /{app-id}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": [],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "meta_get_app_info",
    verifiedDate: "2026-08-26",
  },
  "auth.capabilities": {
    id: "auth.capabilities",
    surface: "meta_official",
    category: "auth",
    name: "Get Capabilities Matrix",
    description: "Query capabilities supported for the active authentication mode",
    endpoint: "In-process Gateway",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": [],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_capabilities",
    verifiedDate: "2026-08-26",
  },
  "auth.connectionInfo": {
    id: "auth.connectionInfo",
    surface: "meta_official",
    category: "auth",
    name: "Get Connection Metadata",
    description: "Check sanitized connection metadata without exposing secrets",
    endpoint: "In-process Gateway",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": [],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_connection_info",
    verifiedDate: "2026-08-26",
  },
  "auth.bootstrapDiscovery": {
    id: "auth.bootstrapDiscovery",
    surface: "meta_official",
    category: "auth",
    name: "Bootstrap Account Discovery",
    description: "Discover Facebook Pages and connected Instagram Business accounts (/me/accounts or /me)",
    endpoint: "GET /me/accounts or GET /me",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["pages_show_list", "instagram_basic"],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_bootstrap_discovery",
    verifiedDate: "2026-08-26",
  },

  // ─── PROFILE & INSIGHTS ───────────────────────────────────────
  "profile.me": {
    id: "profile.me",
    surface: "meta_official",
    category: "profile",
    name: "Get Account Profile",
    description: "Get authenticated Instagram account profile information",
    endpoint: "GET /{ig-user-id}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_profile",
    verifiedDate: "2026-08-26",
  },
  "profile.insights": {
    id: "profile.insights",
    surface: "meta_official",
    category: "insights",
    name: "Get User Account Insights",
    description: "Get aggregated account insights (views, reach, follower_count)",
    endpoint: "GET /{ig-user-id}/insights",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_insights"],
      "instagram-login": ["instagram_business_manage_insights"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_account_insights",
    verifiedDate: "2026-08-26",
  },

  // ─── PUBLISHING & LIMITS ─────────────────────────────────────
  "publishing.photo": {
    id: "publishing.photo",
    surface: "meta_official",
    category: "publishing",
    name: "Publish Photo Post",
    description: "Publish photo post via two-step container flow",
    endpoint: "POST /{ig-user-id}/media + POST /{ig-user-id}/media_publish",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_content_publish"],
      "instagram-login": ["instagram_business_content_publish"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_publish_photo",
    verifiedDate: "2026-08-26",
  },
  "publishing.video": {
    id: "publishing.video",
    surface: "meta_official",
    category: "publishing",
    name: "Publish Video Post (Deprecated by Meta)",
    description: "Legacy video publishing retired by Meta Nov 9 2023; forwarded to Reel flow",
    endpoint: "POST /{ig-user-id}/media",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_content_publish"],
      "instagram-login": ["instagram_business_content_publish"],
    },
    readWrite: "WRITE",
    status: "DEPRECATED",
    mcpTool: "ig_publish_video",
    notes: "Meta deprecated standalone video containers in v18.0. All feed videos are Reels.",
    verifiedDate: "2026-08-26",
  },
  "publishing.carousel": {
    id: "publishing.carousel",
    surface: "meta_official",
    category: "publishing",
    name: "Publish Carousel Album",
    description: "Publish carousel album (2 to 10 child items)",
    endpoint: "POST /{ig-user-id}/media + POST /{ig-user-id}/media_publish",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_content_publish"],
      "instagram-login": ["instagram_business_content_publish"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_publish_carousel",
    verifiedDate: "2026-08-26",
  },
  "publishing.reels": {
    id: "publishing.reels",
    surface: "meta_official",
    category: "publishing",
    name: "Publish Reel",
    description: "Publish video Reel to feed and Reels tab",
    endpoint: "POST /{ig-user-id}/media + POST /{ig-user-id}/media_publish",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_content_publish"],
      "instagram-login": ["instagram_business_content_publish"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_publish_reel",
    verifiedDate: "2026-08-26",
  },
  "publishing.stories": {
    id: "publishing.stories",
    surface: "meta_official",
    category: "publishing",
    name: "Publish Story",
    description: "Publish 24-hour photo or video Story",
    endpoint: "POST /{ig-user-id}/media + POST /{ig-user-id}/media_publish",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_content_publish"],
      "instagram-login": ["instagram_business_content_publish"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_publish_story",
    verifiedDate: "2026-08-26",
  },
  "publishing.containerStatus": {
    id: "publishing.containerStatus",
    surface: "meta_official",
    category: "publishing",
    name: "Check Container Status",
    description: "Poll media container status (IN_PROGRESS, FINISHED, ERROR)",
    endpoint: "GET /{container-id}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_content_publish"],
      "instagram-login": ["instagram_business_content_publish"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_container_status",
    verifiedDate: "2026-08-26",
  },
  "publishing.limits": {
    id: "publishing.limits",
    surface: "meta_official",
    category: "publishing",
    name: "Get Content Publishing Limit",
    description: "Query 24-hour rolling window publishing quota usage",
    endpoint: "GET /{ig-user-id}/content_publishing_limit",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_content_publish"],
      "instagram-login": ["instagram_business_content_publish"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_content_publishing_limit",
    verifiedDate: "2026-08-26",
  },
  "publishing.resumableUpload": {
    id: "publishing.resumableUpload",
    surface: "meta_official",
    category: "publishing",
    name: "Resumable Video Upload Session",
    description: "Create resumable upload session container for large video files via upload_type=resumable and stream to rupload.facebook.com",
    endpoint: "POST /{ig-user-id}/media?upload_type=resumable + POST https://rupload.facebook.com/ig-api-upload/",
    method: "POST",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_content_publish"],
      "instagram-login": [],
    },
    readWrite: "WRITE",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_create_resumable_upload_session",
    notes: "Resumable upload via rupload.facebook.com is officially supported for Facebook Login for Business apps.",
    verifiedDate: "2026-08-26",
  },

  // ─── MEDIA, STORIES & LIVE ───────────────────────────────────
  "media.list": {
    id: "media.list",
    surface: "meta_official",
    category: "media",
    name: "List Published Media",
    description: "List published media on the Instagram account",
    endpoint: "GET /{ig-user-id}/media",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_media_list",
    verifiedDate: "2026-08-26",
  },
  "media.get": {
    id: "media.get",
    surface: "meta_official",
    category: "media",
    name: "Get Media Post",
    description: "Get details and fields of a specific media post",
    endpoint: "GET /{ig-media-id}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_media",
    verifiedDate: "2026-08-26",
  },
  "media.children": {
    id: "media.children",
    surface: "meta_official",
    category: "media",
    name: "Get Carousel Child Media",
    description: "Get child items belonging to a carousel post",
    endpoint: "GET /{ig-media-id}/children",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_media_children",
    verifiedDate: "2026-08-26",
  },
  "media.stories": {
    id: "media.stories",
    surface: "meta_official",
    category: "media",
    name: "Get Active Stories",
    description: "Get Stories published by the account in the last 24 hours",
    endpoint: "GET /{ig-user-id}/stories",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_basic", "instagram_manage_insights"],
      "instagram-login": ["instagram_business_basic", "instagram_business_manage_insights"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_stories",
    verifiedDate: "2026-08-26",
  },
  "media.live": {
    id: "media.live",
    surface: "meta_official",
    category: "media",
    name: "Get Live Media",
    description: "List active live video broadcasts for the account",
    endpoint: "GET /{ig-user-id}/live_media",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_live_media",
    verifiedDate: "2026-08-26",
  },
  "media.delete": {
    id: "media.delete",
    surface: "meta_official",
    category: "media",
    name: "Delete Media Post",
    description: "Delete an existing media post (posts, carousels, reels, stories)",
    endpoint: "DELETE /{ig-media-id}",
    method: "DELETE",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_contents"],
      "instagram-login": [],
    },
    readWrite: "DESTRUCTIVE",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_delete_media",
    notes: "Requires instagram_manage_contents permission, available only via Facebook Login",
    verifiedDate: "2026-08-26",
  },
  "media.insights": {
    id: "media.insights",
    surface: "meta_official",
    category: "insights",
    name: "Get Media Insights",
    description: "Get analytics for a specific media post",
    endpoint: "GET /{ig-media-id}/insights",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_insights"],
      "instagram-login": ["instagram_business_manage_insights"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_media_insights",
    verifiedDate: "2026-08-26",
  },

  // ─── COMMENTS ─────────────────────────────────────────────────
  "comments.list": {
    id: "comments.list",
    surface: "meta_official",
    category: "comments",
    name: "Get Media Comments",
    description: "List comments on a media post",
    endpoint: "GET /{ig-media-id}/comments",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_comments",
    verifiedDate: "2026-08-26",
  },
  "comments.get": {
    id: "comments.get",
    surface: "meta_official",
    category: "comments",
    name: "Get Comment Details",
    description: "Get details of a specific comment",
    endpoint: "GET /{ig-comment-id}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_comment",
    verifiedDate: "2026-08-26",
  },
  "comments.create": {
    id: "comments.create",
    surface: "meta_official",
    category: "comments",
    name: "Create Comment",
    description: "Post a top-level comment on a media post",
    endpoint: "POST /{ig-media-id}/comments",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_post_comment",
    verifiedDate: "2026-08-26",
  },
  "comments.replies": {
    id: "comments.replies",
    surface: "meta_official",
    category: "comments",
    name: "Get Comment Replies",
    description: "List replies to a specific comment",
    endpoint: "GET /{ig-comment-id}/replies",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_replies",
    verifiedDate: "2026-08-26",
  },
  "comments.reply": {
    id: "comments.reply",
    surface: "meta_official",
    category: "comments",
    name: "Reply to Comment",
    description: "Post a reply to an existing comment",
    endpoint: "POST /{ig-comment-id}/replies",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_reply_to_comment",
    verifiedDate: "2026-08-26",
  },
  "comments.hide": {
    id: "comments.hide",
    surface: "meta_official",
    category: "comments",
    name: "Hide/Unhide Comment",
    description: "Hide or unhide a comment on your post",
    endpoint: "POST /{ig-comment-id}?hide={true|false}",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "COVERED",
    mcpTool: "ig_hide_comment",
    verifiedDate: "2026-08-26",
  },
  "comments.delete": {
    id: "comments.delete",
    surface: "meta_official",
    category: "comments",
    name: "Delete Comment",
    description: "Delete a comment on your post",
    endpoint: "DELETE /{ig-comment-id}",
    method: "DELETE",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "DESTRUCTIVE",
    status: "COVERED",
    mcpTool: "ig_delete_comment",
    verifiedDate: "2026-08-26",
  },
  "comments.toggle": {
    id: "comments.toggle",
    surface: "meta_official",
    category: "comments",
    name: "Toggle Comments",
    description: "Enable or disable comments on an Instagram media post",
    endpoint: "POST /{ig-media-id}?comment_enabled={true|false}",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "COVERED",
    mcpTool: "ig_toggle_comments",
    verifiedDate: "2026-08-26",
  },
  "comments.privateReply": {
    id: "comments.privateReply",
    surface: "meta_official",
    category: "comments",
    name: "Send Private Reply to Comment",
    description: "Send a direct message reply to a user's comment (7-day window)",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages", "instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_messages", "instagram_business_manage_comments"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_private_reply",
    verifiedDate: "2026-08-26",
  },

  // ─── HASHTAGS ─────────────────────────────────────────────────
  "hashtags.search": {
    id: "hashtags.search",
    surface: "meta_official",
    category: "hashtags",
    name: "Search Hashtag",
    description: "Search for a hashtag ID by name (30 unique per 7 days)",
    endpoint: "GET /ig_hashtag_search?q={name}&user_id={ig-user-id}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_search_hashtag",
    verifiedDate: "2026-08-26",
  },
  "hashtags.info": {
    id: "hashtags.info",
    surface: "meta_official",
    category: "hashtags",
    name: "Get Hashtag Information",
    description: "Get hashtag object fields (id, name)",
    endpoint: "GET /{ig-hashtag-id}?fields=id,name",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_get_hashtag",
    verifiedDate: "2026-08-26",
  },
  "hashtags.recent": {
    id: "hashtags.recent",
    surface: "meta_official",
    category: "hashtags",
    name: "Get Recent Hashtag Media",
    description: "Get recent media tagged with a hashtag",
    endpoint: "GET /{ig-hashtag-id}/recent_media?user_id={ig-user-id}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_get_hashtag_recent",
    verifiedDate: "2026-08-26",
  },
  "hashtags.top": {
    id: "hashtags.top",
    surface: "meta_official",
    category: "hashtags",
    name: "Get Top Hashtag Media",
    description: "Get top/trending media tagged with a hashtag",
    endpoint: "GET /{ig-hashtag-id}/top_media?user_id={ig-user-id}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_get_hashtag_top",
    verifiedDate: "2026-08-26",
  },
  "hashtags.recentlySearched": {
    id: "hashtags.recentlySearched",
    surface: "meta_official",
    category: "hashtags",
    name: "Get Recently Searched Hashtags",
    description: "List hashtags searched by the account in the rolling 7-day window",
    endpoint: "GET /{ig-user-id}/recently_searched_hashtags",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_get_recently_searched_hashtags",
    verifiedDate: "2026-08-26",
  },

  // ─── MENTIONS & TAGS ──────────────────────────────────────────
  "mentions.comment": {
    id: "mentions.comment",
    surface: "meta_official",
    category: "mentions",
    name: "Get Mentioned Comment",
    description: "Get details of a comment where the account was mentioned",
    endpoint: "GET /{ig-user-id}/mentioned_comment",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_mentioned_comment",
    verifiedDate: "2026-08-26",
  },
  "mentions.media": {
    id: "mentions.media",
    surface: "meta_official",
    category: "mentions",
    name: "Get Mentioned Media",
    description: "Get details of a caption mention post",
    endpoint: "GET /{ig-user-id}/mentioned_media",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_mentioned_media",
    verifiedDate: "2026-08-26",
  },
  "mentions.tags": {
    id: "mentions.tags",
    surface: "meta_official",
    category: "mentions",
    name: "Get Tagged Media",
    description: "Get media posts where the account is tagged",
    endpoint: "GET /{ig-user-id}/tags",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_tagged_media",
    verifiedDate: "2026-08-26",
  },
  "mentions.reply": {
    id: "mentions.reply",
    surface: "meta_official",
    category: "mentions",
    name: "Reply to Mention",
    description: "Publish a reply comment to a mention",
    endpoint: "POST /{ig-user-id}/mentions",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_comments"],
      "instagram-login": ["instagram_business_manage_comments"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_reply_to_mention",
    verifiedDate: "2026-08-26",
  },

  // ─── COLLABORATION ────────────────────────────────────────────
  "collaboration.invites": {
    id: "collaboration.invites",
    surface: "meta_official",
    category: "collaboration",
    name: "Get Collaboration Invites",
    description: "List pending collaboration invites for the account",
    endpoint: "GET /{ig-user-id}/collaboration_invites",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_collaboration_invites",
    verifiedDate: "2026-08-26",
  },
  "collaboration.respond": {
    id: "collaboration.respond",
    surface: "meta_official",
    category: "collaboration",
    name: "Respond to Collaboration Invite",
    description: "Accept or decline a collaboration invite by media_id",
    endpoint: "POST /{ig-user-id}/collaboration_invites",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_content_publish"],
      "instagram-login": ["instagram_business_content_publish"],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "COVERED",
    mcpTool: "ig_respond_collaboration_invite",
    verifiedDate: "2026-08-26",
  },
  "collaboration.posts": {
    id: "collaboration.posts",
    surface: "meta_official",
    category: "collaboration",
    name: "Get Collaborative Posts",
    description: "List published posts where this account is an accepted co-author",
    endpoint: "GET /{ig-user-id}/collaborative_posts",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": ["instagram_business_basic"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_collaborative_posts",
    verifiedDate: "2026-08-26",
  },

  // ─── MESSAGING & SEND API ─────────────────────────────────────
  "messaging.conversations": {
    id: "messaging.conversations",
    surface: "meta_official",
    category: "messaging",
    name: "Get Conversations List",
    description: "List direct message conversations",
    endpoint: "GET /{target}/conversations",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages", "pages_manage_metadata"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_conversations",
    verifiedDate: "2026-08-26",
  },
  "messaging.messages": {
    id: "messaging.messages",
    surface: "meta_official",
    category: "messaging",
    name: "Get Messages in Conversation",
    description: "List messages in a specific conversation",
    endpoint: "GET /{conversation-id}/messages",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_messages",
    verifiedDate: "2026-08-26",
  },
  "messaging.message": {
    id: "messaging.message",
    surface: "meta_official",
    category: "messaging",
    name: "Get Message Details",
    description: "Get details of a specific message",
    endpoint: "GET /{message-id}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_message",
    verifiedDate: "2026-08-26",
  },
  "messaging.sendText": {
    id: "messaging.sendText",
    surface: "meta_official",
    category: "messaging",
    name: "Send Text Message",
    description: "Send a direct text message (supports RESPONSE, UPDATE, and MESSAGE_TAG with HUMAN_AGENT)",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_message",
    verifiedDate: "2026-08-26",
  },
  "messaging.sendMedia": {
    id: "messaging.sendMedia",
    surface: "meta_official",
    category: "messaging",
    name: "Send Media Attachment Message",
    description: "Send image, video, audio, or file attachment direct message via URL or reusable attachment_id",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_media_message",
    verifiedDate: "2026-08-26",
  },
  "messaging.sendSticker": {
    id: "messaging.sendSticker",
    surface: "meta_official",
    category: "messaging",
    name: "Send Sticker / Like Heart",
    description: "Send like_heart sticker attachment via Instagram Send API",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_sticker",
    verifiedDate: "2026-08-26",
  },
  "messaging.sendPublishedPost": {
    id: "messaging.sendPublishedPost",
    surface: "meta_official",
    category: "messaging",
    name: "Send Published Post (MEDIA_SHARE)",
    description: "Send an existing Instagram post via MEDIA_SHARE attachment",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_published_post",
    verifiedDate: "2026-08-26",
  },
  "messaging.quickReplies": {
    id: "messaging.quickReplies",
    surface: "meta_official",
    category: "messaging",
    name: "Send Quick Replies",
    description: "Send prompt text with quick reply options (text, user_phone_number, user_email)",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_quick_replies",
    verifiedDate: "2026-08-26",
  },
  "messaging.genericTemplate": {
    id: "messaging.genericTemplate",
    surface: "meta_official",
    category: "messaging",
    name: "Send Generic Template Carousel",
    description: "Send rich card or carousel templates with image, title, subtitle, and CTA buttons",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_generic_template",
    verifiedDate: "2026-08-26",
  },
  "messaging.buttonTemplate": {
    id: "messaging.buttonTemplate",
    surface: "meta_official",
    category: "messaging",
    name: "Send Button Template",
    description: "Send text prompt with up to 3 CTA buttons",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_button_template",
    verifiedDate: "2026-08-26",
  },
  "messaging.reactions": {
    id: "messaging.reactions",
    surface: "meta_official",
    category: "messaging",
    name: "Send/Delete Reaction",
    description: "React to or unreact from a direct message via sender_action: 'react'/'unreact' with payload.reaction",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_reaction",
    verifiedDate: "2026-08-26",
  },
  "messaging.senderAction": {
    id: "messaging.senderAction",
    surface: "meta_official",
    category: "messaging",
    name: "Send Sender Action",
    description: "Emit typing indicator (typing_on/typing_off) or mark seen (mark_seen)",
    endpoint: "POST /{ig-user-id}/messages",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_send_sender_action",
    verifiedDate: "2026-08-26",
  },
  "messaging.userProfile": {
    id: "messaging.userProfile",
    surface: "meta_official",
    category: "messaging",
    name: "Get User Profile by IGSID",
    description: "Get public profile info for an Instagram-Scoped ID",
    endpoint: "GET /{igsid}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_user_profile_by_igsid",
    verifiedDate: "2026-08-26",
  },
  "messaging.attachments": {
    id: "messaging.attachments",
    surface: "meta_official",
    category: "messaging",
    name: "Upload Message Attachment",
    description: "Upload media to obtain reusable attachment_id",
    endpoint: "POST /{ig-user-id}/message_attachments",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE",
    status: "COVERED",
    mcpTool: "ig_upload_attachment",
    verifiedDate: "2026-08-26",
  },

  // ─── MESSENGER PROFILE & WELCOME FLOWS ────────────────────────
  "messengerProfile.get": {
    id: "messengerProfile.get",
    surface: "meta_official",
    category: "messenger_profile",
    name: "Get Messenger Profile Settings",
    description: "Query Messenger Profile settings (Ice Breakers, Persistent Menu, Greeting, Commands)",
    endpoint: "GET /{ig-user-id}/messenger_profile",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_messenger_profile",
    verifiedDate: "2026-08-26",
  },
  "messengerProfile.iceBreakers": {
    id: "messengerProfile.iceBreakers",
    surface: "meta_official",
    category: "messenger_profile",
    name: "Set/Delete Ice Breakers",
    description: "Configure FAQ Ice Breaker prompt questions for new conversations",
    endpoint: "POST/DELETE /{ig-user-id}/messenger_profile",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "COVERED",
    mcpTool: "ig_set_ice_breakers",
    verifiedDate: "2026-08-26",
  },
  "messengerProfile.persistentMenu": {
    id: "messengerProfile.persistentMenu",
    surface: "meta_official",
    category: "messenger_profile",
    name: "Set/Delete Persistent Menu",
    description: "Configure persistent composer call-to-actions",
    endpoint: "POST/DELETE /{ig-user-id}/messenger_profile",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "COVERED",
    mcpTool: "ig_set_persistent_menu",
    verifiedDate: "2026-08-26",
  },
  "messengerProfile.welcomeFlows": {
    id: "messengerProfile.welcomeFlows",
    surface: "meta_official",
    category: "welcome_flows",
    name: "Manage Welcome Message Flows",
    description: "List, create, retrieve, and delete automated welcome message flows",
    endpoint: "GET/POST/DELETE /{ig-user-id}/welcome_message_flows",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "COVERED",
    mcpTool: "ig_set_welcome_message_flow",
    verifiedDate: "2026-08-26",
  },

  // ─── WEBHOOKS & APP SUBSCRIPTIONS ─────────────────────────────
  "webhooks.subscriptions": {
    id: "webhooks.subscriptions",
    surface: "meta_official",
    category: "webhooks",
    name: "Manage App Subscriptions",
    description: "Query, subscribe, or unsubscribe Webhook topics on Page/Account",
    endpoint: "GET/POST/DELETE /{target}/subscribed_apps",
    method: "POST",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": ["pages_manage_metadata", "instagram_manage_messages"],
      "instagram-login": ["instagram_business_manage_messages"],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "COVERED",
    mcpTool: "ig_subscribe_app",
    verifiedDate: "2026-08-26",
  },

  // ─── COMMERCE & PRODUCT TAGGING ──────────────────────────────
  "commerce.catalogs": {
    id: "commerce.catalogs",
    surface: "meta_official",
    category: "commerce",
    name: "Get Available Catalogs & Products",
    description: "Get linked product catalogs and query catalog items for shopping tags",
    endpoint: "GET /{ig-user-id}/available_catalogs",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_shopping_tag_products", "catalog_management"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_get_available_catalogs",
    verifiedDate: "2026-08-26",
  },
  "commerce.productTags": {
    id: "commerce.productTags",
    surface: "meta_official",
    category: "commerce",
    name: "Manage Product Tags",
    description: "Query, create, and delete product tags on Instagram media posts",
    endpoint: "GET/POST/DELETE /{ig-media-id}/product_tags",
    method: "POST",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_shopping_tag_products"],
      "instagram-login": [],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_create_product_tags",
    verifiedDate: "2026-08-26",
  },
  "commerce.productAppeal": {
    id: "commerce.productAppeal",
    surface: "meta_official",
    category: "commerce",
    name: "Check/Submit Product Appeal",
    description: "Check status or submit review appeal for rejected Instagram Shop products",
    endpoint: "GET/POST /{ig-user-id}/product_appeal",
    method: "POST",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_shopping_tag_products"],
      "instagram-login": [],
    },
    readWrite: "WRITE",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_submit_product_appeal",
    verifiedDate: "2026-08-26",
  },

  // ─── BRANDED CONTENT & PARTNERSHIP ADS ────────────────────────
  "partnership.adPermissions": {
    id: "partnership.adPermissions",
    surface: "meta_official",
    category: "partnership",
    name: "Get Branded Content Ad Permissions",
    description: "Check creator ad boost permissions and eligibility on branded media",
    endpoint: "GET /{ig-media-id}/branded_content_ad_permissions",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_branded_content_ads_brand", "ads_management"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_get_branded_content_ad_permissions",
    verifiedDate: "2026-08-26",
  },
  "partnership.advertisableMedia": {
    id: "partnership.advertisableMedia",
    surface: "meta_official",
    category: "partnership",
    name: "Get Advertisable Media",
    description: "List media approved for Partnership Ads",
    endpoint: "GET /{ig-user-id}/branded_content_advertisable_medias",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_branded_content_ads_brand", "ads_management"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_get_advertisable_media",
    verifiedDate: "2026-08-26",
  },
  "partnership.authorizedPartners": {
    id: "partnership.authorizedPartners",
    surface: "meta_official",
    category: "partnership",
    name: "Manage Authorized Ad Accounts",
    description: "Get, authorize, or revoke brand partner ad accounts for Partnership Ads",
    endpoint: "GET/POST/DELETE /{ig-user-id}/branded_content_ad_partners",
    method: "POST",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_branded_content_ads_brand", "ads_management"],
      "instagram-login": [],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_set_authorized_ad_account",
    verifiedDate: "2026-08-26",
  },
  "partnership.tagApproval": {
    id: "partnership.tagApproval",
    surface: "meta_official",
    category: "partnership",
    name: "Manage Tag Approval Requests",
    description: "List and decide creator Branded Content tag approval requests",
    endpoint: "GET/POST /{ig-user-id}/branded_content_tag_approval",
    method: "POST",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_branded_content_brand"],
      "instagram-login": [],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_update_tag_approval",
    verifiedDate: "2026-08-26",
  },

  // ─── BUSINESS DISCOVERY ───────────────────────────────────────
  "discovery.profile": {
    id: "discovery.profile",
    surface: "meta_official",
    category: "discovery",
    name: "Business Discovery Profile & Media",
    description: "Look up another business/creator public profile and media posts",
    endpoint: "GET /{ig-user-id}?fields=business_discovery.username({username}){...}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "FACEBOOK_LOGIN_ONLY",
    mcpTool: "ig_business_discovery",
    verifiedDate: "2026-08-26",
  },

  // ─── OEMBED ───────────────────────────────────────────────────
  "oembed.post": {
    id: "oembed.post",
    surface: "meta_official",
    category: "oembed",
    name: "Get oEmbed Code",
    description: "Get official embed HTML code and metadata for public Instagram post or reel",
    endpoint: "GET /instagram_oembed?url={post_url}",
    method: "GET",
    facebookLogin: true,
    instagramLogin: true,
    permissionsByMode: {
      "facebook-login": [],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "COVERED",
    mcpTool: "ig_get_oembed",
    notes: "Requires oEmbed Read product enabled on Meta App",
    verifiedDate: "2026-08-26",
  },

  // ═══════════════════════════════════════════════════════════════
  // ─── ACELLERE EXTENSIONS (Non-Official Derived Capabilities) ───
  // ═══════════════════════════════════════════════════════════════
  "extension.analytics": {
    id: "extension.analytics",
    surface: "acellere_extension",
    category: "discovery",
    name: "Competitor Analytics Engine",
    description: "Deterministic statistical analysis of competitor metrics, format distributions, and timing",
    endpoint: "Local Acellere Engine (based on Business Discovery)",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "COVERED_BY_ABSTRACTION",
    mcpTool: "ig_analyze_business",
    verifiedDate: "2026-08-26",
  },
  "extension.comparison": {
    id: "extension.comparison",
    surface: "acellere_extension",
    category: "discovery",
    name: "Multi-Account Competitor Benchmark",
    description: "Side-by-side benchmarking and market leader identification across 1-10 competitors",
    endpoint: "Local Acellere Engine (based on Business Discovery)",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "COVERED_BY_ABSTRACTION",
    mcpTool: "ig_compare_businesses",
    verifiedDate: "2026-08-26",
  },
  "extension.tracking": {
    id: "extension.tracking",
    surface: "acellere_extension",
    category: "discovery",
    name: "Competitor Tracking & Snapshots",
    description: "Persist competitor baselines, track accounts, and collect periodic snapshot metrics",
    endpoint: "Local SQLite/D1 Storage + Business Discovery",
    method: "POST",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "COVERED_BY_ABSTRACTION",
    mcpTool: "ig_track_business",
    verifiedDate: "2026-08-26",
  },
  "extension.history": {
    id: "extension.history",
    surface: "acellere_extension",
    category: "discovery",
    name: "Competitor Historical Metrics",
    description: "Query historical follower growth, posting velocity, and engagement trends",
    endpoint: "Local SQLite/D1 Storage",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": [],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "COVERED_BY_ABSTRACTION",
    mcpTool: "ig_get_business_history",
    verifiedDate: "2026-08-26",
  },
  "extension.collection": {
    id: "extension.collection",
    surface: "acellere_extension",
    category: "discovery",
    name: "Competitor Collection Routine",
    description: "Execute automated batch snapshot collection for all monitored accounts",
    endpoint: "Local Acellere Engine + Storage",
    method: "POST",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "WRITE_IDEMPOTENT",
    status: "COVERED_BY_ABSTRACTION",
    mcpTool: "ig_run_competitor_collection",
    verifiedDate: "2026-08-26",
  },
  "extension.research": {
    id: "extension.research",
    surface: "acellere_extension",
    category: "discovery",
    name: "Competitor Market Research Orchestrator",
    description: "End-to-end multi-step market intelligence aggregator formatted for LLMs",
    endpoint: "Local Acellere Engine + Storage + Business Discovery",
    method: "GET",
    facebookLogin: true,
    instagramLogin: false,
    permissionsByMode: {
      "facebook-login": ["instagram_basic"],
      "instagram-login": [],
    },
    readWrite: "READ",
    status: "COVERED_BY_ABSTRACTION",
    mcpTool: "ig_competitor_research",
    verifiedDate: "2026-08-26",
  },
};

export class InstagramCapabilityError extends Error {
  public readonly capabilityId: string;
  public readonly currentLoginMode: InstagramApiMode;
  public readonly requiredLoginMode: InstagramApiMode;
  public readonly requiredPermissions: string[];
  public readonly remediation: string;

  constructor(capability: InstagramCapability, currentMode: InstagramApiMode) {
    const requiredMode: InstagramApiMode =
      capability.facebookLogin && !capability.instagramLogin
        ? "facebook-login"
        : "instagram-login";

    const requiredPermissions = capability.permissionsByMode[requiredMode] ?? [];

    const remediation =
      currentMode !== requiredMode
        ? `Switch authentication mode to INSTAGRAM_API_MODE=${requiredMode} and configure required credentials.`
        : `Ensure your access token includes the required scopes: ${requiredPermissions.join(", ")}.`;

    super(
      `Capability "${capability.id}" (${capability.name}) is not supported in "${currentMode}" mode. ${remediation}`
    );

    this.name = "InstagramCapabilityError";
    this.capabilityId = capability.id;
    this.currentLoginMode = currentMode;
    this.requiredLoginMode = requiredMode;
    this.requiredPermissions = requiredPermissions;
    this.remediation = remediation;
  }
}

export function isCapabilitySupported(
  mode: InstagramApiMode,
  capabilityId: string
): boolean {
  const cap = INSTAGRAM_CAPABILITIES[capabilityId];
  if (!cap) return false;
  if (mode === "facebook-login") return cap.facebookLogin;
  if (mode === "instagram-login") return cap.instagramLogin;
  return false;
}

export function requireInstagramCapability(
  mode: InstagramApiMode,
  capabilityId: string
): InstagramCapability {
  const cap = INSTAGRAM_CAPABILITIES[capabilityId];
  if (!cap) {
    throw new Error(`Unknown Instagram capability: "${capabilityId}".`);
  }

  const supported =
    mode === "facebook-login" ? cap.facebookLogin : cap.instagramLogin;

  if (!supported) {
    throw new InstagramCapabilityError(cap, mode);
  }

  return cap;
}

export function getCapabilitiesSummary(mode: InstagramApiMode): {
  login_mode: InstagramApiMode;
  official_surface: {
    total: number;
    available_count: number;
    unavailable_count: number;
    coverage_percentage: number;
    available: Array<Omit<InstagramCapability, "permissionsByMode"> & { permissions: string[] }>;
    unavailable: Array<Omit<InstagramCapability, "permissionsByMode"> & { permissions: string[] }>;
  };
  acellere_extensions: {
    total: number;
    available_count: number;
    items: Array<Omit<InstagramCapability, "permissionsByMode"> & { permissions: string[] }>;
  };
} {
  const all = Object.values(INSTAGRAM_CAPABILITIES);

  const official = all.filter((c) => c.surface === "meta_official");
  const extensions = all.filter((c) => c.surface === "acellere_extension");

  const formatWithEffectivePermissions = (cap: InstagramCapability) => ({
    id: cap.id,
    surface: cap.surface,
    category: cap.category,
    name: cap.name,
    description: cap.description,
    endpoint: cap.endpoint,
    method: cap.method,
    facebookLogin: cap.facebookLogin,
    instagramLogin: cap.instagramLogin,
    permissions: cap.permissionsByMode[mode] ?? [],
    readWrite: cap.readWrite,
    status: cap.status,
    mcpTool: cap.mcpTool,
    notes: cap.notes,
    verifiedDate: cap.verifiedDate,
  });

  const officialAvailable = official
    .filter((c) => (mode === "facebook-login" ? c.facebookLogin : c.instagramLogin))
    .map(formatWithEffectivePermissions);

  const officialUnavailable = official
    .filter((c) => !(mode === "facebook-login" ? c.facebookLogin : c.instagramLogin))
    .map(formatWithEffectivePermissions);

  const extAvailable = extensions
    .filter((c) => (mode === "facebook-login" ? c.facebookLogin : c.instagramLogin))
    .map(formatWithEffectivePermissions);

  return {
    login_mode: mode,
    official_surface: {
      total: OFFICIAL_CAPABILITIES_COUNT,
      available_count: officialAvailable.length,
      unavailable_count: officialUnavailable.length,
      coverage_percentage: Math.round((officialAvailable.length / OFFICIAL_CAPABILITIES_COUNT) * 100),
      available: officialAvailable,
      unavailable: officialUnavailable,
    },
    acellere_extensions: {
      total: ACELLERE_EXTENSIONS_COUNT,
      available_count: extAvailable.length,
      items: extAvailable,
    },
  };
}

export const OFFICIAL_CAPABILITIES = Object.values(INSTAGRAM_CAPABILITIES).filter(
  (c) => c.surface === "meta_official"
);
export const OFFICIAL_CAPABILITIES_COUNT = OFFICIAL_CAPABILITIES.length;

export const ACELLERE_EXTENSIONS = Object.values(INSTAGRAM_CAPABILITIES).filter(
  (c) => c.surface === "acellere_extension"
);
export const ACELLERE_EXTENSIONS_COUNT = ACELLERE_EXTENSIONS.length;

