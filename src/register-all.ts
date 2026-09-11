import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "./services/meta-client.js";

// Meta platform tools
import { registerMetaAuthTools } from "./tools/meta/auth.js";

// Instagram tools
import { registerIgAuthTools } from "./tools/instagram/auth.js";
import { registerIgPublishingTools } from "./tools/instagram/publishing.js";
import { registerIgMediaTools } from "./tools/instagram/media.js";
import { registerIgCommentTools } from "./tools/instagram/comments.js";
import { registerIgProfileTools } from "./tools/instagram/profile.js";
import { registerIgBusinessMediaTools } from "./tools/instagram/business-media.js";
import { registerIgBusinessAnalyticsTools } from "./tools/instagram/business-analytics.js";
import { registerIgBusinessComparisonTools } from "./tools/instagram/business-comparison.js";
import { registerIgCompetitorTrackingTools } from "./tools/instagram/competitor-tracking.js";
import { registerIgCompetitorResearchTools } from "./tools/instagram/competitor-research.js";
import { registerIgHashtagTools } from "./tools/instagram/hashtags.js";
import { registerIgMentionTools } from "./tools/instagram/mentions.js";
import { registerIgMessagingTools } from "./tools/instagram/messaging.js";
import { registerIgMessengerProfileTools } from "./tools/instagram/messenger-profile.js";
import { registerIgWebhookTools } from "./tools/instagram/webhooks.js";
import { registerIgCommerceTools } from "./tools/instagram/commerce.js";
import { registerIgPartnershipTools } from "./tools/instagram/partnership.js";
import { registerIgOembedTools } from "./tools/instagram/oembed.js";

// Threads tools
import { registerThreadsPublishingTools } from "./tools/threads/publishing.js";
import { registerThreadsMediaTools } from "./tools/threads/media.js";
import { registerThreadsReplyTools } from "./tools/threads/replies.js";
import { registerThreadsProfileTools } from "./tools/threads/profile.js";
import { registerThreadsInsightTools } from "./tools/threads/insights.js";
import { registerThreadsMentionsTools } from "./tools/threads/mentions.js";

// Resources & Prompts
import { registerInstagramResources } from "./resources/instagram.js";
import { registerThreadsResources } from "./resources/threads.js";
import { registerPrompts } from "./prompts/index.js";

export function registerAll(server: McpServer, client: MetaClient): void {
  registerMetaAuthTools(server, client);
  registerIgAuthTools(server, client);
  registerIgPublishingTools(server, client);
  registerIgMediaTools(server, client);
  registerIgCommentTools(server, client);
  registerIgProfileTools(server, client);
  registerIgBusinessMediaTools(server, client);
  registerIgBusinessAnalyticsTools(server, client);
  registerIgBusinessComparisonTools(server, client);
  registerIgCompetitorTrackingTools(server, client);
  registerIgCompetitorResearchTools(server, client);
  registerIgHashtagTools(server, client);
  registerIgMentionTools(server, client);
  registerIgMessagingTools(server, client);
  registerIgMessengerProfileTools(server, client);
  registerIgWebhookTools(server, client);
  registerIgCommerceTools(server, client);
  registerIgPartnershipTools(server, client);
  registerIgOembedTools(server, client);
  registerThreadsPublishingTools(server, client);
  registerThreadsMediaTools(server, client);
  registerThreadsReplyTools(server, client);
  registerThreadsProfileTools(server, client);
  registerThreadsInsightTools(server, client);
  registerThreadsMentionsTools(server, client);
  registerInstagramResources(server, client);
  registerThreadsResources(server, client);
  registerPrompts(server);
}
