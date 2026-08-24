import { afterEach, describe, expect, it, vi } from "vitest";
import type { MetaConfig } from "../config.js";
import { AcellereMetaClient, assertAcellereWriteAllowed } from "./acellere-meta-client.js";

function makeConfig(): MetaConfig {
  return {
    appId: "",
    appSecret: "",
    instagramAccessToken: "test-token",
    instagramUserId: "123456",
    threadsAccessToken: "",
    threadsUserId: "",
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

  it("blocks Instagram-Login token helpers in facebook-login mode", async () => {
    const client = new AcellereMetaClient(makeConfig(), {
      instagramApiMode: "facebook-login",
      writeMode: "read-only",
      maxRetries: 0,
    });

    await expect(client.igExchangeToken("short-token")).rejects.toThrow(
      /only available with INSTAGRAM_API_MODE=instagram-login/
    );
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
