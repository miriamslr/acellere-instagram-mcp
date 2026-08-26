import { describe, it, expect } from "vitest";
import {
  INSTAGRAM_CAPABILITIES,
  isCapabilitySupported,
  requireInstagramCapability,
  getCapabilitiesSummary,
  InstagramCapabilityError,
} from "./capabilities.js";

describe("Instagram Capabilities Matrix", () => {
  it("defines comprehensive capabilities with valid metadata and surface separation", () => {
    const capabilities = Object.values(INSTAGRAM_CAPABILITIES);
    expect(capabilities.length).toBeGreaterThanOrEqual(45);

    for (const cap of capabilities) {
      expect(cap.id).toBeDefined();
      expect(cap.name).toBeDefined();
      expect(cap.surface).toMatch(/^(meta_official|acellere_extension)$/);
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

  it("generates structured capabilities summary separating official surface from Acellere extensions", () => {
    const fbSummary = getCapabilitiesSummary("facebook-login");
    expect(fbSummary.login_mode).toBe("facebook-login");
    expect(fbSummary.official_surface.total).toBeGreaterThan(35);
    expect(fbSummary.official_surface.available_count).toBeGreaterThan(35);
    expect(fbSummary.acellere_extensions.total).toBe(6);
    expect(fbSummary.acellere_extensions.available_count).toBe(6);

    const igSummary = getCapabilitiesSummary("instagram-login");
    expect(igSummary.login_mode).toBe("instagram-login");
    expect(igSummary.official_surface.total).toBe(fbSummary.official_surface.total);
    expect(igSummary.official_surface.available_count).toBeGreaterThan(20);
    expect(igSummary.official_surface.unavailable_count).toBeGreaterThan(5);
  });
});
