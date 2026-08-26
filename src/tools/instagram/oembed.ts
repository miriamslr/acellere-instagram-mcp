import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { httpsUrl } from "../../schemas.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { buildParams } from "../../utils/params.js";
import { READ_ONLY_TOOL } from "../annotations.js";

export function registerIgOembedTools(server: McpServer, client: MetaClient): void {
  // ─── ig_get_oembed ───────────────────────────────────────────
  server.registerTool(
    "ig_get_oembed",
    {
      description:
        "Get official oEmbed HTML embed code and metadata for a public Instagram post or reel. " +
        "Requires oEmbed Read product enabled on Meta App. Read-only.",
      inputSchema: {
        url: httpsUrl.describe("Public Instagram post or reel URL (e.g. https://www.instagram.com/p/DFxyz/)"),
        maxwidth: z.number().min(320).max(1000).optional().describe("Maximum width of the embed frame (320-1000 px)"),
        omitscript: z.boolean().optional().default(false).describe("Omit the embed.js script tag"),
        hidecaption: z.boolean().optional().default(false).describe("Hide caption in the embed frame"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ url, maxwidth, omitscript, hidecaption }) => {
      try {
        const params = buildParams(
          { url },
          { maxwidth, omitscript, hidecaption }
        );
        const { data, rateLimit } = await client.meta("GET", "/instagram_oembed", params);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get oEmbed code");
      }
    }
  );
}
