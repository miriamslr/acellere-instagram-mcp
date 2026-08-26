import { describe, it, expect } from "vitest";
import {
  INSTAGRAM_CAPABILITIES,
  isCapabilitySupported,
  requireInstagramCapability,
  getCapabilitiesSummary,
  InstagramCapabilityError,
} from "./capabilities.js";

describe("Instagram Capabilities Matrix", () => {
  it("defines comprehensive capabilities with valid metadata", () => {
    const capabilities = Object.values(INSTAGRAM_CAPABILITIES);
    expect(capabilities.length).toBeGreaterThanOrEqual(40);

    for (const cap of capabilities) {
      expect(cap.id).toBeDefined();
      expect(cap.name).toBeDefined();
      expect(cap.category).toBeDefined();
      expect(cap.endpoint).toBeDefined();
      expect(cap.method).toMatch(/^(GET|POST|DELETE)$/);
      expect(cap.readWrite).toMatch(/^(READ|WRITE|WRITE_IDEMPOTENT|DESTRUCTIVE)$/);
      expect(cap.status).toBeDefined();
      expect(cap.verifiedDate).toBe("2026-08-26");
    }
  });

  it("correctly evaluates Facebook Login vs Instagram Login support", () => {
    // Business discovery is Facebook Login only
    expect(isCapabilitySupported("facebook-login", "discovery.profile")).toBe(true);
    expect(isCapabilitySupported("instagram-login", "discovery.profile")).toBe(false);

    // Hashtags are Facebook Login only
    expect(isCapabilitySupported("facebook-login", "hashtags.search")).toBe(true);
    expect(isCapabilitySupported("instagram-login", "hashtags.search")).toBe(false);

    // Publishing photo is supported on both
    expect(isCapabilitySupported("facebook-login", "publishing.photo")).toBe(true);
    expect(isCapabilitySupported("instagram-login", "publishing.photo")).toBe(true);

    // Messaging is supported on both
    expect(isCapabilitySupported("facebook-login", "messaging.sendText")).toBe(true);
    expect(isCapabilitySupported("instagram-login", "messaging.sendText")).toBe(true);
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

  it("generates structured capabilities summary for any login mode", () => {
    const fbSummary = getCapabilitiesSummary("facebook-login");
    expect(fbSummary.login_mode).toBe("facebook-login");
    expect(fbSummary.available_capabilities_count).toBeGreaterThan(35);
    expect(fbSummary.unavailable_capabilities_count).toBe(0);

    const igSummary = getCapabilitiesSummary("instagram-login");
    expect(igSummary.login_mode).toBe("instagram-login");
    expect(igSummary.available_capabilities_count).toBeGreaterThan(20);
    expect(igSummary.unavailable_capabilities_count).toBeGreaterThan(5);
  });
});
