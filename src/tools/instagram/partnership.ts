import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { metaId } from "../../schemas.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { buildParams } from "../../utils/params.js";
import { READ_ONLY_TOOL, WRITE_IDEMPOTENT_TOOL, DESTRUCTIVE_TOOL } from "../annotations.js";

export function registerIgPartnershipTools(server: McpServer, client: MetaClient): void {
  // ─── ig_get_branded_content_ad_permissions ───────────────────
  server.registerTool(
    "ig_get_branded_content_ad_permissions",
    {
      description:
        "Check creator ad permissions and boost eligibility for a branded content media post. Read-only.",
      inputSchema: {
        media_id: metaId.describe("Instagram Media ID"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ media_id }) => {
      try {
        client.requireInstagramCapability("partnership.adPermissions");
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${media_id}/branded_content_ad_permissions`
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get branded content ad permissions");
      }
    }
  );

  // ─── ig_get_advertisable_media ───────────────────────────────
  server.registerTool(
    "ig_get_advertisable_media",
    {
      description:
        "List media posts that have been approved and are eligible to run as Partnership Ads by brand partners. Read-only.",
      inputSchema: {
        limit: z.number().optional().describe("Number of results"),
        after: z.string().optional().describe("Pagination cursor for next page"),
        before: z.string().optional().describe("Pagination cursor for previous page"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ limit, after, before }) => {
      try {
        client.requireInstagramCapability("partnership.advertisableMedia");
        const params = buildParams({}, { limit, after, before });
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${client.igUserId}/branded_content_advertisable_medias`,
          params
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get advertisable media");
      }
    }
  );

  // ─── ig_get_authorized_ad_accounts ───────────────────────────
  server.registerTool(
    "ig_get_authorized_ad_accounts",
    {
      description:
        "Get list of brand partner ad accounts permitted to create Partnership Ads from this creator account. Read-only.",
      inputSchema: {
        limit: z.number().optional().describe("Number of results"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ limit }) => {
      try {
        client.requireInstagramCapability("partnership.authorizedPartners");
        const params = buildParams({}, { limit });
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${client.igUserId}/branded_content_ad_partners`,
          params
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get authorized ad accounts");
      }
    }
  );

  // ─── ig_set_authorized_ad_account ────────────────────────────
  server.registerTool(
    "ig_set_authorized_ad_account",
    {
      description:
        "Authorize a brand partner (by Facebook Page ID or Ad Account ID) to run Partnership Ads featuring this account. Idempotent.",
      inputSchema: {
        sponsor_id: metaId.describe("Brand partner Facebook Page ID or Ad Account ID to authorize"),
      },
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async ({ sponsor_id }) => {
      try {
        client.requireInstagramCapability("partnership.authorizedPartners");
        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/branded_content_ad_partners`,
          undefined,
          {
            jsonBody: {
              sponsor_id,
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Set authorized ad account");
      }
    }
  );

  // ─── ig_delete_authorized_ad_account ─────────────────────────
  server.registerTool(
    "ig_delete_authorized_ad_account",
    {
      description:
        "Revoke Partnership Ad authorization for a brand partner. Destructive.",
      inputSchema: {
        sponsor_id: metaId.describe("Brand partner Facebook Page ID or Ad Account ID to revoke"),
      },
      annotations: DESTRUCTIVE_TOOL,
    },
    async ({ sponsor_id }) => {
      try {
        client.requireInstagramCapability("partnership.authorizedPartners");
        const { data, rateLimit } = await client.ig(
          "DELETE",
          `/${client.igUserId}/branded_content_ad_partners`,
          undefined,
          {
            jsonBody: {
              sponsor_id,
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Delete authorized ad account");
      }
    }
  );

  // ─── ig_get_tag_approval_requests ────────────────────────────
  server.registerTool(
    "ig_get_tag_approval_requests",
    {
      description:
        "Get pending branded content tag approval requests from creators seeking permission to tag this brand. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        client.requireInstagramCapability("partnership.tagApproval");
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${client.igUserId}/branded_content_tag_approval`
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get tag approval requests");
      }
    }
  );

  // ─── ig_update_tag_approval ──────────────────────────────────
  server.registerTool(
    "ig_update_tag_approval",
    {
      description:
        "Approve or reject a creator's request to tag this brand in a Branded Content post. Idempotent.",
      inputSchema: {
        user_id: metaId.describe("Creator Instagram User ID requesting approval"),
        status: z.enum(["APPROVED", "REJECTED"]).describe("Approval status decision"),
      },
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async ({ user_id, status }) => {
      try {
        client.requireInstagramCapability("partnership.tagApproval");
        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/branded_content_tag_approval`,
          undefined,
          {
            jsonBody: {
              user_id,
              status,
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Update tag approval");
      }
    }
  );
}
