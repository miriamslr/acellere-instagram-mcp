import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { READ_ONLY_TOOL, WRITE_IDEMPOTENT_TOOL, DESTRUCTIVE_TOOL } from "../annotations.js";

const DEFAULT_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "messaging_seen",
  "message_reactions",
  "comments",
  "mentions",
  "story_insights",
];

export function registerIgWebhookTools(server: McpServer, client: MetaClient): void {
  // ─── ig_get_subscribed_apps ──────────────────────────────────
  server.registerTool(
    "ig_get_subscribed_apps",
    {
      description:
        "Get list of webhook subscriptions and subscribed fields for the Instagram/Facebook Page. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        const targetId = client.igConversationsTargetId;
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${targetId}/subscribed_apps`
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get subscribed apps");
      }
    }
  );

  // ─── ig_subscribe_app ────────────────────────────────────────
  server.registerTool(
    "ig_subscribe_app",
    {
      description:
        "Subscribe application to Webhook events (messages, postbacks, seen, reactions, comments, mentions, story_insights). Idempotent.",
      inputSchema: {
        subscribed_fields: z
          .array(z.string())
          .optional()
          .default(DEFAULT_SUBSCRIBED_FIELDS)
          .describe("Array of webhook topic fields to subscribe to"),
      },
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async ({ subscribed_fields }) => {
      try {
        const targetId = client.igConversationsTargetId;
        const { data, rateLimit } = await client.ig(
          "POST",
          `/${targetId}/subscribed_apps`,
          {
            subscribed_fields: subscribed_fields.join(","),
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Subscribe app");
      }
    }
  );

  // ─── ig_unsubscribe_app ──────────────────────────────────────
  server.registerTool(
    "ig_unsubscribe_app",
    {
      description:
        "Unsubscribe application from receiving Webhook notifications for the page/account. Destructive.",
      inputSchema: {},
      annotations: DESTRUCTIVE_TOOL,
    },
    async () => {
      try {
        const targetId = client.igConversationsTargetId;
        const { data, rateLimit } = await client.ig(
          "DELETE",
          `/${targetId}/subscribed_apps`
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Unsubscribe app");
      }
    }
  );
}
