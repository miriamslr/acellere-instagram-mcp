import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { httpsUrl, metaId } from "../../schemas.js";
import { waitForIgContainer, IMAGE_PROCESSING_TIMEOUT, VIDEO_PROCESSING_TIMEOUT } from "../../utils/container.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { buildParams } from "../../utils/params.js";
import { makeProgressNotifier, ProgressExtra } from "../../utils/progress.js";
import { READ_ONLY_TOOL, WRITE_TOOL } from "../annotations.js";
import { IG_PROFILE_CACHE_PREFIX } from "./profile.js";

// Counts code points (the spread iterator yields one entry per code point) rather
// than UTF-16 code units, so emoji-heavy strings under Meta's documented
// "character" cap aren't falsely rejected by the schema.
const captionSchema = z.string()
  .refine((s) => [...s].length <= 2200, { message: "Caption must be 2200 characters or fewer" })
  .optional();

const altTextSchema = z.string()
  .refine((s) => [...s].length <= 1000, { message: "alt_text must be 1000 characters or fewer" })
  .optional();

const collaboratorUsername = z
  .string()
  .trim()
  .transform((v) => v.replace(/^@+/, ""))
  .refine((v) => v.length > 0, {
    message: "Collaborator username cannot be empty, only whitespace, or only '@' characters",
  });

export const collaboratorsSchema = z
  .array(collaboratorUsername)
  .min(1, "Collaborators array must have at least 1 entry when provided")
  .max(3, "Maximum 3 collaborators per post (Instagram API limit)")
  .refine((arr) => new Set(arr).size === arr.length, {
    message: "Collaborator usernames must be unique",
  })
  .optional()
  .describe(
    "Optional. Up to 3 unique Instagram usernames to invite as collaborators. Per Instagram Graph API: supported for Feed image, Reels, and Carousels — not supported for Stories. Leading '@' characters and surrounding whitespace are auto-stripped before the uniqueness check."
  );

