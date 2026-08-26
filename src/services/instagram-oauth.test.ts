import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildFacebookAuthorizationUrl,
  buildInstagramAuthorizationUrl,
  discoverFacebookInstagramAccounts,
  exchangeFacebookAuthorizationCode,
  exchangeInstagramAuthorizationCode,
  exchangeInstagramLongLivedToken,
  fetchInstagramIdentity,
  type InstagramOAuthEnv,
} from "./instagram-oauth.js";

const env: InstagramOAuthEnv = {
  META_APP_ID: "1234567890",
  META_APP_SECRET: "meta-app-secret-for-tests",
  META_API_VERSION: "v26.0",
  INSTAGRAM_OAUTH_REDIRECT_URI: "https://worker.example.com/auth/instagram/callback",
  FACEBOOK_OAUTH_REDIRECT_URI: "https://worker.example.com/auth/facebook/callback",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Instagram/Facebook OAuth helpers", () => {
  it("builds Instagram Business Login URL with state, professional scopes and forced re-auth", () => {
    const authorizationUrl = new URL(buildInstagramAuthorizationUrl(env, "state_abc"));
    expect(authorizationUrl.origin).toBe("https://www.instagram.com");
    expect(authorizationUrl.pathname).toBe("/oauth/authorize");
    expect(authorizationUrl.searchParams.get("state")).toBe("state_abc");
    expect(authorizationUrl.searchParams.get("response_type")).toBe("code");
    expect(authorizationUrl.searchParams.get("enable_fb_login")).toBe("0");
    expect(authorizationUrl.searchParams.get("force_reauth")).toBe("true");
    expect(authorizationUrl.searchParams.get("scope")).toContain("instagram_business_basic");
    expect(authorizationUrl.searchParams.get("scope")).toContain("instagram_business_content_publish");
  });

  it("builds Facebook Login for Business URL against the configured Graph version", () => {
    const authorizationUrl = new URL(buildFacebookAuthorizationUrl(env, "state_fb"));
    expect(authorizationUrl.origin).toBe("https://www.facebook.com");
    expect(authorizationUrl.pathname).toBe("/v26.0/dialog/oauth");
    expect(authorizationUrl.searchParams.get("state")).toBe("state_fb");
    expect(authorizationUrl.searchParams.get("scope")).toContain("pages_show_list");
    expect(authorizationUrl.searchParams.get("scope")).toContain("instagram_manage_messages");
  });

  it("exchanges Instagram auth code without placing client_secret in the authorization URL", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "short-ig-token", user_id: 42 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const token = await exchangeInstagramAuthorizationCode(env, "auth-code-1");
    expect(token.accessToken).toBe("short-ig-token");
    const [requestUrl, init] = fetchSpy.mock.calls[0]!;
    expect(String(requestUrl)).toBe("https://api.instagram.com/oauth/access_token");
    expect(init?.method).toBe("POST");
    expect(init?.body).toBeInstanceOf(FormData);
    const form = init?.body as FormData;
    expect(form.get("client_secret")).toBe("meta-app-secret-for-tests");
    expect(form.get("code")).toBe("auth-code-1");
  });

  it("exchanges Instagram short token for long-lived token and resolves identity", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "long-ig-token", token_type: "bearer", expires_in: 5_184_000 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "178414000000001", username: "account_b", account_type: "BUSINESS" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );

    const longToken = await exchangeInstagramLongLivedToken(env, "short-token");
    expect(longToken.accessToken).toBe("long-ig-token");
    const identity = await fetchInstagramIdentity(env, longToken.accessToken);
    expect(identity).toMatchObject({ id: "178414000000001", username: "account_b" });

    const identityRequest = fetchSpy.mock.calls[1]!;
    expect(String(identityRequest[0])).toContain("https://graph.instagram.com/v26.0/me");
    expect((identityRequest[1]?.headers as Record<string, string>).Authorization).toBe("Bearer long-ig-token");
  });

  it("discovers all Facebook Pages linked to Instagram professional accounts", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "page_1",
              name: "Page One",
              access_token: "page-token-1",
              instagram_business_account: { id: "ig_1", username: "brand_one" },
            },
            {
              id: "page_without_instagram",
              name: "No IG",
              access_token: "page-token-x",
            },
            {
              id: "page_2",
              name: "Page Two",
              access_token: "page-token-2",
              instagram_business_account: { id: "ig_2", username: "brand_two" },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const accounts = await discoverFacebookInstagramAccounts(env, "facebook-user-token");
    expect(accounts).toHaveLength(2);
    expect(accounts.map((account) => account.instagramUsername)).toEqual(["brand_one", "brand_two"]);
    expect(accounts[0]?.pageAccessToken).toBe("page-token-1");
  });

  it("uses the Facebook Graph OAuth endpoint for authorization-code exchange", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "fb-short-token", token_type: "bearer", expires_in: 3600 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const token = await exchangeFacebookAuthorizationCode(env, "facebook-code");
    expect(token.accessToken).toBe("fb-short-token");
    const requestUrl = new URL(String(fetchSpy.mock.calls[0]![0]));
    expect(requestUrl.origin).toBe("https://graph.facebook.com");
    expect(requestUrl.pathname).toBe("/v26.0/oauth/access_token");
    expect(requestUrl.searchParams.get("code")).toBe("facebook-code");
  });
});
