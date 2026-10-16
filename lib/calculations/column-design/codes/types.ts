import type { GradeOption } from "../../beam-design/codes/types";
import type { Assumption, SourceReference, WorkingStep } from "../../types";
import type { CodeId } from "../constants";
import type { StressModel } from "../section-capacity";

export type { GradeOption };

/**
 * The pluggable code layer for columns. Each design code implements
 * `ColumnCode`; the orchestrator in `calculate.ts` and the strain-compatibility
 * engine know nothing about which code is driving them.
 */

export interface ColumnParameters {
  /** Characteristic concrete strength, N/mm² (f_ck for EC2, f_cu for BS 8110). */
  concreteStrength: number;
  fy: number;
  /** Eurocode 2 only. */
  alphaCc: number;
  gammaC: number;
  gammaS: number;
  /** Eurocode 2 only: effective creep ratio for the nominal curvature method. */
  creepRatio: number;
}

export interface ColumnDefaults {
  concreteStrength: number;
  fy: number;
  alphaCc: number;
  gammaC: number;
  gammaS: number;
  creepRatio: number;
}

export interface ColumnGeometry {
  bMm: number;
  /** Depth in the plane of bending. */
  hMm: number;
  /** Effective depth to the extreme tension row, mm. */
  dMm: number;
  /** Total steel area, mm². */
  asTotalMm2: number;
  /** Radius of gyration of the steel about the section centroid, mm. */
  steelRadiusMm: number;
}

export interface SlendernessInput {
  nEdKn: number;
  /** Signed end moments about the axis of bending, kNm. Same sign = single curvature. */
  mTopKnm: number;
  mBotKnm: number;
  /** Column height between restraints, mm. */
  heightMm: number;
  /** Effective length factor. */
  beta: number;
  geometry: ColumnGeometry;
  params: ColumnParameters;
}

export interface SlendernessOutcome {
  effectiveLengthMm: number;
  /** Slenderness ratio in the code's own measure (lambda for EC2, l_e / h for BS 8110). */
  slenderness: number;
  /** Limit below which the column is short and second-order effects are ignored. */
  slendernessLimit: number;
  slender: boolean;
  /** Larger end moment (absolute), kNm. */
  firstOrderKnm: number;
  /** Minimum design moment from the minimum eccentricity, kNm. */
  minimumMomentKnm: number;
  /** Second-order (additional) moment, kNm. Zero for a short column. */
  secondOrderKnm: number;
  /** Moment to design the section for, kNm. */
  designMomentKnm: number;
  /** Ratio governing the "slenderness within tool scope" check. */
  scopeDemand: number;
  scopeLimit: number;
  scopeLabel: string;
  steps: WorkingStep[];
}

export interface SteelLimits {
  minAreaMm2: number;
  maxAreaMm2: number;
  minAreaStep: WorkingStep;
}

export interface LinkRules {
  minDiameterMm: number;
  maxSpacingMm: number;
  steps: WorkingStep[];
}

export interface ColumnCode {
  id: CodeId;
  name: string;
  shortName: string;
  strengthSymbol: string;
  concreteGrades: readonly GradeOption[];
  defaults: ColumnDefaults;
  clauses: {
    capacity: string;
    steelLimits: string;
    linkRules: string;
    slendernessScope: string;
    minimumBars: string;
  };
  /** Stress block and steel law the interaction diagram is built from. */
  stressModel(params: ColumnParameters): StressModel;
  /** Short statement of the model for the sheet, e.g. "rectangular block 0.8x at 17 N/mm²". */
  stressModelSummary(params: ColumnParameters): string;
  slenderness(input: SlendernessInput): SlendernessOutcome;
  steelLimits(nEdKn: number, grossAreaMm2: number, params: ColumnParameters): SteelLimits;
  linkRules(
    mainBarDiameterMm: number,
    bMm: number,
    hMm: number,
    params: ColumnParameters,
  ): LinkRules;
  assumptions(params: ColumnParameters): Assumption[];
  basis: readonly SourceReference[];
  /** Whether this code reads the Eurocode-only parameter overrides. */
  usesNationalParameters: boolean;
}