export function registerIgPublishingTools(server: McpServer, client: MetaClient): void {
  // ─── ig_publish_photo ────────────────────────────────────────
  server.registerTool(
    "ig_publish_photo",
    {
      description: "Publish a photo to Instagram. Two-step process: creates container then publishes. Requires image_url (publicly accessible HTTPS URL).",
      inputSchema: {
        image_url: httpsUrl.describe("Public HTTPS URL of the image (JPEG only)"),
        caption: captionSchema.describe("Post caption (max 2200 chars)"),
        location_id: z.string().optional().describe("Facebook Page location ID"),
        user_tags: z.string().optional().describe("JSON array of user tags: [{username, x, y}]"),
        alt_text: altTextSchema.describe("Alt text for accessibility (max 1000 chars per Meta's Instagram media spec)"),
        collaborators: collaboratorsSchema,
      },
      annotations: WRITE_TOOL,
    },
    async ({ image_url, caption, location_id, user_tags, alt_text, collaborators }, extra?: ProgressExtra) => {
      let step = "container creation";
      let containerId: string | undefined;
      try {
        const params = buildParams(
          { image_url },
          {
            caption,
            location_id,
            user_tags,
            alt_text,
            collaborators: collaborators?.length ? JSON.stringify(collaborators) : undefined,
          }
        );
        const { data: container } = await client.ig("POST", `/${client.igUserId}/media`, params);
        if (typeof container.id !== "string") throw new Error("Container creation did not return a valid id");
        containerId = container.id;
        step = "processing";
        await waitForIgContainer(client, containerId, IMAGE_PROCESSING_TIMEOUT, { onProgress: makeProgressNotifier(extra) });
        step = "publishing";
        const { data, rateLimit } = await client.ig("POST", `/${client.igUserId}/media_publish`, {
          creation_id: containerId,
        });
        client.invalidateCache(IG_PROFILE_CACHE_PREFIX);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Publish photo", { step, containerId });
      }
    }
  );

  // ─── ig_publish_video ────────────────────────────────────────
  server.registerTool(
    "ig_publish_video",
    {
      description: "[DEPRECATED] Use ig_publish_reel instead. Publishes via media_type=REELS under the hood; the legacy VIDEO media_type was deprecated by Meta on Nov 9, 2023. Kept for backward compatibility — new integrations should use ig_publish_reel which exposes Reels-specific options (cover_url, share_to_feed).",
      inputSchema: {
        video_url: httpsUrl.describe("Public HTTPS URL of the video"),
        caption: captionSchema.describe("Post caption (max 2200 chars)"),
        thumb_offset: z.number().optional().describe("Thumbnail offset in ms"),
        location_id: z.string().optional().describe("Facebook Page location ID"),
        collaborators: collaboratorsSchema,
      },
      annotations: WRITE_TOOL,
    },
    async ({ video_url, caption, thumb_offset, location_id, collaborators }, extra?: ProgressExtra) => {
      let step = "container creation";
      let containerId: string | undefined;
      try {
        // share_to_feed: true preserves the legacy feed placement of the deprecated
        // VIDEO media_type — without it, REELS containers default to the Reels tab only.
        const params = buildParams(
          { video_url, media_type: "REELS", share_to_feed: true },
          {
            caption,
            thumb_offset,
            location_id,
            collaborators: collaborators?.length ? JSON.stringify(collaborators) : undefined,
          }
        );
        const { data: container } = await client.ig("POST", `/${client.igUserId}/media`, params);
        if (typeof container.id !== "string") throw new Error("Container creation did not return a valid id");
        containerId = container.id;
        step = "processing";
        await waitForIgContainer(client, containerId, VIDEO_PROCESSING_TIMEOUT, { onProgress: makeProgressNotifier(extra) });
        step = "publishing";
        const { data, rateLimit } = await client.ig("POST", `/${client.igUserId}/media_publish`, {
          creation_id: containerId,
        });
        client.invalidateCache(IG_PROFILE_CACHE_PREFIX);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Publish video", { step, containerId });
      }
    }
  );

  // ─── ig_publish_carousel ─────────────────────────────────────
  server.registerTool(
    "ig_publish_carousel",
    {
      description: "Publish a carousel (album) post with 2-10 images/videos. Each item needs a `url` (JPEG image or MP4 video) and a `type` (IMAGE or VIDEO).",
      inputSchema: {
        items: z.array(z.discriminatedUnion("type", [
          z.object({
            type: z.literal("IMAGE"),
            url: httpsUrl.describe("Public HTTPS URL of the image (JPEG only)"),
            alt_text: altTextSchema.describe("Alt text for accessibility (IMAGE items only, max 1000 chars per Meta's Instagram media spec)"),
          }),
          z.object({
            type: z.literal("VIDEO"),
            url: httpsUrl.describe("Public HTTPS URL of the video"),
          }),
        ])).min(2).max(10).describe("Array of media items"),
        caption: captionSchema.describe("Post caption (max 2200 chars)"),
        location_id: z.string().optional().describe("Facebook Page location ID"),
        collaborators: collaboratorsSchema,
      },
      annotations: WRITE_TOOL,
    },
    async ({ items, caption, location_id, collaborators }, extra?: ProgressExtra) => {
      // Parallel child polls below would otherwise emit non-monotonic
      // `progress` values across the shared progressToken.
      const onProgress = makeProgressNotifier(extra, "shared");
      let step = "child container creation";
      let containerId: string | undefined;
      // Promise.all rejects with the first child to throw; JS is single-threaded,
      // so the first catch wins the `=== undefined` race here.
      let firstFailingChildStep: string | undefined;
      let firstFailingChildId: string | undefined;
      try {
        // Children are independent — create them in parallel. Errors propagate
        // unwrapped so formatErrorResponse keeps MetaApiError categorization.
        const childIds = await Promise.all(items.map(async (item) => {
          let myStep = "child container creation";
          let myContainerId: string | undefined;
          try {
            const params = buildParams(
              { is_carousel_item: true },
              {
                image_url: item.type === "IMAGE" ? item.url : undefined,
                video_url: item.type === "VIDEO" ? item.url : undefined,
                media_type: item.type === "VIDEO" ? "VIDEO" : undefined,
                alt_text: item.type === "IMAGE" ? item.alt_text : undefined,
              }
            );
            const { data: child } = await client.ig("POST", `/${client.igUserId}/media`, params);
            if (typeof child.id !== "string") throw new Error("Container creation did not return a valid id");
            myContainerId = child.id;
            myStep = "child processing";
            await waitForIgContainer(client, myContainerId, item.type === "VIDEO" ? VIDEO_PROCESSING_TIMEOUT : IMAGE_PROCESSING_TIMEOUT, { onProgress });
            return myContainerId;
          } catch (e) {
            if (firstFailingChildStep === undefined) {
              firstFailingChildStep = myStep;
              firstFailingChildId = myContainerId;
            }
            throw e;
          }
        }));
        step = "parent container creation";
        const carouselParams = buildParams(
          { media_type: "CAROUSEL", children: childIds.join(",") },
          {
            caption,
            location_id,
            collaborators: collaborators?.length ? JSON.stringify(collaborators) : undefined,
          }
        );
        const { data: carousel } = await client.ig("POST", `/${client.igUserId}/media`, carouselParams);
        if (typeof carousel.id !== "string") throw new Error("Container creation did not return a valid id");
        containerId = carousel.id;
        step = "parent processing";
        await waitForIgContainer(client, containerId, IMAGE_PROCESSING_TIMEOUT, { onProgress });
        step = "publishing";
        const { data, rateLimit } = await client.ig("POST", `/${client.igUserId}/media_publish`, {
          creation_id: containerId,
        });
        client.invalidateCache(IG_PROFILE_CACHE_PREFIX);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Publish carousel", {
          step: firstFailingChildStep ?? step,
          containerId: firstFailingChildId ?? containerId,
        });
      } finally {
        // Once Promise.all has rejected and we've returned an error, the still-
        // running sibling polls must not emit any more notifications for this
        // progressToken — MCP forbids progress after request completion.
        onProgress?.stop();
      }
    }
  );

  // ─── ig_publish_reel ─────────────────────────────────────────
  server.registerTool(
    "ig_publish_reel",
    {
      description: "Publish a Reel (short video). Waits for video processing.",
      inputSchema: {
        video_url: httpsUrl.describe("Public HTTPS URL of the video"),
        caption: captionSchema.describe("Reel caption (max 2200 chars)"),
        cover_url: httpsUrl.optional().describe("Custom cover image HTTPS URL"),
        share_to_feed: z.boolean().optional().describe("Also share to feed (default true)"),
        thumb_offset: z.number().optional().describe("Thumbnail offset in ms"),
        collaborators: collaboratorsSchema,
      },
      annotations: WRITE_TOOL,
    },
    async ({ video_url, caption, cover_url, share_to_feed, thumb_offset, collaborators }, extra?: ProgressExtra) => {
      let step = "container creation";
      let containerId: string | undefined;
      try {
        const params = buildParams(
          { video_url, media_type: "REELS" },
          {
            caption,
            cover_url,
            share_to_feed,
            thumb_offset,
            collaborators: collaborators?.length ? JSON.stringify(collaborators) : undefined,
          }
        );
        const { data: container } = await client.ig("POST", `/${client.igUserId}/media`, params);
        if (typeof container.id !== "string") throw new Error("Container creation did not return a valid id");
        containerId = container.id;
        step = "processing";
        await waitForIgContainer(client, containerId, VIDEO_PROCESSING_TIMEOUT, { onProgress: makeProgressNotifier(extra) });
        step = "publishing";
        const { data, rateLimit } = await client.ig("POST", `/${client.igUserId}/media_publish`, {
          creation_id: containerId,
        });
        client.invalidateCache(IG_PROFILE_CACHE_PREFIX);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Publish reel", { step, containerId });
      }
    }
  );

  // ─── ig_publish_story ────────────────────────────────────────
  server.registerTool(
    "ig_publish_story",
    {
      description: "Publish a Story (image or video). Stories disappear after 24 hours.",
      inputSchema: {
        media_type: z.enum(["IMAGE", "VIDEO"]).describe("Story media type"),
        media_url: httpsUrl.describe("Public HTTPS URL of the media"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ media_type, media_url }, extra?: ProgressExtra) => {
      let step = "container creation";
      let containerId: string | undefined;
      try {
        const params = buildParams(
          { media_type: "STORIES" },
          {
            image_url: media_type === "IMAGE" ? media_url : undefined,
            video_url: media_type === "VIDEO" ? media_url : undefined,
          }
        );
        const { data: container } = await client.ig("POST", `/${client.igUserId}/media`, params);
        if (typeof container.id !== "string") throw new Error("Container creation did not return a valid id");
        containerId = container.id;
        step = "processing";
        await waitForIgContainer(client, containerId, media_type === "VIDEO" ? VIDEO_PROCESSING_TIMEOUT : IMAGE_PROCESSING_TIMEOUT, { onProgress: makeProgressNotifier(extra) });
        step = "publishing";
        const { data, rateLimit } = await client.ig("POST", `/${client.igUserId}/media_publish`, {
          creation_id: containerId,
        });
        client.invalidateCache(IG_PROFILE_CACHE_PREFIX);
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Publish story", { step, containerId });
      }
    }
  );

  // ─── ig_get_container_status ─────────────────────────────────
  server.registerTool(
    "ig_get_container_status",
    {
      description: "Check the processing status of a media container (useful for videos).",
      inputSchema: {
        container_id: metaId.describe("Container ID to check"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ container_id }) => {
      try {
        const { data, rateLimit } = await client.ig("GET", `/${container_id}`, {
          fields: "id,status,status_code",
        });
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get container status");
      }
    }
  );

  // ─── ig_get_content_publishing_limit ─────────────────────────
  server.registerTool(
    "ig_get_content_publishing_limit",
    {
      description:
        "Check remaining Instagram content publishing quota and rate limit duration for the account. " +
        "Meta limits accounts to 100 published posts per 24-hour rolling window. Read-only.",
      inputSchema: {
        since: z.number().optional().describe("Unix timestamp for start of rate limit period"),
        until: z.number().optional().describe("Unix timestamp for end of rate limit period"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ since, until }) => {
      try {
        const params = buildParams(
          {
            fields: "config,quota_usage",
          },
          { since, until }
        );
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${client.igUserId}/content_publishing_limit`,
          params
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get content publishing limit");
      }
    }
  );

  // ─── ig_create_resumable_upload_session ─────────────────────
  server.registerTool(
    "ig_create_resumable_upload_session",
    {
      description:
        "Create a resumable upload session container for Reels or Stories via upload_type=resumable. " +
        "Returns the created container ID and the resumable upload URI (rupload.facebook.com) for binary chunk streaming. Write.",
      inputSchema: {
        media_type: z.enum(["REELS", "STORIES"]).optional().default("REELS").describe("Media type (default: REELS)"),
        caption: captionSchema.describe("Post caption (max 2200 chars)"),
        cover_url: httpsUrl.optional().describe("Cover image URL"),
        thumb_offset: z.number().optional().describe("Thumbnail offset in ms"),
        location_id: z.string().optional().describe("Facebook Page location ID"),
        share_to_feed: z.boolean().optional().describe("Share Reel to main feed (default: true)"),
        collaborators: collaboratorsSchema,
        audio_name: z.string().optional().describe("Custom audio name for Reel"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ media_type, caption, cover_url, thumb_offset, location_id, share_to_feed, collaborators, audio_name }) => {
      try {
        const params = buildParams(
          {
            upload_type: "resumable",
            media_type,
          },
          {
            caption,
            cover_url,
            thumb_offset,
            location_id,
            share_to_feed,
            collaborators: collaborators?.length ? JSON.stringify(collaborators) : undefined,
            audio_name,
          }
        );
        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/media`,
          params
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Create resumable upload session");
      }
    }
  );

  // ─── ig_upload_resumable_binary ──────────────────────────────
  server.registerTool(
    "ig_upload_resumable_binary",
    {
      description:
        "Transfer raw video binary data to rupload.facebook.com upload URI for an existing resumable session. " +
        "Accepts a public HTTPS video_url to stream from or base64-encoded video_data. Write.",
      inputSchema: {
        upload_uri: z.string().url().describe("The rupload.facebook.com URI returned from session creation"),
        video_url: httpsUrl.optional().describe("Public HTTPS URL of the video file to download and stream to Meta"),
        video_base64: z.string().optional().describe("Base64-encoded raw video binary bytes"),
        offset: z.number().optional().default(0).describe("Byte offset to start upload (default: 0)"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ upload_uri, video_url, video_base64, offset }) => {
      try {
        if (!video_url && !video_base64) {
          return formatErrorResponse(new Error("Either video_url or video_base64 must be provided"), "Upload resumable binary");
        }

        let buffer: Uint8Array;
        if (video_url) {
          const res = await fetch(video_url);
          if (!res.ok) throw new Error(`Failed to fetch source video from ${video_url}: HTTP ${res.status}`);
          buffer = new Uint8Array(await res.arrayBuffer());
        } else {
          const binaryStr = atob(video_base64!);
          buffer = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            buffer[i] = binaryStr.charCodeAt(i);
          }
        }

        const uploadRes = await fetch(upload_uri, {
          method: "POST",
          headers: {
            Authorization: `OAuth ${client.igAccessToken}`,
            offset: String(offset),
            file_size: String(buffer.byteLength),
            "Content-Type": "application/octet-stream",
            "X-Entity-Length": String(buffer.byteLength),
          },
          body: buffer as unknown as BodyInit,
        });

        const resText = await uploadRes.text();
        let parsedData: unknown;
        try {
          parsedData = JSON.parse(resText);
        } catch {
          parsedData = { status: uploadRes.status, body: resText };
        }

        if (!uploadRes.ok) {
          throw new Error(`rupload failed (HTTP ${uploadRes.status}): ${resText}`);
        }

        return formatResponse({
          success: true,
          http_status: uploadRes.status,
          bytes_uploaded: buffer.byteLength,
          rupload_response: parsedData,
        });
      } catch (error) {
        return formatErrorResponse(error, "Upload resumable binary");
      }
    }
  );

  // ─── ig_publish_resumable_video ──────────────────────────────
  server.registerTool(
    "ig_publish_resumable_video",
    {
      description:
        "Complete end-to-end resumable video publishing for Reels or Stories: creates session, streams binary to rupload.facebook.com, polls status until FINISHED, and publishes. Write.",
      inputSchema: {
        video_url: httpsUrl.optional().describe("Public HTTPS URL of the video to publish"),
        video_base64: z.string().optional().describe("Base64 encoded video binary data"),
        media_type: z.enum(["REELS", "STORIES"]).optional().default("REELS").describe("Media type (default: REELS)"),
        caption: captionSchema.describe("Post caption (max 2200 chars)"),
        cover_url: httpsUrl.optional().describe("Cover image URL"),
        thumb_offset: z.number().optional().describe("Thumbnail offset in ms"),
        location_id: z.string().optional().describe("Facebook Page location ID"),
        share_to_feed: z.boolean().optional().describe("Share Reel to main feed (default: true)"),
        collaborators: collaboratorsSchema,
        audio_name: z.string().optional().describe("Custom audio name for Reel"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ video_url, video_base64, media_type, caption, cover_url, thumb_offset, location_id, share_to_feed, collaborators, audio_name }, extra?: ProgressExtra) => {
      let step = "session creation";
      let containerId: string | undefined;

      try {
        if (!video_url && !video_base64) {
          return formatErrorResponse(new Error("Either video_url or video_base64 must be provided"), "Publish resumable video");
        }

        // Step 1: Create resumable session
        const sessionParams = buildParams(
          {
            upload_type: "resumable",
            media_type,
          },
          {
            caption,
            cover_url,
            thumb_offset,
            location_id,
            share_to_feed,
            collaborators: collaborators?.length ? JSON.stringify(collaborators) : undefined,
            audio_name,
          }
        );

        const sessionRes = await client.ig("POST", `/${client.igUserId}/media`, sessionParams);
        const sessionData = sessionRes.data as { id: string; uri: string };
        containerId = sessionData.id;
        const uploadUri = sessionData.uri;

        // Step 2: Upload binary to rupload.facebook.com
        step = "binary transfer";
        let buffer: Uint8Array;
        if (video_url) {
          const res = await fetch(video_url);
          if (!res.ok) throw new Error(`Failed to download source video: HTTP ${res.status}`);
          buffer = new Uint8Array(await res.arrayBuffer());
        } else {
          const binaryStr = atob(video_base64!);
          buffer = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) {
            buffer[i] = binaryStr.charCodeAt(i);
          }
        }

        const uploadRes = await fetch(uploadUri, {
          method: "POST",
          headers: {
            Authorization: `OAuth ${client.igAccessToken}`,
            offset: "0",
            file_size: String(buffer.byteLength),
            "Content-Type": "application/octet-stream",
            "X-Entity-Length": String(buffer.byteLength),
          },
          body: buffer as unknown as BodyInit,
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          throw new Error(`rupload transfer failed (HTTP ${uploadRes.status}): ${errText}`);
        }

        // Step 3: Wait for container processing
        step = "processing";
        await waitForIgContainer(client, containerId, VIDEO_PROCESSING_TIMEOUT, { onProgress: makeProgressNotifier(extra) });

        // Step 4: Publish container
        step = "publishing";
        const publishRes = await client.ig("POST", `/${client.igUserId}/media_publish`, {
          creation_id: containerId,
        });

        client.invalidateCache(IG_PROFILE_CACHE_PREFIX);
        return formatResponse(
          {
            ...publishRes.data,
            container_id: containerId,
            status: "published",
          },
          publishRes.rateLimit
        );
      } catch (error) {
        return formatErrorResponse(error, "Publish resumable video", {
          containerId,
          step,
        });
      }
    }
  );
}
