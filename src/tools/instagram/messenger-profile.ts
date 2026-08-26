import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { metaId } from "../../schemas.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { READ_ONLY_TOOL, WRITE_IDEMPOTENT_TOOL, DESTRUCTIVE_TOOL } from "../annotations.js";

const MESSENGER_PROFILE_DEFAULT_FIELDS = "ice_breakers,persistent_menu,greeting,commands";

export function registerIgMessengerProfileTools(server: McpServer, client: MetaClient): void {
  // ─── ig_get_messenger_profile ────────────────────────────────
  server.registerTool(
    "ig_get_messenger_profile",
    {
      description:
        "Get Instagram Direct Messenger Profile configuration (Ice Breakers, Persistent Menu, Greeting, Commands). Read-only.",
      inputSchema: {
        fields: z
          .string()
          .optional()
          .default(MESSENGER_PROFILE_DEFAULT_FIELDS)
          .describe(`Comma-separated fields to retrieve (default: ${MESSENGER_PROFILE_DEFAULT_FIELDS})`),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ fields }) => {
      try {
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${client.igUserId}/messenger_profile`,
          { fields }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get messenger profile");
      }
    }
  );

  // ─── ig_set_ice_breakers ─────────────────────────────────────
  server.registerTool(
    "ig_set_ice_breakers",
    {
      description:
        "Configure FAQ Ice Breaker prompt questions (up to 4 items) displayed to new users entering Instagram Direct. Idempotent.",
      inputSchema: {
        ice_breakers: z
          .array(
            z.object({
              question: z.string().min(1).max(80).describe("Question prompt string (max 80 chars)"),
              payload: z.string().min(1).max(1000).describe("Developer payload sent when clicked"),
            })
          )
          .min(1)
          .max(4)
          .describe("Array of 1 to 4 ice breaker questions"),
      },
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async ({ ice_breakers }) => {
      try {
        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messenger_profile`,
          undefined,
          {
            jsonBody: {
              ice_breakers,
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Set ice breakers");
      }
    }
  );

  // ─── ig_delete_ice_breakers ──────────────────────────────────
  server.registerTool(
    "ig_delete_ice_breakers",
    {
      description: "Delete Instagram Direct Ice Breakers configuration for the account. Destructive.",
      inputSchema: {},
      annotations: DESTRUCTIVE_TOOL,
    },
    async () => {
      try {
        const { data, rateLimit } = await client.ig(
          "DELETE",
          `/${client.igUserId}/messenger_profile`,
          undefined,
          {
            jsonBody: {
              fields: ["ice_breakers"],
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Delete ice breakers");
      }
    }
  );

  // ─── ig_set_persistent_menu ──────────────────────────────────
  server.registerTool(
    "ig_set_persistent_menu",
    {
      description:
        "Configure Persistent Menu call-to-actions in the Instagram Direct composer. Idempotent.",
      inputSchema: {
        persistent_menu: z
          .array(
            z.object({
              locale: z.string().default("default").describe("Locale string, default: 'default'"),
              composer_input_disabled: z.boolean().optional().default(false).describe("Disable text input in composer"),
              call_to_actions: z
                .array(
                  z.object({
                    type: z.enum(["web_url", "postback"]).describe("Action type"),
                    title: z.string().min(1).max(30).describe("Button label (max 30 chars)"),
                    url: z.string().url().optional().describe("Destination URL for web_url"),
                    payload: z.string().optional().describe("Payload for postback"),
                  })
                )
                .min(1)
                .max(20)
                .describe("Menu items array"),
            })
          )
          .min(1)
          .describe("Persistent menu configuration array"),
      },
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async ({ persistent_menu }) => {
      try {
        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/messenger_profile`,
          undefined,
          {
            jsonBody: {
              persistent_menu,
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Set persistent menu");
      }
    }
  );

  // ─── ig_delete_persistent_menu ───────────────────────────────
  server.registerTool(
    "ig_delete_persistent_menu",
    {
      description: "Delete Persistent Menu configuration for the account. Destructive.",
      inputSchema: {},
      annotations: DESTRUCTIVE_TOOL,
    },
    async () => {
      try {
        const { data, rateLimit } = await client.ig(
          "DELETE",
          `/${client.igUserId}/messenger_profile`,
          undefined,
          {
            jsonBody: {
              fields: ["persistent_menu"],
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Delete persistent menu");
      }
    }
  );

  // ─── ig_list_welcome_message_flows ───────────────────────────
  server.registerTool(
    "ig_list_welcome_message_flows",
    {
      description: "List Welcome Message automation flows configured on the Instagram account. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${client.igUserId}/welcome_message_flows`
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "List welcome message flows");
      }
    }
  );

  // ─── ig_get_welcome_message_flow ─────────────────────────────
  server.registerTool(
    "ig_get_welcome_message_flow",
    {
      description: "Get details and metadata for a specific Welcome Message Flow. Read-only.",
      inputSchema: {
        flow_id: metaId.describe("Welcome message flow ID"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ flow_id }) => {
      try {
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${flow_id}`,
          { fields: "id,name,welcome_message_flow,is_default" }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get welcome message flow");
      }
    }
  );

  // ─── ig_set_welcome_message_flow ─────────────────────────────
  server.registerTool(
    "ig_set_welcome_message_flow",
    {
      description: "Create or configure a Welcome Message Flow for Instagram Direct. Idempotent.",
      inputSchema: {
        name: z.string().min(1).describe("Flow name"),
        welcome_message_flow: z.record(z.string(), z.unknown()).describe("Welcome message flow configuration object"),
      },
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async ({ name, welcome_message_flow }) => {
      try {
        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/welcome_message_flows`,
          undefined,
          {
            jsonBody: {
              name,
              welcome_message_flow,
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Set welcome message flow");
      }
    }
  );

  // ─── ig_delete_welcome_message_flow ──────────────────────────
  server.registerTool(
    "ig_delete_welcome_message_flow",
    {
      description: "Delete an existing Welcome Message Flow by flow ID. Destructive.",
      inputSchema: {
        flow_id: metaId.describe("Welcome message flow ID to delete"),
      },
      annotations: DESTRUCTIVE_TOOL,
    },
    async ({ flow_id }) => {
      try {
        const { data, rateLimit } = await client.ig(
          "DELETE",
          `/${flow_id}`
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Delete welcome message flow");
      }
    }
  );
}
