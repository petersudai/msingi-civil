import { describe, expect, it } from "vitest";
import { safeNextPath } from "./redirect";

describe("safeNextPath", () => {
  it("keeps paths inside the app, with their query and hash", () => {
    expect(safeNextPath("/saved")).toBe("/saved");
    expect(safeNextPath("/tools/beam-design?saved=abc")).toBe("/tools/beam-design?saved=abc");
    expect(safeNextPath("/account#backup")).toBe("/account#backup");
  });

  it("falls back to the account page when there is nothing to follow", () => {
    expect(safeNextPath(undefined)).toBe("/account");
    expect(safeNextPath(null)).toBe("/account");
    expect(safeNextPath("")).toBe("/account");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of [
      "https://evil.example",
      "http://evil.example/x",
      "//evil.example",
      "///evil.example",
      "/\\evil.example",
      "evil.example",
      "javascript:alert(1)",
      "/ok\\..\\evil",
      "/ok\n//evil.example",
      "/\t/evil.example",
    ]) {
      expect(safeNextPath(bad), bad).toBe("/account");
    }
  });
});
