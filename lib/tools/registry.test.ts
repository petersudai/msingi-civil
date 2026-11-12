import { existsSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TOOLS } from "./registry";

const TOOLS_DIR = path.join(process.cwd(), "app", "tools");

describe("tool registry matches the pages that exist", () => {
  it("every tool marked available has its own page, so its card never leads to a 404", () => {
    const missing = TOOLS.filter(
      (t) => t.status === "available" && !existsSync(path.join(TOOLS_DIR, t.slug, "page.tsx")),
    ).map((t) => t.slug);
    expect(missing).toEqual([]);
  });

  it("every built tool page is registered as available, so it appears on the home screen", () => {
    const built = readdirSync(TOOLS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !d.name.startsWith("["))
      .map((d) => d.name);
    const unregistered = built.filter(
      (slug) => !TOOLS.some((t) => t.slug === slug && t.status === "available"),
    );
    expect(unregistered).toEqual([]);
  });

  it("slugs are unique", () => {
    const slugs = TOOLS.map((t) => t.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
