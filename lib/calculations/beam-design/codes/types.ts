import type { Assumption, SourceReference, WorkingStep } from "../../types";
import type { CodeId } from "../constants";

/**
 * The pluggable code layer. Each design code (Eurocode 2, BS 8110, and any
 * later family) implements `BeamCode`; the orchestrator in `calculate.ts`
 * knows nothing about which code it is driving. Adding a third code means one
 * new file in this folder and one line in `codes/index.ts`.
 */

export interface GradeOption {
  label: string;
  /** Characteristic strength, N/mm² (fck for Eurocode 2, fcu for BS 8110). */
  value: number;
}

/** Material and partial-factor inputs a code consumes. */
export interface CodeParameters {
  /** Characteristic concrete strength, N/mm² (fck or fcu, per the code). */
  concreteStrength: number;
  /** Main steel characteristic yield strength, N/mm². */
  fy: number;
  /** Link steel characteristic yield strength, N/mm². */
  fyv: number;
  /** Eurocode 2 only: long-term strength factor. Ignored by BS 8110. */
  alphaCc: number;
  /** Eurocode 2 only: concrete partial factor. Ignored by BS 8110. */
  gammaC: number;
  /** Eurocode 2 only: steel partial factor. Ignored by BS 8110. */
  gammaS: number;
}

export interface SectionGeometry {
  bMm: number;
  hMm: number;
  /** Effective depth to tension steel centroid. */
  dMm: number;
  /** Depth to compression steel centroid, from the compression face. */
  dPrimeMm: number;
}

export interface FlexureOutcome {
  /** False when the section cannot be made to work by adding compression steel. */
  feasible: boolean;
  infeasibleReason?: string;
  reinforcement: "singly" | "doubly";
  /** Design moment used, kN·m. */
  momentKnm: number;
  /** Tension steel required by strength alone, mm². */
  asCalcMm2: number;
  asMinMm2: number;
  /** max(asCalc, asMin): what the beam actually needs. */
  asDesignMm2: number;
  /** Compression steel required, mm². Zero when singly reinforced. */
  asCompMm2: number;
  asMaxMm2: number;
  leverArmMm: number;
  neutralAxisMm: number;
  /** Section parameter K (or mu for Eurocode 2) and its singly-reinforced limit. */
  kValue: number;
  kLimit: number;
  /** Stress in compression steel as a fraction of its design yield strength (0..1). */
  compressionSteelStressRatio: number;
  steps: WorkingStep[];
}

export interface ShearOutcome {
  verdict: "links-minimum" | "links-designed" | "section-inadequate";
  vEdKn: number;
  /** Shear the concrete resists without calculated links, kN. */
  concreteCapacityKn: number;
  /** Upper limit of section shear capacity (web crushing), kN. */
  maxCapacityKn: number;
  /** Link area required per mm of beam length, mm²/mm. */
  aswPerSMmReq: number;
  /** Maximum longitudinal link spacing allowed, mm. */
  maxSpacingMm: number;
  steps: WorkingStep[];
}

export interface FlexureInput {
  momentKnm: number;
  geometry: SectionGeometry;
  params: CodeParameters;
}

export interface ShearInput {
  vEdKn: number;
  geometry: SectionGeometry;
  /** Tension steel the shear resistance is based on, mm². */
  asTensionMm2: number;
  params: CodeParameters;
}

export interface CodeDefaults {
  concreteStrength: number;
  fy: number;
  fyv: number;
  gammaG: number;
  gammaQ: number;
  /** Reinforced concrete unit weight for self-weight, kN/m³. */
  densityKnM3: number;
  alphaCc: number;
  gammaC: number;
  gammaS: number;
}

export interface BeamCode {
  id: CodeId;
  /** e.g. "Eurocode 2 (EN 1992-1-1)". */
  name: string;
  shortName: string;
  /** e.g. "C25/30" grades, label for the strength symbol. */
  strengthSymbol: string;
  concreteGrades: readonly GradeOption[];
  defaults: CodeDefaults;
  /** Name of the ULTIMATE combination used for loads, shown on the sheet. */
  loadCombinationLabel: string;
  /** Clause references shown beside the pass/fail checks. */
  clauses: {
    steelLimit: string;
    shearLimit: string;
    compressionSteel: string;
  };
  designFlexure(input: FlexureInput): FlexureOutcome;
  designShear(input: ShearInput): ShearOutcome;
  assumptions(params: CodeParameters): Assumption[];
  basis: readonly SourceReference[];
  /** Whether this code reads the Eurocode-only parameter overrides. */
  usesNationalParameters: boolean;
}
