import { mkdirSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { expect, it } from "vitest";
import { calculateConcreteMaterials } from "@/lib/calculations/concrete-materials/calculate";
import { calculateRebarTakeoff } from "@/lib/calculations/rebar-takeoff/calculate";

/**
 * Smoke-renders the full PDF calc sheet in Node. Guards against regressions
 * that produce a broken document without throwing (missing fonts, dropped
 * fixed footer; see the notes in calc-sheet-document.tsx).
 *
 * Set PDF_SMOKE_OUT=<dir> to also write the PDF for visual inspection.
 */
it("renders the calc sheet PDF to a buffer", { timeout: 60_000 }, async () => {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { CalcSheetDocument } = await import("./calc-sheet-document");

  const result = calculateConcreteMaterials({
    volumeM3: 6,
    mixSelection: "class20",
    bagSizeKg: 50,
    bulkingFactor: 1.54,
    cementDensityKgM3: 1440,
    fineAggDensityKgM3: 1600,
    coarseAggDensityKgM3: 1500,
  });

  // The component renders a <Document> but its element type is the wrapper
  // function, so renderToBuffer's DocumentProps constraint needs the cast.
  const buffer = await renderToBuffer(
    createElement(CalcSheetDocument, {
      data: {
        toolName: "Concrete materials",
        subtitle: "Class 20 (1 : 2 : 4) · 6 m³ wet volume",
        filename: "smoke.pdf",
        inputsSummary: [
          { label: "Wet concrete volume", value: "6 m³" },
          { label: "Mix", value: "Class 20 (1 : 2 : 4)" },
          { label: "Cement bag", value: "50 kg" },
          { label: "Bulking factor", value: "1.54" },
          {
            label: "Densities (cement / sand / ballast)",
            value: "1440 / 1600 / 1500 kg/m³",
          },
        ],
        result,
        projectName: "Kilimani Block B",
        preparedBy: "Eng. P. Sudai",
        generatedAt: "11 Jul 2026",
      },
    }) as import("react").ReactElement<
      import("@react-pdf/renderer").DocumentProps
    >,
  );

  // A valid render with embedded Plex subsets lands well above this floor;
  // a font failure or dropped page comes in far smaller.
  expect(buffer.length).toBeGreaterThan(20_000);
  expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  const outDir = process.env.PDF_SMOKE_OUT;
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/msingi-smoke.pdf`, buffer);
  }
});

/**
 * Rebar takeoff exercises the generic schedule-table renderer added to the
 * PDF document (the bar bending schedule), the first tool to use it.
 */
it("renders a calc sheet with a bar bending schedule table", { timeout: 60_000 }, async () => {
  const { renderToBuffer } = await import("@react-pdf/renderer");
  const { CalcSheetDocument } = await import("./calc-sheet-document");

  const result = calculateRebarTakeoff({
    memberType: "beam",
    numberOfMembers: 1,
    coverMm: 25,
    memberLengthM: 4,
    widthMm: 230,
    depthMm: 450,
    mainBarDiameterMm: 16,
    mainBarCount: 4,
    linkDiameterMm: 8,
    linkSpacingMm: 150,
    hookAllowanceMm: 100,
    extraLengthMm: 0,
  });

  expect(result.tables).toHaveLength(1);

  const buffer = await renderToBuffer(
    createElement(CalcSheetDocument, {
      data: {
        toolName: "Rebar takeoff",
        subtitle: "Beam · 4.0 m · 1 member(s)",
        filename: "smoke-rebar.pdf",
        inputsSummary: [
          { label: "Member type", value: "Beam" },
          { label: "Clear span", value: "4.000 m" },
        ],
        result,
        generatedAt: "11 Jul 2026",
      },
    }) as import("react").ReactElement<
      import("@react-pdf/renderer").DocumentProps
    >,
  );

  expect(buffer.length).toBeGreaterThan(15_000);
  expect(buffer.subarray(0, 5).toString("latin1")).toBe("%PDF-");

  const outDir = process.env.PDF_SMOKE_OUT;
  if (outDir) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(`${outDir}/msingi-smoke-rebar.pdf`, buffer);
  }
});
