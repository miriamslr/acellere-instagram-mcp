import { describe, it, expect, vi } from "vitest";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import { MetaClient } from "../services/meta-client.js";
import type { MetaConfig } from "../config.js";
import { makeMockServer } from "./test-utils.js";
import { registerAll } from "../register-all.js";

function buildServerWithAllTools() {
  const server = makeMockServer();
  (server as unknown as Record<string, unknown>).registerResource = vi.fn();
  (server as unknown as Record<string, unknown>).registerPrompt = vi.fn();
  const cfg: MetaConfig = {
    appId: "",
    appSecret: "",
    facebookPageId: "",
    instagramAccessToken: "",
    instagramUserId: "",
    threadsAccessToken: "",
    threadsUserId: "",
  };
  const client = new MetaClient(cfg);
  registerAll(server as never, client);
  return server;
}

function getAnnotations(server: ReturnType<typeof buildServerWithAllTools>, name: string): ToolAnnotations {
  const ann = server.annotations.get(name);
  if (!ann) throw new Error(`Tool ${name} was registered without annotations`);
  return ann;
}

describe("MCP tool annotations", () => {
  const server = buildServerWithAllTools();

  it("every registered tool has annotations", () => {
    for (const name of server.tools.keys()) {
      expect(server.annotations.get(name), `tool ${name}`).toBeDefined();
    }
  });

  it("every tool sets openWorldHint: true (Meta Graph API is external)", () => {
    for (const name of server.tools.keys()) {
      expect(getAnnotations(server, name).openWorldHint, `tool ${name}`).toBe(true);
    }
  });

  describe("read-only tools", () => {
    const readOnlyTools = [
      "meta_debug_token",
      "meta_get_app_info",
      "meta_get_webhook_subscriptions",
      "ig_get_capabilities",
      "ig_get_connection_info",
      "ig_bootstrap_discovery",
      "ig_get_container_status",
      "ig_get_content_publishing_limit",
      "ig_get_media_list",
      "ig_get_media",
      "ig_get_media_insights",
      "ig_get_media_children",
      "ig_get_stories",
      "ig_get_live_media",
      "ig_get_comments",
      "ig_get_comment",
      "ig_get_replies",
      "ig_get_profile",
      "ig_get_account_insights",
      "ig_business_discovery",
      "ig_get_collaboration_invites",
      "ig_get_collaborative_posts",
      "ig_get_business_media",
      "ig_analyze_business",
      "ig_compare_businesses",
      "ig_get_business_history",
      "ig_competitor_research",
      "ig_search_hashtag",
      "ig_get_hashtag",
      "ig_get_hashtag_recent",
      "ig_get_hashtag_top",
      "ig_get_recently_searched_hashtags",
      "ig_get_mentioned_comment",
      "ig_get_tagged_media",
      "ig_get_mentioned_media",
      "ig_get_conversations",
      "ig_get_messages",
      "ig_get_message",
      "ig_get_user_profile_by_igsid",
      "ig_get_messenger_profile",
      "ig_list_welcome_message_flows",
      "ig_get_welcome_message_flow",
      "ig_get_subscribed_apps",
      "ig_get_available_catalogs",
      "ig_get_catalog_products",
      "ig_get_product_tags",
      "ig_get_product_appeal",
      "ig_get_branded_content_ad_permissions",
      "ig_get_advertisable_media",
      "ig_get_authorized_ad_accounts",
      "ig_get_tag_approval_requests",
      "ig_get_oembed",
      "threads_get_posts",
      "threads_get_post",
      "threads_search_posts",
      "threads_get_replies",
      "threads_get_post_insights",
      "threads_get_user_insights",
      "threads_get_container_status",
      "threads_get_publishing_limit",
      "threads_get_profile",
      "threads_get_mentions",
      "threads_search_locations",
    ];

    it.each(readOnlyTools)("%s has readOnlyHint: true", (name) => {
      expect(getAnnotations(server, name).readOnlyHint).toBe(true);
    });
  });

  describe("destructive tools", () => {
    const destructiveTools = [
      "ig_delete_media",
      "ig_delete_comment",
      "ig_delete_ice_breakers",
      "ig_delete_persistent_menu",
      "ig_delete_welcome_message_flow",
      "ig_unsubscribe_app",
      "ig_delete_product_tags",
      "ig_delete_authorized_ad_account",
      "threads_delete_post",
    ];

    it.each(destructiveTools)("%s is destructive, non-read-only, and idempotent", (name) => {
      const ann = getAnnotations(server, name);
      expect(ann.readOnlyHint).toBe(false);
      expect(ann.destructiveHint).toBe(true);
      expect(ann.idempotentHint).toBe(true);
    });
  });

  describe("write tools (creates content, non-idempotent)", () => {
    const writeTools = [
      "meta_exchange_token",
      "meta_refresh_token",
      "ig_publish_photo",
      "ig_publish_video",
      "ig_publish_carousel",
      "ig_publish_reel",
      "ig_publish_story",
      "ig_create_resumable_upload_session",
      "ig_post_comment",
      "ig_reply_to_comment",
      "ig_send_private_reply",
      "ig_reply_to_mention",
      "ig_send_message",
      "ig_send_media_message",
      "ig_send_sticker",
      "ig_send_published_post",
      "ig_send_quick_replies",
      "ig_send_generic_template",
      "ig_send_button_template",
      "ig_send_reaction",
      "ig_delete_reaction",
      "ig_send_sender_action",
      "ig_upload_attachment",
      "ig_submit_product_appeal",
      "threads_publish_text",
      "threads_publish_image",
      "threads_publish_video",
      "threads_publish_carousel",
      "threads_reply",
      "threads_repost",
    ];

    it.each(writeTools)("%s is non-read-only, non-destructive, non-idempotent", (name) => {
      const ann = getAnnotations(server, name);
      expect(ann.readOnlyHint).toBe(false);
      expect(ann.destructiveHint).toBe(false);
      expect(ann.idempotentHint).toBe(false);
    });
  });

  describe("write-idempotent tools (state change, same args ⇒ same env)", () => {
    const writeIdempotentTools = [
      "meta_subscribe_webhook",
      "ig_toggle_comments",
      "ig_hide_comment",
      "ig_respond_collaboration_invite",
      "ig_track_business",
      "ig_untrack_business",
      "ig_run_competitor_collection",
      "ig_set_ice_breakers",
      "ig_set_persistent_menu",
      "ig_set_welcome_message_flow",
      "ig_subscribe_app",
      "ig_create_product_tags",
      "ig_set_authorized_ad_account",
      "ig_update_tag_approval",
      "threads_hide_reply",
      "threads_unhide_reply",
    ];

    it.each(writeIdempotentTools)("%s is non-read-only, non-destructive, idempotent", (name) => {
      const ann = getAnnotations(server, name);
      expect(ann.readOnlyHint).toBe(false);
      expect(ann.destructiveHint).toBe(false);
      expect(ann.idempotentHint).toBe(true);
    });
  });

  it("covers all 118 registered tools across the four categories", () => {
    expect(server.tools.size).toBe(118);
  });
});
