import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { metaId } from "../../schemas.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { buildParams } from "../../utils/params.js";
import { READ_ONLY_TOOL, WRITE_TOOL } from "../annotations.js";

const MENTIONED_COMMENT_DEFAULT_FIELDS = "id,text,timestamp,username,media{id,media_url,media_type}";
const TAGGED_MEDIA_DEFAULT_FIELDS = "id,caption,media_type,media_url,permalink,timestamp,username";

export function registerIgMentionTools(server: McpServer, client: MetaClient): void {
  // ─── ig_get_mentioned_comment ────────────────────────────────
  server.registerTool(
    "ig_get_mentioned_comment",
    {
      description: "Get details of a specific comment where the account was @mentioned. Requires the comment_id from a mention webhook notification. Returns a single comment with its associated media.",
      inputSchema: {
        comment_id: metaId.describe("Comment ID from a mention webhook notification"),
        fields: z.string().optional().default(MENTIONED_COMMENT_DEFAULT_FIELDS).describe(`Comma-separated fields (default: ${MENTIONED_COMMENT_DEFAULT_FIELDS})`),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ comment_id, fields }) => {
      try {
        const { data, rateLimit } = await client.ig("GET", `/${client.igUserId}/mentioned_comment`, {
          comment_id,
          fields,
        });
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get mentioned comment");
      }
    }
  );

  // ─── ig_get_tagged_media ─────────────────────────────────────
  server.registerTool(
    "ig_get_tagged_media",
    {
      description: "Get media where the account is tagged (photo tags, not @mentions).",
      inputSchema: {
        limit: z.number().optional().describe("Number of results"),
        after: z.string().optional().describe("Pagination cursor for next page"),
        before: z.string().optional().describe("Pagination cursor for previous page"),
        fields: z.string().optional().default(TAGGED_MEDIA_DEFAULT_FIELDS).describe(`Comma-separated fields (default: ${TAGGED_MEDIA_DEFAULT_FIELDS})`),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ limit, after, before, fields }) => {
      try {
        const params = buildParams({ fields }, { limit, after, before });
        const { data, rateLimit } = await client.ig("GET", `/${client.igUserId}/tags`, params);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get tagged media");
      }
    }
  );

  // ─── ig_get_mentioned_media ──────────────────────────────────
  server.registerTool(
    "ig_get_mentioned_media",
    {
      description: "Get details of a media post where the account was @mentioned in the caption. Requires media_id from a mention webhook notification. Read-only.",
      inputSchema: {
        media_id: metaId.describe("Media ID from a caption mention webhook"),
        fields: z.string().optional().default("id,caption,media_type,comments_count,like_count,permalink,timestamp").describe("Comma-separated fields"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ media_id, fields }) => {
      try {
        const { data, rateLimit } = await client.ig("GET", `/${client.igUserId}/mentioned_media`, {
          media_id,
          fields,
        });
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get mentioned media");
      }
    }
  );

  // ─── ig_reply_to_mention ─────────────────────────────────────
  server.registerTool(
    "ig_reply_to_mention",
    {
      description: "Publish a reply comment to a media post or comment where this account was @mentioned. Requires media_id or comment_id. Write.",
      inputSchema: {
        message: z.string().min(1).max(2200).describe("Reply text message"),
        comment_id: metaId.optional().describe("Comment ID to reply to (if mentioned in a comment)"),
        media_id: metaId.optional().describe("Media ID to reply to (if mentioned in a caption)"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ message, comment_id, media_id }) => {
      try {
        if (!comment_id && !media_id) {
          throw new Error("Provide at least one of comment_id or media_id to reply to a mention.");
        }
        const params: Record<string, string> = { message };
        if (comment_id) params.comment_id = comment_id;
        if (media_id) params.media_id = media_id;

        const { data, rateLimit } = await client.ig("POST", `/${client.igUserId}/mentions`, params);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Reply to mention");
      }
    }
  );
}
