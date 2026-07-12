/**
 * Shared contract for every calculation engine in the toolkit.
 *
 * Every tool's engine is a pure function `calculate(input) => Result`, where
 * `Result` extends {@link CalcResultBase}. The tool shell, the PDF export
 * pipeline, and the saved-calculation views all render from this shape, so a
 * new tool gets "show your work", assumptions, warnings, standards basis and
 * PDF export without any bespoke UI plumbing.
 *
 * Engines must be framework-free: no React, no DOM, no I/O. They should be
 * runnable in Node, a worker, an API route, or a future mobile app unchanged.
 */

/** A citation to a code, standard, or established estimating practice. */
export interface SourceReference {
  /** Short label shown inline, e.g. "BS 8110-1:1997, cl. 3.4.4.4". */
  label: string;
  /** What this source establishes in this calculation. */
  note?: string;
}

/**
 * One numbered line of working, formatted the way it would appear on a hand
 * calculation sheet: symbolic formula, numbers substituted, then the result.
 */
export interface WorkingStep {
  /** e.g. "Dry volume of materials". */
  title: string;
  /** Symbolic form, e.g. "V_dry = V_wet × k". */
  formula: string;
  /** Numbers plugged in, e.g. "V_dry = 6.00 × 1.54". */
  substitution: string;
  /** Result with unit, e.g. "9.24 m³". */
  result: string;
  /** Optional clarification or source for this specific step. */
  note?: string;
}

/**
 * A named input assumption the engine relied on, surfaced so a reviewing
 * engineer can audit the basis of the numbers at a glance.
 */
export interface Assumption {
  label: string;
  /** Display-ready value including unit, e.g. "1,440 kg/m³". */
  value: string;
  /** Where the default comes from / why it is reasonable. */
  source?: string;
}

/**
 * A non-blocking sanity flag. Blocking problems are validation errors and
 * never reach the engine; warnings are for inputs that are *possible* but
 * deserve a second look, or results that imply a practical concern.
 *
 * - `notice`  — informational; worth knowing, nothing suspicious.
 * - `caution` — physically plausible but unusual; verify before relying on it.
 */
export interface CalcWarning {
  level: "notice" | "caution";
  message: string;
}

/** A headline output rendered on the results sheet and in the PDF. */
export interface CalcQuantity {
  label: string;
  /** Display-ready value string (already rounded), e.g. "39". */
  value: string;
  unit: string;
  /** Headline quantities render large; the rest go in the detail table. */
  emphasis?: boolean;
  /** e.g. "38.02 bags exact — rounded up for purchasing". */
  note?: string;
}

/** The renderable envelope every engine returns. */
export interface CalcResultBase {
  /** One-line method statement, e.g. "Dry-volume (nominal mix) estimation". */
  methodology: string;
  /** Display-ready output quantities, headline items flagged with `emphasis`. */
  quantities: CalcQuantity[];
  /** Numbered working, in calculation order. */
  steps: WorkingStep[];
  /** Every assumption the numbers depend on. */
  assumptions: Assumption[];
  /** Sanity flags for the current inputs/results. */
  warnings: CalcWarning[];
  /** Codes / standards / practice references the method is based on. */
  basis: SourceReference[];
}
