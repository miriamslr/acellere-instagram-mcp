import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { metaId } from "../../schemas.js";
import { formatErrorResponse, validationError } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { buildParams } from "../../utils/params.js";
import { READ_ONLY_TOOL, WRITE_TOOL } from "../annotations.js";

const GET_CONVERSATIONS_DEFAULT_FIELDS = "id,updated_time,participants,messages{id,message,from,created_time}";
// Both /conversations/{id}/messages and /messages/{id} share the same Message resource shape, so they reuse the same default field set.
const MESSAGE_DEFAULT_FIELDS = "id,message,from,created_time,attachments";

const textEncoder = new TextEncoder();

export function registerIgMessagingTools(server: McpServer, client: MetaClient): void {
  // ─── ig_get_conversations ────────────────────────────────────
  server.registerTool(
    "ig_get_conversations",
    {
      description: "Get Instagram DM conversations list. Requires 'instagram_manage_messages' and 'pages_manage_metadata' with Facebook Page ID (Facebook Login) or 'instagram_business_manage_messages' (Instagram Login).",
      inputSchema: {
        folder: z.enum(["inbox", "spam"]).optional().describe("Folder to retrieve (default: inbox)"),
        limit: z.number().optional().describe("Number of conversations"),
        after: z.string().optional().describe("Pagination cursor for next page"),
        before: z.string().optional().describe("Pagination cursor for previous page"),
        fields: z.string().optional().default(GET_CONVERSATIONS_DEFAULT_FIELDS).describe(`Comma-separated fields (default: ${GET_CONVERSATIONS_DEFAULT_FIELDS})`),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ folder, limit, after, before, fields }) => {
      try {
        const params = buildParams(
          { platform: "instagram", fields },
          { folder, limit, after, before }
        );
        const { data, rateLimit } = await client.ig("GET", `/${client.igConversationsTargetId}/conversations`, params);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get conversations");
      }
    }
  );

  // ─── ig_get_messages ─────────────────────────────────────────
  server.registerTool(
    "ig_get_messages",
    {
      description: "Get messages in a specific DM conversation.",
      inputSchema: {
        conversation_id: metaId.describe("Conversation ID"),
        limit: z.number().optional().describe("Number of messages"),
        after: z.string().optional().describe("Pagination cursor for next page"),
        before: z.string().optional().describe("Pagination cursor for previous page"),
        fields: z.string().optional().default(MESSAGE_DEFAULT_FIELDS).describe(`Comma-separated fields (default: ${MESSAGE_DEFAULT_FIELDS})`),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ conversation_id, limit, after, before, fields }) => {
      try {
        const params = buildParams({ fields }, { limit, after, before });
        const { data, rateLimit } = await client.ig("GET", `/${conversation_id}/messages`, params);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get messages");
      }
    }
  );

  // ─── ig_send_message ─────────────────────────────────────────
  server.registerTool(
    "ig_send_message",
    {
      description: "Send a DM to a user. Requires 'instagram_manage_messages' (Facebook Login) or 'instagram_business_manage_messages' (Instagram Login) permission. The recipient must have messaged the account first. Messaging window depends on messaging_type: RESPONSE/UPDATE allow replies within 24 hours of the user's last message; MESSAGE_TAG with tag=HUMAN_AGENT extends the window to 7 days (human-sent support replies only — the HUMAN_AGENT feature requires App Review and forbids automated use, per https://developers.facebook.com/docs/features-reference/human-agent). Other tag values are Messenger-oriented; HUMAN_AGENT is the documented reliable choice on Instagram.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the recipient"),
        message: z.string()
          .min(1)
          .refine((s) => textEncoder.encode(s).length <= 1000, {
            message: "Message text must be 1000 UTF-8 bytes or less",
          })
          .describe("Message text to send (max 1000 UTF-8 bytes per Meta's Instagram Messaging API)"),
        messaging_type: z
          .enum(["RESPONSE", "UPDATE", "MESSAGE_TAG"])
          .optional()
          .default("RESPONSE")
          .describe("Send API messaging classification. RESPONSE = reply within the 24-hour window (default). UPDATE = proactive update within the 24-hour window. MESSAGE_TAG = send outside the 24-hour window using one of the tag values below (Instagram reliably supports HUMAN_AGENT for the 7-day window). See https://developers.facebook.com/docs/messenger-platform/reference/send-api/."),
        tag: z
          .enum(["HUMAN_AGENT", "CONFIRMED_EVENT_UPDATE", "POST_PURCHASE_UPDATE", "ACCOUNT_UPDATE", "CUSTOMER_FEEDBACK"])
          .optional()
          .describe("Message tag, required when messaging_type=MESSAGE_TAG and forbidden otherwise. HUMAN_AGENT extends the window to 7 days for human-sent support replies and is the only tag with documented Instagram support; the remaining values are Messenger-oriented and may be silently rejected on Instagram."),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, message, messaging_type, tag }) => {
      try {
        if (messaging_type === "MESSAGE_TAG" && tag === undefined) {
          return validationError("messaging_type=MESSAGE_TAG requires a tag (e.g., HUMAN_AGENT for the 7-day window).");
        }
        if (tag !== undefined && messaging_type !== "MESSAGE_TAG") {
          return validationError("tag is only valid when messaging_type=MESSAGE_TAG. Omit tag or set messaging_type=MESSAGE_TAG.");
        }
        const jsonBody: Record<string, unknown> = {
          recipient: { id: recipient_id },
          message: { text: message },
          messaging_type,
        };
        if (tag !== undefined) jsonBody.tag = tag;
        const { data, rateLimit } = await client.ig("POST", `/${client.igUserId}/messages`, undefined, { jsonBody });
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Send message");
      }
    }
  );

  // ─── ig_get_message ──────────────────────────────────────────
  server.registerTool(
    "ig_get_message",
    {
      description: "Get details of a specific DM message.",
      inputSchema: {
        message_id: metaId.describe("Message ID"),
        fields: z.string().optional().default(MESSAGE_DEFAULT_FIELDS).describe(`Comma-separated fields (default: ${MESSAGE_DEFAULT_FIELDS})`),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ message_id, fields }) => {
      try {
        const { data, rateLimit } = await client.ig("GET", `/${message_id}`, { fields });
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get message");
      }
    }
  );

  // ─── ig_send_media_message ───────────────────────────────────
  server.registerTool(
    "ig_send_media_message",
    {
      description:
        "Send an Image, Video, Audio, or File direct message to a user via URL or reusable attachment_id. " +
        "Requires recipient_id, attachment_type, and either media_url or attachment_id. Write.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the recipient"),
        attachment_type: z.enum(["image", "video", "audio", "file"]).describe("Media type"),
        media_url: z.string().url().optional().describe("Public HTTPS URL of the media file (JPEG, PNG, MP4, AAC)"),
        attachment_id: z.string().optional().describe("Reusable attachment_id obtained from ig_upload_attachment"),
        is_reusable: z.boolean().optional().default(true).describe("Save as reusable attachment for future sends"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, attachment_type, media_url, attachment_id, is_reusable }) => {
      try {
        if (!media_url && !attachment_id) {
          return validationError("Provide either media_url or attachment_id to send a media message.");
        }

        const attachmentPayload: Record<string, unknown> = attachment_id
          ? { attachment_id }
          : { url: media_url, is_reusable };

        const jsonBody = {
          recipient: { id: recipient_id },
          message: {
            attachment: {
              type: attachment_type,
              payload: attachmentPayload,
            },
          },
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messages`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Send media message");
      }
    }
  );

  // ─── ig_send_sticker ─────────────────────────────────────────
  server.registerTool(
    "ig_send_sticker",
    {
      description: "Send a sticker (e.g. like_heart) direct message to a user via the official Instagram Send API. Write.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the recipient"),
        sticker_type: z.enum(["like_heart"]).optional().default("like_heart").describe("Sticker attachment type (default: like_heart)"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, sticker_type }) => {
      try {
        const jsonBody = {
          recipient: { id: recipient_id },
          message: {
            attachment: {
              type: sticker_type,
            },
          },
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messages`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Send sticker");
      }
    }
  );

  // ─── ig_send_published_post ──────────────────────────────────
  server.registerTool(
    "ig_send_published_post",
    {
      description: "Share an existing published Instagram post into a direct message using MEDIA_SHARE attachment. Write.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the recipient"),
        media_id: metaId.describe("ID of the published Instagram media post to share"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, media_id }) => {
      try {
        const jsonBody = {
          recipient: { id: recipient_id },
          message: {
            attachment: {
              type: "MEDIA_SHARE",
              payload: {
                id: media_id,
              },
            },
          },
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messages`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Send published post");
      }
    }
  );

  // ─── ig_send_quick_replies ───────────────────────────────────
  server.registerTool(
    "ig_send_quick_replies",
    {
      description:
        "Send a text message with quick reply button options (up to 13 items). Supports text buttons, user_phone_number, and user_email. Write.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the recipient"),
        text: z.string().min(1).max(1000).describe("Prompt text displayed above quick reply options"),
        quick_replies: z
          .array(
            z.discriminatedUnion("content_type", [
              z.object({
                content_type: z.literal("text"),
                title: z.string().min(1).max(20).describe("Button label (max 20 chars)"),
                payload: z.string().min(1).max(1000).describe("Custom developer payload sent when clicked"),
                image_url: z.string().url().optional().describe("Optional button icon image URL"),
              }),
              z.object({
                content_type: z.literal("user_phone_number"),
                title: z.string().min(1).max(20).optional().describe("Optional custom button label"),
                payload: z.string().min(1).max(1000).optional().describe("Optional custom payload"),
                image_url: z.string().url().optional().describe("Optional icon URL"),
              }),
              z.object({
                content_type: z.literal("user_email"),
                title: z.string().min(1).max(20).optional().describe("Optional custom button label"),
                payload: z.string().min(1).max(1000).optional().describe("Optional custom payload"),
                image_url: z.string().url().optional().describe("Optional icon URL"),
              }),
            ])
          )
          .min(1)
          .max(13)
          .describe("Array of quick reply options (1 to 13 items)"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, text, quick_replies }) => {
      try {
        const jsonBody = {
          recipient: { id: recipient_id },
          message: {
            text,
            quick_replies,
          },
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messages`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Send quick replies");
      }
    }
  );

  // ─── ig_send_generic_template ────────────────────────────────
  server.registerTool(
    "ig_send_generic_template",
    {
      description:
        "Send an interactive Generic Template card or carousel (up to 10 cards) with image, title, subtitle, CTA buttons, and default_action in Direct. Write.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the recipient"),
        elements: z
          .array(
            z.object({
              title: z.string().min(1).max(80).describe("Card title (max 80 chars)"),
              subtitle: z.string().max(80).optional().describe("Card subtitle (max 80 chars)"),
              image_url: z.string().url().optional().describe("Card image URL"),
              default_action: z
                .object({
                  type: z.literal("web_url").optional().default("web_url"),
                  url: z.string().url().describe("URL to open when the card is tapped"),
                  webview_height_ratio: z.enum(["compact", "tall", "full"]).optional(),
                  messenger_extensions: z.boolean().optional(),
                  fallback_url: z.string().url().optional(),
                })
                .optional()
                .describe("Default action executed when the user taps on the card body/image"),
              buttons: z
                .array(
                  z.object({
                    type: z.enum(["web_url", "postback"]).describe("Button type"),
                    title: z.string().min(1).max(20).describe("Button label (max 20 chars)"),
                    url: z.string().url().optional().describe("Destination URL for web_url button"),
                    payload: z.string().optional().describe("Payload for postback button"),
                  })
                )
                .max(3)
                .optional()
                .describe("Up to 3 CTA buttons per card"),
            })
          )
          .min(1)
          .max(10)
          .describe("Array of cards (1 to 10 elements)"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, elements }) => {
      try {
        const jsonBody = {
          recipient: { id: recipient_id },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "generic",
                elements,
              },
            },
          },
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messages`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Send generic template");
      }
    }
  );

  // ─── ig_send_button_template ─────────────────────────────────
  server.registerTool(
    "ig_send_button_template",
    {
      description:
        "Send a Button Template message (text prompt with up to 3 CTA buttons) in Instagram Direct. Write.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the recipient"),
        text: z.string().min(1).max(640).describe("Message prompt text (max 640 chars)"),
        buttons: z
          .array(
            z.object({
              type: z.enum(["web_url", "postback"]).describe("Button type"),
              title: z.string().min(1).max(20).describe("Button label (max 20 chars)"),
              url: z.string().url().optional().describe("Destination URL for web_url"),
              payload: z.string().optional().describe("Payload for postback button"),
            })
          )
          .min(1)
          .max(3)
          .describe("Array of 1 to 3 buttons"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, text, buttons }) => {
      try {
        const jsonBody = {
          recipient: { id: recipient_id },
          message: {
            attachment: {
              type: "template",
              payload: {
                template_type: "button",
                text,
                buttons,
              },
            },
          },
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messages`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Send button template");
      }
    }
  );

  // ─── ig_send_reaction ────────────────────────────────────────
  server.registerTool(
    "ig_send_reaction",
    {
      description: "React to a direct message via the official Instagram sender_action: 'react' with payload { message_id, reaction }. Standard reactions include 'love', 'haha', 'wow', 'sad', 'angry', 'like', 'dislike' or emoji. Write.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the conversation partner"),
        message_id: metaId.describe("Message ID to react to"),
        reaction: z.string().min(1).describe("Reaction identifier ('love', 'haha', 'wow', 'sad', 'angry', 'like', 'dislike', or custom emoji)"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, message_id, reaction }) => {
      try {
        const jsonBody = {
          recipient: { id: recipient_id },
          sender_action: "react",
          payload: {
            message_id,
            reaction,
          },
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messages`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Send reaction");
      }
    }
  );

  // ─── ig_delete_reaction ──────────────────────────────────────
  server.registerTool(
    "ig_delete_reaction",
    {
      description: "Remove an existing reaction from a direct message via sender_action: 'unreact' with payload { message_id }. Write.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the conversation partner"),
        message_id: metaId.describe("Message ID to unreact from"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, message_id }) => {
      try {
        const jsonBody = {
          recipient: { id: recipient_id },
          sender_action: "unreact",
          payload: {
            message_id,
          },
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messages`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Delete reaction");
      }
    }
  );

  // ─── ig_send_sender_action ───────────────────────────────────
  server.registerTool(
    "ig_send_sender_action",
    {
      description: "Send typing indicator (typing_on/typing_off) or mark a conversation as seen (mark_seen). Write.",
      inputSchema: {
        recipient_id: z.string().describe("Instagram-scoped user ID of the recipient"),
        sender_action: z
          .enum(["mark_seen", "typing_on", "typing_off"])
          .describe("Sender action to emit in the conversation"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ recipient_id, sender_action }) => {
      try {
        const jsonBody = {
          recipient: { id: recipient_id },
          sender_action,
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messages`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Send sender action");
      }
    }
  );

  // ─── ig_get_user_profile_by_igsid ────────────────────────────
  server.registerTool(
    "ig_get_user_profile_by_igsid",
    {
      description:
        "Get public profile information (name, profile picture, follower count, follow status) for an Instagram-Scoped ID (IGSID). Read-only.",
      inputSchema: {
        igsid: z.string().describe("Instagram-Scoped User ID"),
        fields: z
          .string()
          .optional()
          .default("name,profile_pic,follower_count,is_user_follow_business,is_business_follow_user")
          .describe("Comma-separated fields to retrieve"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ igsid, fields }) => {
      try {
        const { data, rateLimit } = await client.ig("GET", `/${igsid}`, { fields });
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get user profile by IGSID");
      }
    }
  );

  // ─── ig_upload_attachment ────────────────────────────────────
  server.registerTool(
    "ig_upload_attachment",
    {
      description:
        "Upload a media attachment to Meta's servers to obtain a reusable attachment_id for fast Direct Message delivery. Write.",
      inputSchema: {
        attachment_type: z.enum(["image", "video", "audio", "file"]).describe("Attachment type"),
        url: z.string().url().describe("Public HTTPS URL of the file to upload and cache on Meta's servers"),
        is_reusable: z.boolean().optional().default(true).describe("Whether to mark the attachment as reusable"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ attachment_type, url, is_reusable }) => {
      try {
        const jsonBody = {
          message: {
            attachment: {
              type: attachment_type,
              payload: {
                url,
                is_reusable,
              },
            },
          },
        };

        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/message_attachments`,
          undefined,
          { jsonBody }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Upload message attachment");
      }
    }
  );
}
