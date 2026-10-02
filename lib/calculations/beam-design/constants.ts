/**
 * Constants shared by both design codes. Anything that differs between
 * Eurocode 2 and BS 8110 lives in the code's own module under `codes/`.
 */

/** Elastic modulus of reinforcing steel, N/mm². EN 1992-1-1 cl. 3.2.7; BS 8110-1 Fig. 2.2. */
export const STEEL_MODULUS_N_MM2 = 200_000;

/** Design ultimate concrete compressive strain for the stress block. EN 1992-1-1 Table 3.1 (fck ≤ 50); BS 8110-1 cl. 3.4.4.1. */
export const ULTIMATE_CONCRETE_STRAIN = 0.0035;

/** Practical cap on lever arm as a fraction of effective depth. Common to both codes' design procedures. */
export const MAX_LEVER_ARM_RATIO = 0.95;

/** Shear link legs offered in the UI. */
export const LINK_LEG_OPTIONS = [2, 3, 4] as const;

/** Link spacings are rounded down to a multiple of this, mm (site practice). */
export const LINK_SPACING_STEP_MM = 25;
/** Closer than this, links get hard to place and compact around. */
export const LINK_SPACING_PRACTICAL_MIN_MM = 75;
/** Maximum longitudinal link spacing as a fraction of effective depth. EN 1992-1-1 cl. 9.2.2(6); BS 8110-1 cl. 3.4.5.5. */
export const MAX_LINK_SPACING_RATIO = 0.75;

/** Nominal maximum aggregate size assumed for bar spacing checks, mm. */
export const AGGREGATE_SIZE_MM = 20;
/** Clear gap between bars is at least the larger of bar diameter and aggregate + this, mm. EN 1992-1-1 cl. 8.2(2); BS 8110-1 cl. 3.12.11.1. */
export const BAR_GAP_ABOVE_AGGREGATE_MM = 5;

/** Maximum steel ratio of gross concrete area, tension or compression. EN 1992-1-1 cl. 9.2.1.1(3); BS 8110-1 cl. 3.12.6.1. */
export const MAX_STEEL_RATIO = 0.04;

export const SPAN_MIN_M = 0.3;
export const SPAN_MAX_M = 30;
/** Above this span/depth the beam is likely to govern on deflection, which this tool does not check. */
export const SPAN_DEPTH_NOTICE = 20;

export const SECTION_WIDTH_MIN_MM = 100;
export const SECTION_WIDTH_MAX_MM = 1500;
export const SECTION_DEPTH_MIN_MM = 150;
export const SECTION_DEPTH_MAX_MM = 2500;
export const COVER_MIN_MM = 15;
export const COVER_MAX_MM = 75;

export const LOAD_MAX_KN_PER_M = 1000;
export const MOMENT_MAX_KNM = 50_000;
export const SHEAR_MAX_KN = 20_000;

/** Beams are normally deeper than wide; much wider than deep is a slab/strip. */
export const WIDTH_TO_DEPTH_NOTICE = 1.0;
export const SLENDER_DEPTH_TO_WIDTH_NOTICE = 4;

export const MAIN_STEEL_GRADES_MPA = [460, 500] as const;
export const LINK_STEEL_GRADES_MPA = [250, 460, 500] as const;

export type CodeId = "ec2" | "bs8110";
export type LoadMode = "udl" | "direct";
export type SupportCondition = "simple" | "cantilever";

export const SUPPORT_LABELS: Record<SupportCondition, string> = {
  simple: "Simply supported",
  cantilever: "Cantilever",
};
