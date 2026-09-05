import { z } from "zod";
import {
  COVER_MAX_MM,
  COVER_MIN_MM,
  DEFAULT_COVER_MM,
  DEFAULT_EXTRA_LENGTH_MM,
  DEFAULT_HOOK_ALLOWANCE_MM,
  EXTRA_LENGTH_MAX_MM,
  HOOK_ALLOWANCE_MAX_MM,
  HOOK_ALLOWANCE_MIN_MM,
  MAIN_BAR_COUNT_MAX,
  MAIN_BAR_COUNT_MIN,
  MEMBER_LENGTH_MAX_M,
  MEMBER_LENGTH_MIN_M,
  NUMBER_OF_MEMBERS_MAX,
  NUMBER_OF_MEMBERS_MIN,
  PANEL_DIM_MAX_M,
  PANEL_DIM_MIN_M,
  SECTION_DIM_MAX_MM,
  SECTION_DIM_MIN_MM,
  SPACING_MAX_MM,
  SPACING_MIN_MM,
  STANDARD_BAR_DIAMETERS_MM,
} from "./constants";

/**
 * Input validation for the rebar takeoff calculator.
 *
 * All numeric fields coerce from strings so the same schema validates raw
 * form values. Error messages are written for a site engineer, not a
 * programmer: they say what to enter and why the value was rejected.
 */

function numberField(whatToEnter: string) {
  return z.coerce.number({
    error: `Enter ${whatToEnter} as a number: digits and a decimal point only.`,
  });
}

const DIAMETER_LABEL = STANDARD_BAR_DIAMETERS_MM.map((d) => `${d}`).join(", ");

/** A bar diameter, constrained to standard commercial sizes. */
function diameterField(whatFor: string) {
  return numberField(`the ${whatFor} diameter in mm`).refine(
    (d) => (STANDARD_BAR_DIAMETERS_MM as readonly number[]).includes(d),
    {
      error: `Choose a standard bar size for ${whatFor}: ${DIAMETER_LABEL} mm.`,
    },
  );
}

export const memberTypeSchema = z.enum(["beam", "column", "slab"], {
  error: "Choose a member type.",
});
export type MemberTypeSelection = z.infer<typeof memberTypeSchema>;

