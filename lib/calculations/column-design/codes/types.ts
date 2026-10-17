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
  /** Link steel yield strength, N/mm². */
  fyv: number;
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
  fyv: number;
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
  /**
   * The same moment without the minimum-eccentricity floor, kNm. The floor is
   * checked about one axis at a time, never on both at once, so the biaxial
   * check needs the real moment separately.
   */
  designMomentNoMinKnm: number;
  /** Ratio governing the "slenderness within tool scope" check. */
  scopeDemand: number;
  scopeLimit: number;
  scopeLabel: string;
  steps: WorkingStep[];
}

export interface ColumnShearInput {
  /** Shear force in the plane of bending being checked, kN. */
  vEdKn: number;
  nEdKn: number;
  /** Design moment in the same plane, kNm (BS 8110 uses it for the axial enhancement). */
  momentKnm: number;
  /** Section width the shear acts across, mm. */
  widthMm: number;
  /** Effective depth in the plane of bending, mm. */
  effectiveDepthMm: number;
  /** Overall depth in the plane of bending, mm. */
  overallDepthMm: number;
  /** Longitudinal steel on one face, mm². Used for the steel ratio in V_Rd,c. */
  tensionSteelMm2: number;
  params: ColumnParameters;
}

export interface ColumnShearOutcome {
  verdict: "links-minimum" | "links-designed" | "section-inadequate";
  vEdKn: number;
  /** Shear the concrete resists without calculated links, kN. */
  concreteCapacityKn: number;
  /** Upper limit of section shear capacity, kN. */
  maxCapacityKn: number;
  /** Link area per mm of column height needed for strength, mm²/mm. Zero when no calculated links are needed. */
  aswPerSMmReq: number;
  steps: WorkingStep[];
}

/** One axis of bending as the biaxial check sees it. */
export interface BiaxialAxis {
  /** "h" or "b": the side the moment acts along. */
  key: "h" | "b";
  /** Design moment with the minimum-eccentricity floor, kNm. */
  fullKnm: number;
  /** Design moment without the floor, kNm. */
  actualKnm: number;
  /** Uniaxial moment capacity at N_Ed, kNm. */
  capacityKnm: number;
  /** Slenderness in the code's own measure. */
  slenderness: number;
  /** Effective depth along this axis, mm. */
  effectiveDepthMm: number;
  /** Overall dimension along this axis, mm. */
  dimensionMm: number;
}

export interface BiaxialInput {
  nEdKn: number;
  h: BiaxialAxis;
  b: BiaxialAxis;
  grossAreaMm2: number;
  steelAreaMm2: number;
  params: ColumnParameters;
}

export interface BiaxialOutcome {
  /** False when the code lets the two directions be designed separately. */
  applies: boolean;
  /** Interaction utilisation, 1.0 is the limit. Null when it doesn't apply. */
  utilisation: number | null;
  demand: string;
  capacity: string;
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
    shear: string;
    shearLimit: string;
    biaxial: string;
  };
  /** Stress block and steel law the interaction diagram is built from. */
  stressModel(params: ColumnParameters): StressModel;
  /** Short statement of the model for the sheet, e.g. "rectangular block 0.8x at 17 N/mm²". */
  stressModelSummary(params: ColumnParameters): string;
  slenderness(input: SlendernessInput): SlendernessOutcome;
  steelLimits(nEdKn: number, grossAreaMm2: number, params: ColumnParameters): SteelLimits;
  /** Shear in one plane: capacity without links, the section limit, and the links needed. */
  shear(input: ColumnShearInput): ColumnShearOutcome;
  /** Combined bending about both axes. */
  biaxial(input: BiaxialInput): BiaxialOutcome;
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
