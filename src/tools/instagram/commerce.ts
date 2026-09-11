import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { MetaClient } from "../../services/meta-client.js";
import { metaId } from "../../schemas.js";
import { formatErrorResponse } from "../../utils/errors.js";
import { formatResponse } from "../../utils/response.js";
import { buildParams } from "../../utils/params.js";
import { READ_ONLY_TOOL, WRITE_IDEMPOTENT_TOOL, WRITE_TOOL, DESTRUCTIVE_TOOL } from "../annotations.js";

export function registerIgCommerceTools(server: McpServer, client: MetaClient): void {
  // ─── ig_get_available_catalogs ───────────────────────────────
  server.registerTool(
    "ig_get_available_catalogs",
    {
      description:
        "Get list of product catalogs available and linked to the Instagram Business account for product tagging. Read-only.",
      inputSchema: {
        limit: z.number().optional().describe("Number of catalogs (default: 25)"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ limit }) => {
      try {
        client.requireInstagramCapability("commerce.catalogs");
        const params = buildParams({}, { limit });
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${client.igUserId}/available_catalogs`,
          params
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get available catalogs");
      }
    }
  );

  // ─── ig_get_catalog_products ─────────────────────────────────
  server.registerTool(
    "ig_get_catalog_products",
    {
      description:
        "Get products in an e-commerce catalog for Instagram shopping & product tagging. Read-only.",
      inputSchema: {
        catalog_id: metaId.describe("Product Catalog ID"),
        limit: z.number().optional().describe("Number of products"),
        after: z.string().optional().describe("Pagination cursor for next page"),
        before: z.string().optional().describe("Pagination cursor for previous page"),
        fields: z
          .string()
          .optional()
          .default("id,name,description,availability,price,currency,image_url,url,retailer_id")
          .describe("Comma-separated fields to retrieve"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ catalog_id, limit, after, before, fields }) => {
      try {
        client.requireInstagramCapability("commerce.catalogs");
        const params = buildParams({ fields }, { limit, after, before });
        const { data, rateLimit } = await client.meta(
          "GET",
          `/${catalog_id}/products`,
          params
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get catalog products");
      }
    }
  );

  // ─── ig_get_product_tags ─────────────────────────────────────
  server.registerTool(
    "ig_get_product_tags",
    {
      description: "Get product tags applied on an Instagram media post. Read-only.",
      inputSchema: {
        media_id: metaId.describe("Instagram Media ID"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ media_id }) => {
      try {
        client.requireInstagramCapability("commerce.productTags");
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${media_id}/product_tags`
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get product tags");
      }
    }
  );

  // ─── ig_create_product_tags ──────────────────────────────────
  server.registerTool(
    "ig_create_product_tags",
    {
      description:
        "Add or update product shopping tags on an Instagram media post. Requires Facebook Login and approved commerce catalog. Idempotent.",
      inputSchema: {
        media_id: metaId.describe("Instagram Media ID"),
        updated_tags: z
          .array(
            z.object({
              product_id: z.string().describe("Catalog Product ID"),
              x: z.number().min(0).max(1).optional().describe("X coordinate percentage (0.0 to 1.0)"),
              y: z.number().min(0).max(1).optional().describe("Y coordinate percentage (0.0 to 1.0)"),
            })
          )
          .min(1)
          .describe("Array of product tags with coordinates"),
      },
      annotations: WRITE_IDEMPOTENT_TOOL,
    },
    async ({ media_id, updated_tags }) => {
      try {
        client.requireInstagramCapability("commerce.productTags");
        const { data, rateLimit } = await client.ig(
          "POST",
          `/${media_id}/product_tags`,
          undefined,
          {
            jsonBody: {
              updated_tags,
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Create product tags");
      }
    }
  );

  // ─── ig_delete_product_tags ──────────────────────────────────
  server.registerTool(
    "ig_delete_product_tags",
    {
      description: "Delete product tags from an Instagram media post. Destructive.",
      inputSchema: {
        media_id: metaId.describe("Instagram Media ID"),
        deleted_tags: z
          .array(
            z.object({
              product_id: z.string().describe("Catalog Product ID to remove"),
            })
          )
          .min(1)
          .describe("Array of product tags to remove"),
      },
      annotations: DESTRUCTIVE_TOOL,
    },
    async ({ media_id, deleted_tags }) => {
      try {
        client.requireInstagramCapability("commerce.productTags");
        const { data, rateLimit } = await client.ig(
          "DELETE",
          `/${media_id}/product_tags`,
          undefined,
          {
            jsonBody: {
              deleted_tags,
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Delete product tags");
      }
    }
  );

  // ─── ig_get_product_appeal ───────────────────────────────────
  server.registerTool(
    "ig_get_product_appeal",
    {
      description:
        "Check commerce product appeal status for rejected products in Instagram Shop. Read-only.",
      inputSchema: {
        product_id: metaId.describe("Catalog Product ID"),
      },
      annotations: READ_ONLY_TOOL,
    },
    async ({ product_id }) => {
      try {
        client.requireInstagramCapability("commerce.productAppeal");
        const { data, rateLimit } = await client.ig(
          "GET",
          `/${client.igUserId}/product_appeal`,
          { product_id }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Get product appeal");
      }
    }
  );

  // ─── ig_submit_product_appeal ────────────────────────────────
  server.registerTool(
    "ig_submit_product_appeal",
    {
      description:
        "Submit a review appeal for a product rejected for Instagram Shopping. Write.",
      inputSchema: {
        product_id: metaId.describe("Catalog Product ID to appeal"),
        appeal_reason: z
          .string()
          .min(10)
          .max(1000)
          .describe("Explanation for why the product meets Instagram Commerce policies"),
      },
      annotations: WRITE_TOOL,
    },
    async ({ product_id, appeal_reason }) => {
      try {
        client.requireInstagramCapability("commerce.productAppeal");
        const { data, rateLimit } = await client.ig(
          "POST",
          `/${client.igUserId}/product_appeal`,
          undefined,
          {
            jsonBody: {
              product_id,
              appeal_reason,
            },
          }
        );
        return formatResponse(data, rateLimit);
      } catch (error) {
        return formatErrorResponse(error, "Submit product appeal");
      }
    }
  );
}
