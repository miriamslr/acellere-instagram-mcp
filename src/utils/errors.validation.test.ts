import { describe, expect, it } from "vitest";
import { MetaApiError, formatErrorResponse } from "./errors.js";

function errorType(error: MetaApiError): string {
  const result = formatErrorResponse(error, "Test");
  return (JSON.parse(result.content[0].text) as { error_type: string }).error_type;
}

describe("Meta API OAuthException classification precedence", () => {
  it("classifies OAuthException code 100 as validation, not auth", () => {
    const error = new MetaApiError({
      message: "(#100) Tried accessing nonexisting field (media_count)",
      httpStatus: 400,
      apiCode: 100,
      apiType: "OAuthException",
      endpoint: "/hashtag-id",
      method: "GET",
    });

    expect(errorType(error)).toBe("validation");
  });

  it("keeps OAuthException code 190 classified as auth", () => {
    const error = new MetaApiError({
      message: "Invalid OAuth access token",
      httpStatus: 400,
      apiCode: 190,
      apiType: "OAuthException",
      endpoint: "/me",
      method: "GET",
    });

    expect(errorType(error)).toBe("auth");
  });

  it("keeps OAuthException rate-limit code 4 classified as rate_limit", () => {
    const error = new MetaApiError({
      message: "Application request limit reached",
      httpStatus: 400,
      apiCode: 4,
      apiType: "OAuthException",
      endpoint: "/me",
      method: "GET",
    });

    expect(errorType(error)).toBe("rate_limit");
  });
});