export const rebarTakeoffInputSchema = z
  .object({
    memberType: memberTypeSchema,

    /** How many identical members this schedule covers, e.g. 6 identical beams. */
    numberOfMembers: numberField("the number of identical members")
      .int("The number of members must be a whole number.")
      .min(
        NUMBER_OF_MEMBERS_MIN,
        "Enter at least 1 member.",
      )
      .max(
        NUMBER_OF_MEMBERS_MAX,
        `That's more than ${NUMBER_OF_MEMBERS_MAX} identical members in one schedule. Split the work into separate takeoffs.`,
      )
      .default(1),

    /** Concrete cover to reinforcement, mm. */
    coverMm: numberField("the concrete cover in mm")
      .min(COVER_MIN_MM, `Cover below ${COVER_MIN_MM} mm isn't practical to cast; check the value.`)
      .max(COVER_MAX_MM, `Cover above ${COVER_MAX_MM} mm is unusual; check the value.`)
      .default(DEFAULT_COVER_MM),

    // --- Beam / column fields ---
    memberLengthM: numberField("the member length in m")
      .min(MEMBER_LENGTH_MIN_M, "Enter the member length in m; it must be greater than zero.")
      .max(
        MEMBER_LENGTH_MAX_M,
        `That's more than ${MEMBER_LENGTH_MAX_M} m for a single member. Split it into shorter runs.`,
      )
      .optional(),
    widthMm: numberField("the section width in mm")
      .min(SECTION_DIM_MIN_MM, `Section width below ${SECTION_DIM_MIN_MM} mm isn't buildable; check the value.`)
      .max(SECTION_DIM_MAX_MM, `Section width above ${SECTION_DIM_MAX_MM} mm is unusual; check the value.`)
      .optional(),
    depthMm: numberField("the section depth in mm")
      .min(SECTION_DIM_MIN_MM, `Section depth below ${SECTION_DIM_MIN_MM} mm isn't buildable; check the value.`)
      .max(SECTION_DIM_MAX_MM, `Section depth above ${SECTION_DIM_MAX_MM} mm is unusual; check the value.`)
      .optional(),
    mainBarDiameterMm: diameterField("main bar").optional(),
    mainBarCount: numberField("the number of main bars")
      .int("The number of main bars must be a whole number.")
      .min(MAIN_BAR_COUNT_MIN, "Enter at least 1 main bar.")
      .max(MAIN_BAR_COUNT_MAX, `That's more than ${MAIN_BAR_COUNT_MAX} main bars; check the count.`)
      .optional(),
    linkDiameterMm: diameterField("link").optional(),
    linkSpacingMm: numberField("the link spacing in mm")
      .min(SPACING_MIN_MM, `Link spacing below ${SPACING_MIN_MM} mm is impractically close; check the value.`)
      .max(SPACING_MAX_MM, `Link spacing above ${SPACING_MAX_MM} mm is unusual; check the value.`)
      .optional(),
    hookAllowanceMm: numberField("the hook allowance in mm")
      .min(HOOK_ALLOWANCE_MIN_MM, "Hook allowance can't be negative.")
      .max(HOOK_ALLOWANCE_MAX_MM, `Hook allowance above ${HOOK_ALLOWANCE_MAX_MM} mm is unusual; check the value.`)
      .default(DEFAULT_HOOK_ALLOWANCE_MM),
    extraLengthMm: numberField("the extra length per main bar in mm")
      .min(0, "Extra length can't be negative.")
      .max(EXTRA_LENGTH_MAX_MM, `Extra length above ${EXTRA_LENGTH_MAX_MM} mm is unusual; check the value.`)
      .default(DEFAULT_EXTRA_LENGTH_MM),

    // --- Slab fields ---
    panelLengthM: numberField("the panel length in m")
      .min(PANEL_DIM_MIN_M, "Enter the panel length in m; it must be greater than zero.")
      .max(PANEL_DIM_MAX_M, `That's more than ${PANEL_DIM_MAX_M} m for a single panel. Split it into smaller panels.`)
      .optional(),
    panelWidthM: numberField("the panel width in m")
      .min(PANEL_DIM_MIN_M, "Enter the panel width in m; it must be greater than zero.")
      .max(PANEL_DIM_MAX_M, `That's more than ${PANEL_DIM_MAX_M} m for a single panel. Split it into smaller panels.`)
      .optional(),
    mainBarSpacingMm: numberField("the main bar spacing in mm")
      .min(SPACING_MIN_MM, `Spacing below ${SPACING_MIN_MM} mm is impractically close; check the value.`)
      .max(SPACING_MAX_MM, `Spacing above ${SPACING_MAX_MM} mm is unusual; check the value.`)
      .optional(),
    distBarDiameterMm: diameterField("distribution bar").optional(),
    distBarSpacingMm: numberField("the distribution bar spacing in mm")
      .min(SPACING_MIN_MM, `Spacing below ${SPACING_MIN_MM} mm is impractically close; check the value.`)
      .max(SPACING_MAX_MM, `Spacing above ${SPACING_MAX_MM} mm is unusual; check the value.`)
      .optional(),
  })
  .superRefine((data, ctx) => {
    const require = (
      key: keyof typeof data,
      label: string,
    ) => {
      if (data[key] === undefined) {
        ctx.addIssue({ code: "custom", path: [key], message: `Enter ${label}.` });
      }
    };

    if (data.memberType === "beam" || data.memberType === "column") {
      require("memberLengthM", "the member length");
      require("widthMm", "the section width");
      require("depthMm", "the section depth");
      require("mainBarDiameterMm", "the main bar diameter");
      require("mainBarCount", "the number of main bars");
      require("linkDiameterMm", "the link diameter");
      require("linkSpacingMm", "the link spacing");

      if (
        data.widthMm !== undefined &&
        data.depthMm !== undefined &&
        data.coverMm !== undefined &&
        data.linkDiameterMm !== undefined
      ) {
        const innerWidth = data.widthMm - 2 * data.coverMm;
        const innerDepth = data.depthMm - 2 * data.coverMm;
        if (innerWidth <= data.linkDiameterMm || innerDepth <= data.linkDiameterMm) {
          ctx.addIssue({
            code: "custom",
            path: ["coverMm"],
            message:
              "Cover and link diameter leave no room inside the section; reduce the cover or increase the section size.",
          });
        }
      }
    } else {
      require("panelLengthM", "the panel length");
      require("panelWidthM", "the panel width");
      require("mainBarDiameterMm", "the main bar diameter");
      require("mainBarSpacingMm", "the main bar spacing");
      require("distBarDiameterMm", "the distribution bar diameter");
      require("distBarSpacingMm", "the distribution bar spacing");
    }
  });

export type RebarTakeoffInput = z.infer<typeof rebarTakeoffInputSchema>;

/** Default input values: what a first-time user sees pre-filled. */
export const rebarTakeoffDefaults = {
  memberType: "beam" as MemberTypeSelection,
  numberOfMembers: "1",
  coverMm: String(DEFAULT_COVER_MM),
  memberLengthM: "4",
  widthMm: "230",
  depthMm: "450",
  mainBarDiameterMm: "16",
  mainBarCount: "4",
  linkDiameterMm: "8",
  linkSpacingMm: "150",
  hookAllowanceMm: String(DEFAULT_HOOK_ALLOWANCE_MM),
  extraLengthMm: String(DEFAULT_EXTRA_LENGTH_MM),
  panelLengthM: "6",
  panelWidthM: "4",
  mainBarSpacingMm: "200",
  distBarDiameterMm: "10",
  distBarSpacingMm: "250",
};

export type RebarTakeoffFormValues = typeof rebarTakeoffDefaults;
