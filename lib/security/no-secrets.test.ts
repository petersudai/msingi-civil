import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Guards against the two ways a secret leaks: into the repository, and into
 * the browser. It reads the source tree, so it needs no running app.
 */

const ROOT = process.cwd();
const SKIP_DIRS = new Set(["node_modules", ".next", ".git", ".vercel", "coverage"]);
const SOURCE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|json|md|sql|css|yml|yaml|example)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(ROOT).filter((f) => {
  const base = path.basename(f);
  // Real env files are git-ignored; only the empty template is ever committed.
  if (base.startsWith(".env") && base !== ".env.example") return false;
  if (base === "package-lock.json" || base === "tsconfig.tsbuildinfo") return false;
  return SOURCE_EXT.test(base) || base === ".env.example";
});
const rel = (f: string) => path.relative(ROOT, f).split(path.sep).join("/");
const read = (f: string) => readFileSync(f, "utf8");

/** Shapes of real credentials. Built from parts so this file doesn't match itself. */
const CREDENTIAL_PATTERNS: Array<[string, RegExp]> = [
  ["Neon password", new RegExp("npg" + "_[A-Za-z0-9]{8,}")],
  ["connection string with a password", new RegExp("postgres(?:ql)?://[^\\s\"'`:@/]+:[^\\s\"'`@]+@")],
  ["JWT", new RegExp("eyJ" + "[A-Za-z0-9_-]{10,}\\.[A-Za-z0-9_-]{10,}\\.")],
  ["Stripe secret key", new RegExp("sk" + "_(?:live|test)_[A-Za-z0-9]{10,}")],
  ["AWS access key", new RegExp("AKI" + "A[0-9A-Z]{16}")],
  ["GitHub token", new RegExp("gh[pousr]" + "_[A-Za-z0-9]{20,}")],
  ["private key block", new RegExp("-----BEGIN [A-Z ]*PRIVATE" + " KEY-----")],
  ["secret assigned a long literal", /(?:SECRET|PASSWORD|TOKEN|API_KEY)\s*[:=]\s*["'`][A-Za-z0-9+/=_-]{24,}["'`]/],
];

describe("no credentials in the repository", () => {
  it("source, docs, SQL and the env template contain no credential-shaped strings", () => {
    const hits: string[] = [];
    for (const f of files) {
      const text = read(f);
      for (const [label, re] of CREDENTIAL_PATTERNS) {
        if (re.test(text)) hits.push(`${rel(f)}: ${label}`);
      }
    }
    expect(hits).toEqual([]);
  });

  it(".env.example holds names only, with every value empty", () => {
    const lines = read(path.join(ROOT, ".env.example"))
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.trim().startsWith("#"));
    expect(lines.length).toBeGreaterThan(0);
    for (const line of lines) {
      expect(line, line).toMatch(/^[A-Z0-9_]+=$/);
    }
  });

  it(".gitignore keeps real env files, Vercel link data and Claude Code files out", () => {
    const ignore = read(path.join(ROOT, ".gitignore"));
    expect(ignore).toMatch(/^\.env\*$/m);
    expect(ignore).toMatch(/^!\.env\.example$/m);
    expect(ignore).toMatch(/^\.vercel$/m);
    expect(ignore).toMatch(/^\.claude\/$/m);
  });
});

describe("no secrets reach the browser", () => {
  const SECRET_NAMES = ["DATABASE_URL", "NEON_AUTH_COOKIE_SECRET", "NEON_AUTH_BASE_URL"];

  it("no secret is exposed through a NEXT_PUBLIC_ variable, which Next.js inlines into client code", () => {
    const hits: string[] = [];
    for (const f of files) {
      const text = read(f);
      const re = /NEXT_PUBLIC_[A-Z0-9_]*(?:DATABASE|SECRET|TOKEN|PASSWORD|PRIVATE|SERVICE_ROLE|API_KEY)[A-Z0-9_]*/g;
      for (const m of text.matchAll(re)) hits.push(`${rel(f)}: ${m[0]}`);
    }
    expect(hits).toEqual([]);
  });

  it("client components never read a server secret", () => {
    const hits: string[] = [];
    for (const f of files.filter((x) => /\.(tsx?|jsx?)$/.test(x))) {
      const text = read(f);
      const isClient = /^\s*(["'])use client\1/m.test(text.slice(0, 400));
      if (!isClient) continue;
      for (const name of SECRET_NAMES) {
        if (text.includes(name)) hits.push(`${rel(f)}: ${name}`);
      }
      if (/process\.env\.(?!NEXT_PUBLIC_|NODE_ENV)/.test(text)) hits.push(`${rel(f)}: reads a non-public env var`);
    }
    expect(hits).toEqual([]);
  });

  it("server-only modules that hold secrets are not imported from client components", () => {
    const serverOnly = ["@/lib/auth/server", "@/lib/db", "@/lib/cloud/config"];
    const hits: string[] = [];
    for (const f of files.filter((x) => /\.(tsx?|jsx?)$/.test(x))) {
      const text = read(f);
      if (!/^\s*(["'])use client\1/m.test(text.slice(0, 400))) continue;
      for (const mod of serverOnly) {
        if (new RegExp(`from\\s+["']${mod.replace(/[/@]/g, "\\$&")}["']`).test(text)) {
          hits.push(`${rel(f)} imports ${mod}`);
        }
      }
    }
    expect(hits).toEqual([]);
  });
});
