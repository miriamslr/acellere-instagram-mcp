import { afterEach, describe, expect, it, vi } from "vitest";
import type { MetaConfig } from "../config.js";
import { AcellereMetaClient, assertAcellereWriteAllowed } from "./acellere-meta-client.js";

function makeConfig(overrides?: Partial<MetaConfig>): MetaConfig {
  return {
    appId: "",
    appSecret: "",
    facebookPageId: "",
    instagramAccessToken: "test-token",
    instagramUserId: "123456",
    threadsAccessToken: "",
    threadsUserId: "",
    ...overrides,
  };
}

function mockSuccessfulFetch(): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () =>
    new Response(JSON.stringify({ id: "123456" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })
  );
  vi.stubGlobal("fetch", fn);
  return fn;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Acellere write safety gate", () => {
  it("always allows GET requests", () => {
    expect(() =>
      assertAcellereWriteAllowed("GET", {
        writeMode: "read-only",
        allowDestructive: false,
      })
    ).not.toThrow();
  });

  it("blocks POST while running in read-only mode", () => {
    expect(() =>
      assertAcellereWriteAllowed("POST", {
        writeMode: "read-only",
        allowDestructive: false,
      })
    ).toThrow(/read-only mode/);
  });

  it("allows non-destructive POST after writes are explicitly enabled", () => {
    expect(() =>
      assertAcellereWriteAllowed("POST", {
        writeMode: "write",
        allowDestructive: false,
      })
    ).not.toThrow();
  });

  it("keeps DELETE blocked when writes are enabled but destructive actions are not", () => {
    expect(() =>
      assertAcellereWriteAllowed("DELETE", {
        writeMode: "write",
        allowDestructive: false,
      })
    ).toThrow(/destructive actions are disabled/);
  });

  it("allows DELETE only after both safety switches are explicitly enabled", () => {
    expect(() =>
      assertAcellereWriteAllowed("DELETE", {
        writeMode: "write",
        allowDestructive: true,
      })
    ).not.toThrow();
  });
});

describe("Instagram API mode routing", () => {
  it("keeps graph.instagram.com for instagram-login", async () => {
    const fetchMock = mockSuccessfulFetch();
    const client = new AcellereMetaClient(makeConfig(), {
      instagramApiMode: "instagram-login",
      writeMode: "read-only",
      maxRetries: 0,
    });

    await client.ig("GET", "/123456");

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/graph\.instagram\.com\/v25\.0\/123456\?/
    );
  });

  it("uses graph.facebook.com for facebook-login", async () => {
    const fetchMock = mockSuccessfulFetch();
    const client = new AcellereMetaClient(makeConfig(), {
      instagramApiMode: "facebook-login",
      writeMode: "read-only",
      maxRetries: 0,
    });

    await client.ig("GET", "/123456");

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/graph\.facebook\.com\/v25\.0\/123456\?/
    );
  });

  it("executes Facebook token exchange in facebook-login mode", async () => {
    const fetchMock = mockSuccessfulFetch();
    const client = new AcellereMetaClient(
      makeConfig({
        appId: "app_123",
        appSecret: "sec_456",
      }),
      {
        instagramApiMode: "facebook-login",
        writeMode: "read-only",
        maxRetries: 0,
      }
    );

    await client.igExchangeToken("short-token");

    expect(String(fetchMock.mock.calls[0]?.[0])).toMatch(
      /^https:\/\/graph\.facebook\.com\/v25\.0\/oauth\/access_token\?/
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain("grant_type=fb_exchange_token");

    await expect(client.igRefreshToken("long-token")).rejects.toThrow(
      /only available with INSTAGRAM_API_MODE=instagram-login/
    );
  });

  it("rejects an invalid INSTAGRAM_API_MODE", () => {
    const previous = process.env.INSTAGRAM_API_MODE;
    process.env.INSTAGRAM_API_MODE = "invalid";
    try {
      expect(() =>
        new AcellereMetaClient(makeConfig(), {
          writeMode: "read-only",
          maxRetries: 0,
        })
      ).toThrow(/INSTAGRAM_API_MODE must be/);
    } finally {
      if (previous === undefined) delete process.env.INSTAGRAM_API_MODE;
      else process.env.INSTAGRAM_API_MODE = previous;
    }
  });
});

describe("Instagram conversations target ID routing", () => {
  it("uses FACEBOOK_PAGE_ID for facebook-login mode", () => {
    const client = new AcellereMetaClient(
      makeConfig({
        facebookPageId: "1266932313170442",
        instagramUserId: "17841421598761181",
      }),
      {
        instagramApiMode: "facebook-login",
        writeMode: "read-only",
      }
    );

    expect(client.igConversationsTargetId).toBe("1266932313170442");
  });

  it("throws clear configuration error when FACEBOOK_PAGE_ID is missing in facebook-login mode", () => {
    const client = new AcellereMetaClient(
      makeConfig({
        facebookPageId: "",
        instagramUserId: "17841421598761181",
      }),
      {
        instagramApiMode: "facebook-login",
        writeMode: "read-only",
      }
    );

    expect(() => client.igConversationsTargetId).toThrow(
      /FACEBOOK_PAGE_ID is not configured.*INSTAGRAM_API_MODE=facebook-login/
    );
  });

  it("uses INSTAGRAM_USER_ID for instagram-login mode", () => {
    const client = new AcellereMetaClient(
      makeConfig({
        facebookPageId: "1266932313170442",
        instagramUserId: "17841421598761181",
      }),
      {
        instagramApiMode: "instagram-login",
        writeMode: "read-only",
      }
    );

    expect(client.igConversationsTargetId).toBe("17841421598761181");
  });
});
