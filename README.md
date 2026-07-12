# Msingi — Site engineer's toolkit

Fast, auditable civil engineering calculations for site work, built mobile-first
for Kenyan / East African practice. Every result renders as a calculation sheet:
formulas, substituted values, assumptions and the standards basis — nothing is a
black box, and everything exports as a PDF a reviewer can audit.

> **Product stance:** Msingi is a preliminary design and estimation aid, not a
> substitute for a licensed engineer's review and sign-off. The
> "PRELIMINARY — NOT FOR CONSTRUCTION" stamp appears on every tool page and
> every exported sheet by design; it is part of the product, not fine print.

## Stack

Next.js (App Router) · TypeScript strict · Tailwind CSS v4 · shadcn/ui · Zod ·
React Hook Form · Zustand · Supabase (optional, env-gated) · @react-pdf/renderer ·
Vitest.

## Getting started

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # calculation engine tests (run these before touching UI)
npm run typecheck
npm run build
```

## Architecture

```
lib/
  calculations/          # PURE calculation engines — no React, no I/O
    types.ts             # CalcResultBase: the contract every engine returns
    format.ts            # locale-fixed number formatting
    concrete-materials/
      constants.ts       # named, sourced constants (densities, factors, mixes)
      schema.ts          # Zod input schema + human error messages + defaults
      calculate.ts       # calculate(input) -> result (with working/assumptions)
      calculate.test.ts  # tests vs reference values — MUST pass before UI work
  tools/registry.ts      # single source of truth for what tools exist
  pdf/                   # PDF calc sheet (lazy-loaded on Export click)
  store/                 # zustand: saved calcs (localStorage), report meta
  supabase/              # env-gated client + explicit backup/restore
components/
  tool/                  # shared tool chrome: ToolShell, CalcSheet, stamp,
                         # NumberField, AdvancedSection, HowItWorks, export/save
  tools/<slug>/          # per-tool form components
  shell/                 # app header, bottom nav, wordmark
app/
  tools/<slug>/page.tsx  # one route per tool
  saved/  account/       # persistence + auth surfaces
supabase/migrations/     # SQL schema + RLS for cloud backup
```

### The calculation contract

Every engine is a pure function returning `CalcResultBase`:

- `quantities` — display-ready outputs (headline items flagged)
- `steps` — numbered working: formula → substitution → result → note
- `assumptions` — every value the numbers depend on, with its source
- `warnings` — non-blocking sanity flags (`notice` / `caution`)
- `basis` — code / standard / practice references

`CalcSheet` (screen) and `CalcSheetDocument` (PDF) render this shape
generically, so a new tool gets show-your-work, the disclaimer stamp, and PDF
export for free.

### Adding tool #N (mechanical, by design)

1. `lib/calculations/<slug>/` — constants, schema, calculate, **tests first**
   (validate against textbook/code reference values before any UI).
2. Add an entry to `lib/tools/registry.ts` (flip `status` to `"available"`).
3. `components/tools/<slug>/<slug>-form.tsx` — form wired to the engine.
4. `app/tools/<slug>/page.tsx` — `<ToolShell slug><YourForm/></ToolShell>`.

Nothing else changes: navigation, home screen, saved records, and PDFs pick the
tool up from the registry.

## Persistence model — local-first

Saved calculations write to localStorage immediately (site connectivity is
unreliable; saving never depends on the network). Supabase adds optional
sign-in and **explicit** backup/restore — no magic background sync.

To enable the cloud layer:

1. Create a Supabase project and run `supabase/migrations/0001_init.sql`
   (SQL editor or `supabase db push`). RLS restricts every row to its owner.
2. `cp .env.example .env.local` and fill in the project URL + anon key.
3. Restart the dev server. The Account screen becomes sign-in/backup.

## Deploying to Vercel

The app is zero-config for Vercel (Next.js App Router, static-friendly routes,
no server-only secrets required to boot).

1. Import the repo in Vercel and deploy — build command `npm run build`,
   output detected automatically (`vercel.json` pins this explicitly).
2. Cloud backup is optional: only set `NEXT_PUBLIC_SUPABASE_URL` and
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel project's Environment
   Variables if you've enabled the Supabase layer (see below) — the app runs
   fully in local-first mode without them.
3. `npm run ci` (typecheck → lint → test → build) mirrors what should pass
   before every deploy; run it locally or wire it into a CI check.

Node `>=20.9.0` is pinned in `package.json` engines to match Next.js's own
requirement.

## Calculation verification

Engine tests validate against standard reference values (see the header
comment in `calculate.test.ts`). For concrete materials (dry-volume method,
k = 1.54, 50 kg bags): 1:2:4 → 6.34 bags/m³, 1:1.5:3 → 8.06 bags/m³,
1:3:6 → 4.44 bags/m³, 1:1:2 → 11.09 bags/m³ — matching the quantities
handbooks used in East African and Commonwealth practice.

**House rule: no UI for a calculation until its engine tests pass.**
