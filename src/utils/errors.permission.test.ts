import { describe, expect, it } from "vitest";
import { MetaApiError, formatErrorResponse } from "./errors.js";

function parse(result: { content: { text: string }[] }) {
  return JSON.parse(result.content[0].text) as {
    error_type: string;
    remediation?: string;
    code?: number;
  };
}

describe("Meta permission error classification", () => {
  it("classifies Meta code 10 as permission, not auth", () => {
    const error = new MetaApiError({
      message: "Meta API GET /17841421598761181/tags (400): (#10) Application does not have permission for this action",
      httpStatus: 400,
      apiCode: 10,
      apiType: "OAuthException",
      endpoint: "/17841421598761181/tags",
      method: "GET",
    });

    const payload = parse(formatErrorResponse(error, "Get tagged media"));

    expect(payload.error_type).toBe("permission");
    expect(payload.code).toBe(10);
    expect(payload.remediation).toContain("permissions");
    expect(payload.remediation).toContain("App Review");
    expect(payload.remediation).not.toContain("meta_exchange_token");
  });

  it("classifies an explicit 403 permission message as permission", () => {
    const error = new MetaApiError({
      message: "Application does not have permission for this action",
      httpStatus: 403,
      endpoint: "/resource",
      method: "GET",
    });

    expect(parse(formatErrorResponse(error, "Read resource")).error_type).toBe("permission");
  });

  it("keeps expired/invalid token code 190 classified as auth", () => {
    const error = new MetaApiError({
      message: "Invalid OAuth access token",
      httpStatus: 401,
      apiCode: 190,
      apiType: "OAuthException",
      endpoint: "/me",
      method: "GET",
    });

    const payload = parse(formatErrorResponse(error, "Get profile"));
    expect(payload.error_type).toBe("auth");
    expect(payload.remediation).toContain("meta_exchange_token");
  });

  it("keeps code 100 classified as validation", () => {
    const error = new MetaApiError({
      message: "Invalid parameter",
      httpStatus: 400,
      apiCode: 100,
      apiType: "OAuthException",
      endpoint: "/resource",
      method: "GET",
    });

    expect(parse(formatErrorResponse(error, "Read resource")).error_type).toBe("validation");
  });
});
