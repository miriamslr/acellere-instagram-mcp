import { describe, it, expect } from "vitest";
import {
  splitTopLevelFields,
  extractRootFieldName,
  validateBusinessDiscoveryFields,
} from "./business-discovery-validator.js";

describe("business-discovery-validator", () => {
  describe("splitTopLevelFields", () => {
    it("splits comma-separated top-level fields", () => {
      expect(splitTopLevelFields("id,username,followers_count")).toEqual([
        "id",
        "username",
        "followers_count",
      ]);
    });

    it("preserves nested curly braces without splitting internal commas", () => {
      expect(splitTopLevelFields("id,media{id,caption,like_count},username")).toEqual([
        "id",
        "media{id,caption,like_count}",
        "username",
      ]);
    });

    it("handles surrounding spaces", () => {
      expect(splitTopLevelFields("  id ,  name  , media{id}  ")).toEqual([
        "id",
        "name",
        "media{id}",
      ]);
    });
  });

  describe("extractRootFieldName", () => {
    it("extracts simple field names", () => {
      expect(extractRootFieldName("followers_count")).toBe("followers_count");
      expect(extractRootFieldName("biography")).toBe("biography");
    });

    it("extracts root from complex nested expressions", () => {
      expect(extractRootFieldName("media.limit(10){id,caption}")).toBe("media");
      expect(extractRootFieldName("stories{id}")).toBe("stories");
    });
  });

  describe("validateBusinessDiscoveryFields", () => {
    it("accepts all 10 standard profile fields", () => {
      const all10 =
        "id,ig_id,username,name,biography,website,profile_picture_url,followers_count,follows_count,media_count";
      const result = validateBusinessDiscoveryFields(all10);
      expect(result.valid).toBe(true);
      expect(result.unsupportedFields).toHaveLength(0);
    });

    it("accepts media and stories expansions", () => {
      const result = validateBusinessDiscoveryFields("id,username,media{id,caption,like_count}");
      expect(result.valid).toBe(true);
    });

    it("rejects known unsupported fields for third parties", () => {
      const result = validateBusinessDiscoveryFields("id,username,account_type");
      expect(result.valid).toBe(false);
      expect(result.unsupportedFields).toContain("account_type");
      expect(result.message).toContain("não está disponível para contas de terceiros");
    });

    it("rejects insights or comments unsupported fields", () => {
      const result = validateBusinessDiscoveryFields("id,insights,comments");
      expect(result.valid).toBe(false);
      expect(result.unsupportedFields).toContain("insights");
      expect(result.unsupportedFields).toContain("comments");
    });

    it("rejects nested comments in media expansion", () => {
      const result = validateBusinessDiscoveryFields("id,media{id,caption,comments}");
      expect(result.valid).toBe(false);
      expect(result.unsupportedFields).toContain("comments");
    });

    it("rejects empty or whitespace string", () => {
      const result = validateBusinessDiscoveryFields("   ");
      expect(result.valid).toBe(false);
      expect(result.message).toContain("cannot be empty");
    });

    it("rejects unrecognized arbitrary fields", () => {
      const result = validateBusinessDiscoveryFields("id,unknown_arbitrary_field");
      expect(result.valid).toBe(false);
      expect(result.invalidFields).toContain("unknown_arbitrary_field");
      expect(result.message).toContain("inválido(s) ou não reconhecido(s)");
    });
  });
});
