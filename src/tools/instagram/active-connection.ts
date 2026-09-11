import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { READ_ONLY_TOOL, WRITE_IDEMPOTENT_TOOL } from "../annotations.js";
import type { SafeActiveInstagramConnectionStatus } from "../../services/active-instagram-connection.js";

export interface ActiveConnectionToolContext {
  getStatus(): Promise<SafeActiveInstagramConnectionStatus>;
  disconnect(): Promise<{ removed: boolean; active_connection: SafeActiveInstagramConnectionStatus }>;
}

export function registerIgActiveConnectionTools(server: McpServer, context: ActiveConnectionToolContext): void {
  server.registerTool(
    "ig_get_active_connection",
    {
      description:
        "Get sanitized metadata about the single Instagram connection currently used by the MCP. " +
        "Reports whether the source is an OAuth-reconnected account or the legacy environment fallback, without exposing access tokens. Read-only.",
      inputSchema: {},
      annotations: READ_ONLY_TOOL,
    },
    async () => {
      try {
        return formatResponse(await context.getStatus());
      } catch (error) {
        return formatErrorResponse(error, "Get active Instagram connection");
      }
    }
  );

  server.registerTool(
    "ig_disconnect_active_connection",
    {
      description:
        "Remove the currently active OAuth Instagram connection. If legacy environment credentials are configured, subsequent MCP requests fall back to them. " +
        "This changes Acellere local runtime state only; it does not revoke the Meta token or mutate Instagram content.",
      inputSchema: {},
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async () => {
      try {
        return formatResponse(await context.disconnect());
      } catch (error) {
        return formatErrorResponse(error, "Disconnect active Instagram connection");
      }
    }
  );
}
