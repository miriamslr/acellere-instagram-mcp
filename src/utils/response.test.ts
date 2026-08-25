import { describe, it, expect } from "vitest";
import { formatResponse } from "./response.js";

interface ParsedPayload {
  [key: string]: unknown;
  _rateLimit?: { callCount?: number; totalCpuTime?: number; totalTime?: number };
}

function parsePayload(result: { content: { type: string; text: string }[] }): ParsedPayload {
  return JSON.parse(result.content[0].text) as ParsedPayload;
}

describe("formatResponse", () => {
  it("matches the legacy inline JSON.stringify shape byte-for-byte for non-sensitive data", () => {
    const data = { id: "17841405822304914", name: "test" };
    const rateLimit = { callCount: 5, totalCpuTime: 1, totalTime: 2 };
    const legacy = {
      content: [{ type: "text", text: JSON.stringify({ ...data, _rateLimit: rateLimit }, null, 2) }],
    };

    const result = formatResponse(data, rateLimit);

    expect(result).toEqual(legacy);
    expect(result.content[0].text).toBe(legacy.content[0].text);
  });

  it("omits _rateLimit when rateLimit is undefined", () => {
    const data = { id: "abc", text: "hello" };

    const result = formatResponse(data);
    const payload = parsePayload(result);

    expect(payload).toEqual({ id: "abc", text: "hello" });
    expect(Object.prototype.hasOwnProperty.call(payload, "_rateLimit")).toBe(false);
  });

  it("preserves prefixed synthetic fields before spreading data", () => {
    const data = { id: "reply-1", text: "ok" };
    const rateLimit = { callCount: 1 };

    const result = formatResponse({ success: true, hidden: true, ...data }, rateLimit);
    const payload = parsePayload(result);

    expect(payload.success).toBe(true);
    expect(payload.hidden).toBe(true);
    expect(payload.id).toBe("reply-1");
    expect(payload.text).toBe("ok");
    expect(payload._rateLimit).toEqual({ callCount: 1 });

    const keys = Object.keys(payload);
    expect(keys).toEqual(["success", "hidden", "id", "text", "_rateLimit"]);
  });

  it("lets data fields override earlier prefix fields", () => {
    const data = { success: false, id: "x" };

    const result = formatResponse({ success: true, ...data });
    const payload = parsePayload(result);

    expect(payload.success).toBe(false);
    expect(payload.id).toBe("x");
  });

  it("handles empty data with only _rateLimit", () => {
    const result = formatResponse({}, { callCount: 99 });
    const payload = parsePayload(result);

    expect(payload).toEqual({ _rateLimit: { callCount: 99 } });
  });

  it("handles empty data without rateLimit", () => {
    const result = formatResponse({});
    const payload = parsePayload(result);

    expect(payload).toEqual({});
  });

  it("pretty-prints with 2-space indent", () => {
    const result = formatResponse({ a: 1 }, { callCount: 0 });
    expect(result.content[0].text).toBe("{\n  \"a\": 1,\n  \"_rateLimit\": {\n    \"callCount\": 0\n  }\n}");
  });

  it("does not set isError on the result", () => {
    const result = formatResponse({ id: "x" });
    expect(result.isError).toBeUndefined();
  });

  it("removes secret query parameters recursively from Meta paging URLs", () => {
    const result = formatResponse({
      data: [{ id: "1" }],
      paging: {
        cursors: { before: "BEFORE", after: "AFTER" },
        next: "https://graph.facebook.com/v26.0/178/media?access_token=VERY_SECRET&fields=id%2Ccaption&limit=5&after=AFTER",
        previous: "https://graph.facebook.com/v26.0/178/media?fields=id&appsecret_proof=PROOF&client_secret=CLIENT_SECRET&before=BEFORE",
      },
    });

    const text = result.content[0].text;
    const payload = parsePayload(result) as {
      paging: { cursors: { before: string; after: string }; next: string; previous: string };
    };

    expect(text).not.toContain("VERY_SECRET");
    expect(text).not.toContain("PROOF");
    expect(text).not.toContain("CLIENT_SECRET");
    expect(text).not.toMatch(/access_token=/i);
    expect(text).not.toMatch(/appsecret_proof=/i);
    expect(text).not.toMatch(/client_secret=/i);
    expect(payload.paging.cursors).toEqual({ before: "BEFORE", after: "AFTER" });
    expect(payload.paging.next).toContain("after=AFTER");
    expect(payload.paging.previous).toContain("before=BEFORE");
  });

  it("drops unexpected sensitive fields recursively by default", () => {
    const result = formatResponse({
      access_token: "TOP_SECRET",
      nested: {
        appsecret_proof: "PROOF",
        client_secret: "CLIENT",
        app_secret: "APP_SECRET",
        safe: "kept",
      },
    });

    const payload = parsePayload(result) as { nested: Record<string, unknown> };
    const text = result.content[0].text;

    expect(text).not.toContain("TOP_SECRET");
    expect(text).not.toContain("PROOF");
    expect(text).not.toContain("CLIENT");
    expect(text).not.toContain("APP_SECRET");
    expect(payload).not.toHaveProperty("access_token");
    expect(payload.nested).toEqual({ safe: "kept" });
  });

  it("allows explicit token fields only for token-management tools while still sanitizing URLs", () => {
    const result = formatResponse(
      {
        access_token: "NEW_LONG_LIVED_TOKEN",
        expires_in: 5184000,
        paging: {
          next: "https://graph.facebook.com/v26.0/me?access_token=SHOULD_NOT_LEAK&after=NEXT",
        },
      },
      undefined,
      { allowSensitiveFields: true }
    );

    const payload = parsePayload(result) as {
      access_token: string;
      expires_in: number;
      paging: { next: string };
    };

    expect(payload.access_token).toBe("NEW_LONG_LIVED_TOKEN");
    expect(payload.expires_in).toBe(5184000);
    expect(payload.paging.next).toContain("after=NEXT");
    expect(payload.paging.next).not.toMatch(/access_token=/i);
    expect(payload.paging.next).not.toContain("SHOULD_NOT_LEAK");
  });

  it("removes secrets from malformed URL-like strings without leaving the parameter name", () => {
    const result = formatResponse({
      next: "not a valid absolute url?access_token=SECRET&after=CURSOR",
    });

    const payload = parsePayload(result) as { next: string };

    expect(payload.next).toBe("not a valid absolute url?after=CURSOR");
    expect(payload.next).not.toMatch(/access_token=/i);
    expect(payload.next).not.toContain("SECRET");
  });
});
