import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { igBusinessDiscoveryUsernameSchema } from "./profile.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { READ_ONLY_TOOL } from "../annotations.js";
import { fetchBusinessMedia } from "./business-media.js";
import { analyzeCompetitorMedia } from "../../utils/competitor-analytics.js";

export function registerIgBusinessAnalyticsTools(server: McpServer, client: MetaClient): void {
  server.registerTool(
    "ig_analyze_business",
    {
      description:
        "Perform deterministic quantitative analysis on public posts from another Instagram Business/Creator account. " +
        "Calculates public apparent engagement rate, format distribution (% Reels, % Carousels, % Images), " +
        "posting frequency, temporal performance, and top/bottom rankings. Pure mathematical calculations without LLM. Read-only.",
      inputSchema: {
        username: igBusinessDiscoveryUsernameSchema,
        limit: z
          .number()
          .int()
          .positive()
          .max(100)
          .optional()
          .default(50)
          .describe("Number of recent posts to analyze (1-100, default: 50)"),
        since: z.string().optional().describe("Start date filter (Unix timestamp or ISO 8601 string)"),
        until: z.string().optional().describe("End date filter (Unix timestamp or ISO 8601 string)"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ username, limit, since, until }) => {
      try {
        const { data: mediaResponse, rateLimit } = await fetchBusinessMedia({
          client,
          username,
          limit,
          since,
          until,
          includeChildren: true,
          includeMediaUrls: false,
        });

        const report = analyzeCompetitorMedia(mediaResponse.account, mediaResponse.media);
        return formatResponse(report, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Analyze business");
      }
    }
  );
}
