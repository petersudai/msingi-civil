import type { CodeId } from "../beam-design/constants";

export type { CodeId };

/** Ultimate concrete compressive strain in bending. EN 1992-1-1 Table 3.1; BS 8110-1 cl. 3.4.4.1. */
export const ULTIMATE_CONCRETE_STRAIN = 0.0035;
/** Concrete strain under pure axial compression, reached where the strain profile pivots. EN 1992-1-1 Table 3.1 (eps_c2). */
export const AXIAL_CONCRETE_STRAIN = 0.002;
/** Height fraction of the pivot point for sections wholly in compression. EN 1992-1-1 Fig. 6.1. */
export const PIVOT_HEIGHT_RATIO = 3 / 7;
export const STEEL_MODULUS = 200_000;

export const COLUMN_DIM_MIN_MM = 150;
export const COLUMN_DIM_MAX_MM = 1500;
export const COVER_MIN_MM = 15;
export const COVER_MAX_MM = 75;
export const HEIGHT_MIN_M = 0.5;
export const HEIGHT_MAX_M = 20;
export const AXIAL_MAX_KN = 50_000;
export const MOMENT_MAX_KNM = 20_000;
export const BARS_PER_FACE_MIN = 2;
export const BARS_PER_FACE_MAX = 8;
export const BETA_MIN = 0.5;
export const BETA_MAX = 1.0;

/** Nominal maximum aggregate size assumed for bar spacing checks, mm. */
export const AGGREGATE_SIZE_MM = 20;
/** Clear gap between bars is at least the larger of bar diameter and aggregate + this, mm. EN 1992-1-1 cl. 8.2(2); BS 8110-1 cl. 3.12.11.1. */
export const BAR_GAP_ABOVE_AGGREGATE_MM = 5;
export const LINK_SPACING_STEP_MM = 25;

export type EndCondition = "restrained2" | "restrained1" | "pinned" | "custom";

/** Effective length factors for braced columns, BS 8110-1 Table 3.19, used for both codes. */
export const END_CONDITION_FACTORS: Record<Exclude<EndCondition, "custom">, number> = {
  restrained2: 0.75,
  restrained1: 0.85,
  pinned: 1.0,
};

export const END_CONDITION_LABELS: Record<EndCondition, string> = {
  restrained2: "Fixed at both ends",
  restrained1: "Fixed at one end",
  pinned: "Pinned or lightly restrained",
  custom: "Enter my own",
};
