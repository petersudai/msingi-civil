/**
 * Named, sourced constants for the reinforcement (rebar) takeoff calculator.
 */

/**
 * Density of reinforcing steel, kg/m³. Universal across BS 4449, IS 1786 and
 * ASTM A615: mild and high-yield deformed bars are all taken at this value
 * for mass calculations regardless of grade.
 */
export const STEEL_DENSITY_KG_M3 = 7850;

/**
 * Standard commercial deformed bar diameters, mm. Matches the sizes stocked
 * by East African steel mills (Devki, Apex, Mabati) and the BS 4449 / KS
 * range: 6, 8, 10, 12, 16, 20, 25, 32, 40.
 */
export const STANDARD_BAR_DIAMETERS_MM = [6, 8, 10, 12, 16, 20, 25, 32, 40] as const;
export type StandardBarDiameter = (typeof STANDARD_BAR_DIAMETERS_MM)[number];

/** Typical concrete cover to reinforcement, mm; overridable per member. */
export const DEFAULT_COVER_MM = 25;
export const COVER_MIN_MM = 10;
export const COVER_MAX_MM = 100;
/** Below this, cover is unusually thin for cast-in-situ work. */
export const COVER_TYPICAL_MIN_MM = 15;

/**
 * Approximate extra length added per link/stirrup for its two hooks, mm.
 * This is a rule-of-thumb allowance, not a specific national bending-schedule
 * standard's bend/hook deduction table (those vary: BS 8666, IS 2502, ACI
 * detailing all differ slightly). Confirm against your detailing standard
 * for a final, code-compliant bar bending schedule.
 */
export const DEFAULT_HOOK_ALLOWANCE_MM = 100;
export const HOOK_ALLOWANCE_MIN_MM = 0;
export const HOOK_ALLOWANCE_MAX_MM = 400;

/** Extra straight length per main bar for laps/anchorage beyond the clear span; 0 = none. */
export const DEFAULT_EXTRA_LENGTH_MM = 0;
export const EXTRA_LENGTH_MAX_MM = 2000;

export const MEMBER_LENGTH_MIN_M = 0.1;
export const MEMBER_LENGTH_MAX_M = 60;
/** Above this, a single beam/column run is unusually long for one member. */
export const BEAM_LENGTH_TYPICAL_MAX_M = 12;
export const COLUMN_LENGTH_TYPICAL_MAX_M = 6;

export const SECTION_DIM_MIN_MM = 75;
export const SECTION_DIM_MAX_MM = 3000;

export const SPACING_MIN_MM = 30;
export const SPACING_MAX_MM = 600;
export const SPACING_TYPICAL_MAX_MM = 400;

export const PANEL_DIM_MIN_M = 0.3;
export const PANEL_DIM_MAX_M = 20;

export const MAIN_BAR_COUNT_MIN = 1;
export const MAIN_BAR_COUNT_MAX = 60;
/** Fewer than this in a beam or column is structurally unusual. */
export const MAIN_BAR_COUNT_TYPICAL_MIN = 2;

export const NUMBER_OF_MEMBERS_MIN = 1;
export const NUMBER_OF_MEMBERS_MAX = 500;

export type MemberType = "beam" | "column" | "slab";

export const MEMBER_TYPE_LABELS: Record<MemberType, string> = {
  beam: "Beam",
  column: "Column",
  slab: "Slab",
};

/** Label for a member's secondary (shear) reinforcement, by member type. */
export const LINK_LABELS: Record<"beam" | "column", string> = {
  beam: "Stirrups",
  column: "Links",
};
