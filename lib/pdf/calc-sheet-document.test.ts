import { mkdirSync, writeFileSync } from "node:fs";
import { createElement } from "react";
import { expect, it } from "vitest";
import { calculateConcreteMaterials } from "@/lib/calculations/concrete-materials/calculate";

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
