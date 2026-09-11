import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { READ_ONLY_TOOL } from "../annotations.js";
import { getCapabilitiesSummary } from "../../instagram/capabilities.js";

export function registerIgAuthTools(server: McpServer, client: MetaClient): void {
  // ─── ig_get_capabilities ─────────────────────────────────────
  server.registerTool(
    "ig_get_capabilities",
    {
      description:
        "Query the Instagram Platform capabilities matrix for the active authentication mode (Facebook Login vs Instagram Login). " +
        "Returns available capabilities, unavailable features, required permissions, and environment configuration without exposing secrets. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        const mode = client.getInstagramApiMode();
        const summary = getCapabilitiesSummary(mode);

        return formatResponse({
          ...summary,
          server_info: {
            auth_mode: mode,
            runtime_protection: "Acellere Safe Gateway",
          },
        });
      } catch (error) {
        return formatErrorResponse(error, "Get Instagram capabilities");
      }
    }
  );

  // ─── ig_get_connection_info ──────────────────────────────────
  server.registerTool(
    "ig_get_connection_info",
    {
      description:
        "Get sanitized connection metadata for the configured Instagram environment. " +
        "Checks whether Instagram User ID, Facebook Page ID, and App ID are configured without exposing secret values. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        const mode = client.getInstagramApiMode();
        let igUserIdConfigured = false;
        try {
          igUserIdConfigured = !!client.igUserId;
        } catch {
          igUserIdConfigured = false;
        }

        return formatResponse({
          login_mode: mode,
          instagram_user_id_configured: igUserIdConfigured,
          instagram_user_id: igUserIdConfigured ? client.igUserId : null,
          platform: "Instagram Platform",
        });
      } catch (error) {
        return formatErrorResponse(error, "Get connection info");
      }
    }
  );

  // ─── ig_bootstrap_discovery ──────────────────────────────────
  server.registerTool(
    "ig_bootstrap_discovery",
    {
      description:
        "Bootstrap discovery for Instagram accounts. In Facebook Login mode, discovers Facebook Pages and connected " +
        "Instagram Business/Creator accounts via /me/accounts. In Instagram Login mode, queries /me profile. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        const mode = client.getInstagramApiMode();

        if (mode === "facebook-login") {
          // Discover Pages and linked Instagram Business Accounts
          const res = await client.meta("GET", "/me/accounts", {
            fields: "id,name,category,tasks,instagram_business_account{id,username,name,profile_picture_url}",
          });

          return formatResponse({
            mode: "facebook-login",
            pages_discovered: res.data.data ?? [],
          }, res.rateLimit);
        } else {
          // Instagram Login: query /me
          const res = await client.ig("GET", "/me", {
            fields: "id,username,name,account_type,profile_picture_url",
          });

          return formatResponse({
            mode: "instagram-login",
            authenticated_user: res.data,
          }, res.rateLimit);
        }
      } catch (error) {
        return formatErrorResponse(error, "Bootstrap discovery");
      }
    }
  );
}
