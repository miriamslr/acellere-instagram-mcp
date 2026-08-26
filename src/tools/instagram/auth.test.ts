import { describe, it, expect, vi, beforeEach } from "vitest";
import { z } from "zod";
import { registerIgAuthTools } from "./auth.js";
import { MetaClient } from "../../services/meta-client.js";
import { AcellereMetaClient } from "../../services/acellere-meta-client.js";
import { makeMockCache } from "../test-utils.js";

function makeMockServer() {
  const tools = new Map<string, (args?: Record<string, unknown>) => Promise<unknown>>();
  const schemas = new Map<string, z.ZodRawShape>();
  return {
    tools,
    schemas,
    registerTool: vi.fn(
      (
        name: string,
        config: { inputSchema?: z.ZodRawShape },
        handler: (...args: unknown[]) => unknown
      ) => {
        const schema = config.inputSchema ?? {};
        const parsed = z.object(schema);
        tools.set(name, async (args: Record<string, unknown> = {}) =>
          handler(parsed.parse(args))
        );
        schemas.set(name, schema);
      }
    ),
  };
}

describe("Instagram Auth Tools", () => {
  let server: ReturnType<typeof makeMockServer>;

  beforeEach(() => {
    server = makeMockServer();
  });

  it("ig_get_capabilities returns capabilities summary for current mode", async () => {
    const client = new AcellereMetaClient(
      {
        instagramAccessToken: "test_token",
        instagramUserId: "1784140001",
        appId: "",
        appSecret: "",
        facebookPageId: "",
        threadsAccessToken: "",
        threadsUserId: "",
      },
      { instagramApiMode: "facebook-login" }
    );

    registerIgAuthTools(server as never, client);

    const handler = server.tools.get("ig_get_capabilities");
    expect(handler).toBeDefined();

    const result = (await handler!({})) as { content: { type: string; text: string }[] };
    const payload = JSON.parse(result.content[0].text);

    expect(payload.login_mode).toBe("facebook-login");
    expect(payload.official_surface.available_count).toBeGreaterThan(30);
    expect(payload.acellere_extensions.total).toBe(6);
  });

  it("ig_get_connection_info returns sanitized connection details without token values", async () => {
    const client = new AcellereMetaClient(
      {
        instagramAccessToken: "secret_raw_token_xyz",
        instagramUserId: "1784140001",
        appId: "",
        appSecret: "",
        facebookPageId: "",
        threadsAccessToken: "",
        threadsUserId: "",
      },
      { instagramApiMode: "facebook-login" }
    );

    registerIgAuthTools(server as never, client);

    const handler = server.tools.get("ig_get_connection_info");
    const result = (await handler!({})) as { content: { type: string; text: string }[] };
    const text = result.content[0].text;

    expect(text).not.toContain("secret_raw_token_xyz");
    const payload = JSON.parse(text);
    expect(payload.login_mode).toBe("facebook-login");
    expect(payload.instagram_user_id).toBe("1784140001");
  });

  it("ig_bootstrap_discovery discovers connected Pages in Facebook Login mode", async () => {
    const mockClient = {
      igUserId: "1784140001",
      getInstagramApiMode: () => "facebook-login",
      meta: vi.fn(async () => ({
        data: {
          data: [
            {
              id: "page_123",
              name: "Acellere Official",
              instagram_business_account: {
                id: "ig_456",
                username: "acellere.ai",
              },
            },
          ],
        },
      })),
      ...makeMockCache(),
    } as unknown as MetaClient;

    registerIgAuthTools(server as never, mockClient);

    const handler = server.tools.get("ig_bootstrap_discovery");
    const result = (await handler!({})) as { content: { type: string; text: string }[] };
    const payload = JSON.parse(result.content[0].text);

    expect(payload.mode).toBe("facebook-login");
    expect(payload.pages_discovered).toHaveLength(1);
    expect(payload.pages_discovered[0].name).toBe("Acellere Official");
  });
});
