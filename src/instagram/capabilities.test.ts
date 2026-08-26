import { describe, it, expect } from "vitest";
import {
  INSTAGRAM_CAPABILITIES,
  OFFICIAL_CAPABILITIES,
  OFFICIAL_CAPABILITIES_COUNT,
  MCP_INTERNAL_CAPABILITIES,
  MCP_INTERNAL_COUNT,
  ACELLERE_EXTENSIONS,
  ACELLERE_EXTENSIONS_COUNT,
  isCapabilitySupported,
  requireInstagramCapability,
  getCapabilitiesSummary,
  InstagramCapabilityError,
} from "./capabilities.js";

describe("Instagram Capabilities Matrix", () => {
  it("defines comprehensive capabilities with valid metadata and surface separation", () => {
    const capabilities = Object.values(INSTAGRAM_CAPABILITIES);
    expect(capabilities.length).toBe(
      OFFICIAL_CAPABILITIES_COUNT + MCP_INTERNAL_COUNT + ACELLERE_EXTENSIONS_COUNT
    );
    expect(OFFICIAL_CAPABILITIES_COUNT).toBe(72);
    expect(MCP_INTERNAL_COUNT).toBe(2);
    expect(ACELLERE_EXTENSIONS_COUNT).toBe(6);
    expect(capabilities.length).toBe(80);

    for (const cap of capabilities) {
      expect(cap.id).toBeDefined();
      expect(cap.name).toBeDefined();
      expect(cap.surface).toMatch(/^(meta_official|mcp_internal|acellere_extension)$/);
      expect(cap.category).toBeDefined();
      expect(cap.endpoint).toBeDefined();
      expect(cap.method).toMatch(/^(GET|POST|DELETE)$/);
      expect(cap.readWrite).toMatch(/^(READ|WRITE|WRITE_IDEMPOTENT|DESTRUCTIVE)$/);
      expect(cap.permissionsByMode).toBeDefined();
      expect(Array.isArray(cap.permissionsByMode["facebook-login"])).toBe(true);
      expect(Array.isArray(cap.permissionsByMode["instagram-login"])).toBe(true);
      expect(cap.status).toBeDefined();
      expect(cap.verifiedDate).toBe("2026-08-26");
    }
  });

  it("correctly evaluates Facebook Login vs Instagram Login support and scopes", () => {
    // Business discovery is Facebook Login only
    expect(isCapabilitySupported("facebook-login", "discovery.profile")).toBe(true);
    expect(isCapabilitySupported("instagram-login", "discovery.profile")).toBe(false);

    // Resumable upload is Facebook Login for Business only
    expect(isCapabilitySupported("facebook-login", "publishing.resumableUpload")).toBe(true);
    expect(isCapabilitySupported("instagram-login", "publishing.resumableUpload")).toBe(false);

    // Hashtags are Facebook Login only
    expect(isCapabilitySupported("facebook-login", "hashtags.search")).toBe(true);
    expect(isCapabilitySupported("instagram-login", "hashtags.search")).toBe(false);

    // Publishing photo is supported on both with mode-specific scopes
    expect(isCapabilitySupported("facebook-login", "publishing.photo")).toBe(true);
    expect(isCapabilitySupported("instagram-login", "publishing.photo")).toBe(true);
    expect(INSTAGRAM_CAPABILITIES["publishing.photo"].permissionsByMode["facebook-login"]).toContain("instagram_content_publish");
    expect(INSTAGRAM_CAPABILITIES["publishing.photo"].permissionsByMode["instagram-login"]).toContain("instagram_business_content_publish");

    // Messaging is supported on both with mode-specific scopes
    expect(isCapabilitySupported("facebook-login", "messaging.sendText")).toBe(true);
    expect(isCapabilitySupported("instagram-login", "messaging.sendText")).toBe(true);
    expect(INSTAGRAM_CAPABILITIES["messaging.sendText"].permissionsByMode["facebook-login"]).toContain("instagram_manage_messages");
    expect(INSTAGRAM_CAPABILITIES["messaging.sendText"].permissionsByMode["instagram-login"]).toContain("instagram_business_manage_messages");
  });

  it("requireInstagramCapability passes for supported and throws InstagramCapabilityError for unsupported", () => {
    const supported = requireInstagramCapability("facebook-login", "discovery.profile");
    expect(supported.id).toBe("discovery.profile");

    expect(() => {
      requireInstagramCapability("instagram-login", "discovery.profile");
    }).toThrow(InstagramCapabilityError);

    try {
      requireInstagramCapability("instagram-login", "discovery.profile");
    } catch (err) {
      const capErr = err as InstagramCapabilityError;
      expect(capErr.currentLoginMode).toBe("instagram-login");
      expect(capErr.requiredLoginMode).toBe("facebook-login");
      expect(capErr.remediation).toContain("INSTAGRAM_API_MODE=facebook-login");
    }
  });

  it("generates structured capabilities summary separating official surface from Acellere extensions with deterministic counts", () => {
    const fbSummary = getCapabilitiesSummary("facebook-login");
    expect(fbSummary.login_mode).toBe("facebook-login");
    expect(fbSummary.official_surface.total).toBe(OFFICIAL_CAPABILITIES_COUNT);
    const fbOfficialExpectedAvailable = OFFICIAL_CAPABILITIES.filter((c) => c.facebookLogin).length;
    expect(fbSummary.official_surface.available_count).toBe(fbOfficialExpectedAvailable);
    expect(fbSummary.official_surface.unavailable_count).toBe(OFFICIAL_CAPABILITIES_COUNT - fbOfficialExpectedAvailable);
    expect(fbSummary.official_surface.coverage_percentage).toBe(Math.round((fbOfficialExpectedAvailable / OFFICIAL_CAPABILITIES_COUNT) * 100));

    expect(fbSummary.acellere_extensions.total).toBe(ACELLERE_EXTENSIONS_COUNT);
    expect(fbSummary.acellere_extensions.available_count).toBe(ACELLERE_EXTENSIONS.filter((c) => c.facebookLogin).length);

    expect(fbSummary.mcp_internal.total).toBe(MCP_INTERNAL_COUNT);
    expect(fbSummary.mcp_internal.available_count).toBe(MCP_INTERNAL_CAPABILITIES.length);

    const igSummary = getCapabilitiesSummary("instagram-login");
    expect(igSummary.login_mode).toBe("instagram-login");
    expect(igSummary.official_surface.total).toBe(OFFICIAL_CAPABILITIES_COUNT);
    const igOfficialExpectedAvailable = OFFICIAL_CAPABILITIES.filter((c) => c.instagramLogin).length;
    expect(igSummary.official_surface.available_count).toBe(igOfficialExpectedAvailable);
    expect(igSummary.official_surface.unavailable_count).toBe(OFFICIAL_CAPABILITIES_COUNT - igOfficialExpectedAvailable);
    expect(igSummary.mcp_internal.total).toBe(MCP_INTERNAL_COUNT);
  });
});
