import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerIgOembedTools } from "./oembed.js";
import { MetaClient } from "../../services/meta-client.js";
import { makeMockServer, type MockServer } from "../test-utils.js";

function makeMockClient(overrides?: Partial<MetaClient>): MetaClient {
  return {
    meta: vi.fn(async () => ({
      data: {
        html: "<blockquote class='instagram-media'>...</blockquote>",
        author_name: "acellere",
        width: 658,
      },
      rateLimit: undefined,
    })),
    ...overrides,
  } as unknown as MetaClient;
}

describe("Instagram oEmbed Tools", () => {
  let server: MockServer;
  let client: MetaClient;

  beforeEach(() => {
    server = makeMockServer();
    client = makeMockClient();
    registerIgOembedTools(server as never, client);
  });

  it("ig_get_oembed calls /instagram_oembed with post URL", async () => {
    const result = (await server.callTool("ig_get_oembed", {
      url: "https://www.instagram.com/p/DFxyz123/",
      maxwidth: 500,
    })) as { content: { text: string }[] };

    const payload = JSON.parse(result.content[0].text);
    expect(payload.author_name).toBe("acellere");

    const call = (client.meta as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toBe("GET");
    expect(call[1]).toBe("/instagram_oembed");
    expect(call[2].url).toBe("https://www.instagram.com/p/DFxyz123/");
    expect(call[2].maxwidth).toBe(500);
  });
});
