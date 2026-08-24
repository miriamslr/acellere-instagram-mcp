import { describe, expect, it } from "vitest";
import { assertAcellereWriteAllowed } from "./acellere-meta-client.js";

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
