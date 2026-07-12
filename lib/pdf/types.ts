import type { CalcResultBase } from "@/lib/calculations/types";

/**
 * Everything the PDF calc sheet needs, framework-free. Kept separate from the
 * document component so UI code can import this type without pulling the
 * (heavy) @react-pdf/renderer bundle — that loads only when Export is tapped.
 */
export interface CalcSheetData {
  toolName: string;
  /** e.g. "Class 20 (1:2:4) · 6 m³". */
  subtitle?: string;
  /** Download filename, e.g. "msingi-concrete-materials-2026-07-11.pdf". */
  filename: string;
  /** The user's inputs, display-ready, for the sheet's input table. */
  inputsSummary: Array<{ label: string; value: string }>;
  result: CalcResultBase;
  projectName?: string;
  preparedBy?: string;
  /** Display date, e.g. "11 Jul 2026". */
  generatedAt: string;
}
