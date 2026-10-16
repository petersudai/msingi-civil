import { z } from "zod";
import { MAIN_STEEL_GRADES_MPA } from "../beam-design/constants";
import { omitKeys } from "../omit-keys";
import { isStandardBarDiameter, STANDARD_BAR_DIAMETERS_MM } from "../reinforcement";
import { COLUMN_CODES, DEFAULT_COLUMN_CODE_ID, getColumnCode } from "./codes";
import {
  AXIAL_MAX_KN,
  BARS_PER_FACE_MAX,
  BARS_PER_FACE_MIN,
  BETA_MAX,
  BETA_MIN,
  COLUMN_DIM_MAX_MM,
  COLUMN_DIM_MIN_MM,
  COVER_MAX_MM,
  COVER_MIN_MM,
  HEIGHT_MAX_M,
  HEIGHT_MIN_M,
  MOMENT_MAX_KNM,
  type CodeId,
  type EndCondition,
} from "./constants";

/**
 * Input validation for the RC column check.
 *
 * Fields are string-coercible so the same schema validates raw form values.
 * `parseColumnDesignInput` drops fields that don't apply (a custom effective
 * length factor unless chosen, Eurocode-only parameters under BS 8110) before
 * validating, so a stale invalid value in a hidden field can never block a
 * result.
 */

function numberField(whatToEnter: string) {
  return z.coerce.number({
    error: `Enter ${whatToEnter} as a number: digits and a decimal point only.`,
  });
}

function signedMoment(whatFor: string) {
  return numberField(`the ${whatFor} in kNm`).refine((n) => Math.abs(n) <= MOMENT_MAX_KNM, {
    error: `A moment above ${MOMENT_MAX_KNM.toLocaleString("en-US")} kNm is outside what this tool covers; check the units.`,
  });
}

const DIAMETER_LIST = STANDARD_BAR_DIAMETERS_MM.join(", ");

function barCountField(whatFor: string) {
  return numberField(whatFor)
    .int("The number of bars must be a whole number.")
    .min(BARS_PER_FACE_MIN, `Use at least ${BARS_PER_FACE_MIN} bars; a rectangular column needs a bar in every corner.`)
    .max(BARS_PER_FACE_MAX, `More than ${BARS_PER_FACE_MAX} bars along one face is unusual; use a larger bar size.`);
}

export const columnCodeIdSchema = z.enum(["ec2", "bs8110"], { error: "Choose a design code." });
export const endConditionSchema = z.enum(["restrained2", "restrained1", "pinned", "custom"], {
  error: "Choose the end conditions.",
});

export const columnDesignInputSchema = z
  .object({
    code: columnCodeIdSchema,

    // Section
    bMm: numberField("the column width in mm")
      .min(COLUMN_DIM_MIN_MM, `A column narrower than ${COLUMN_DIM_MIN_MM} mm isn't practical; check the value.`)
      .max(COLUMN_DIM_MAX_MM, `A column wider than ${COLUMN_DIM_MAX_MM} mm is outside what this tool covers; check the value.`),
    hMm: numberField("the column depth in mm")
      .min(COLUMN_DIM_MIN_MM, `A column shallower than ${COLUMN_DIM_MIN_MM} mm isn't practical; check the value.`)
      .max(COLUMN_DIM_MAX_MM, `A column deeper than ${COLUMN_DIM_MAX_MM} mm is outside what this tool covers; check the value.`),
    coverMm: numberField("the cover to links in mm")
      .min(COVER_MIN_MM, `Cover below ${COVER_MIN_MM} mm isn't practical to cast; check the value.`)
      .max(COVER_MAX_MM, `Cover above ${COVER_MAX_MM} mm is unusual; check the value.`),

    // Bars
    mainBarDiameterMm: numberField("the main bar diameter in mm").refine(isStandardBarDiameter, {
      error: `Choose a standard bar size for the main bars: ${DIAMETER_LIST} mm.`,
    }),
    barsAcrossB: barCountField("the number of bars across the width"),
    barsAcrossH: barCountField("the number of bars along the depth"),
    linkDiameterMm: numberField("the link diameter in mm").refine(isStandardBarDiameter, {
      error: `Choose a standard bar size for the links: ${DIAMETER_LIST} mm.`,
    }),

    // Height and restraint
    heightM: numberField("the column height in m")
      .min(HEIGHT_MIN_M, `A column shorter than ${HEIGHT_MIN_M} m isn't covered; check the value.`)
      .max(HEIGHT_MAX_M, `A column taller than ${HEIGHT_MAX_M} m is outside what this tool covers; check the value.`),
    endCondition: endConditionSchema,
    betaCustom: numberField("the effective length factor")
      .min(BETA_MIN, `An effective length factor below ${BETA_MIN} isn't realistic for a braced column.`)
      .max(BETA_MAX, `A factor above ${BETA_MAX} means the column is not braced, which this tool doesn't cover.`)
      .optional(),

    // Actions
    nEdKn: numberField("the design axial load in kN")
      .positive("Enter the design axial load in kN; it must be greater than zero. Columns in tension aren't covered.")
      .max(AXIAL_MAX_KN, `A load above ${AXIAL_MAX_KN.toLocaleString("en-US")} kN is outside what this tool covers; check the units.`),
    mTopKnm: signedMoment("moment at the top of the column"),
    mBotKnm: signedMoment("moment at the bottom of the column"),

    // Materials
    concreteStrengthMpa: numberField("the concrete strength"),
    fyMpa: numberField("the main steel strength").refine(
      (n) => (MAIN_STEEL_GRADES_MPA as readonly number[]).includes(n),
      { error: `Choose a main steel strength: ${MAIN_STEEL_GRADES_MPA.join(" or ")} N/mm².` },
    ),

    // Eurocode 2 parameters
    alphaCc: numberField("alpha_cc")
      .min(0.5, "alpha_cc below 0.5 isn't realistic; check the value.")
      .max(1.0, "alpha_cc can't exceed 1.0.")
      .optional(),
    gammaC: numberField("the concrete partial factor")
      .min(1.0, "The concrete partial factor can't be below 1.0.")
      .max(2.0, "A concrete partial factor above 2.0 is unusual; check the value.")
      .optional(),
    gammaS: numberField("the steel partial factor")
      .min(1.0, "The steel partial factor can't be below 1.0.")
      .max(1.5, "A steel partial factor above 1.5 is unusual; check the value.")
      .optional(),
    creepRatio: numberField("the effective creep ratio")
      .min(0, "The effective creep ratio can't be negative.")
      .max(4, "An effective creep ratio above 4 is unusual; check the value.")
      .optional(),
  })
  .superRefine((data, ctx) => {
    const need = (key: keyof typeof data, label: string) => {
      if (data[key] === undefined) {
        ctx.addIssue({ code: "custom", path: [key], message: `Enter ${label}.` });
      }
    };
    if (data.endCondition === "custom") need("betaCustom", "the effective length factor");
    if (data.code === "ec2") {
      need("alphaCc", "alpha_cc");
      need("gammaC", "the concrete partial factor");
      need("gammaS", "the steel partial factor");
      need("creepRatio", "the effective creep ratio");
    }

    const code = getColumnCode(data.code);
    if (!code.concreteGrades.some((g) => g.value === data.concreteStrengthMpa)) {
      ctx.addIssue({
        code: "custom",
        path: ["concreteStrengthMpa"],
        message: `Choose a concrete grade from the ${code.shortName} list (${code.concreteGrades.map((g) => g.label).join(", ")}).`,
      });
    }

    const dPrime = data.coverMm + data.linkDiameterMm + data.mainBarDiameterMm / 2;
    if (data.bMm - 2 * dPrime < 20 || data.hMm - 2 * dPrime < 20) {
      ctx.addIssue({
        code: "custom",
        path: ["coverMm"],
        message: `Cover and bar sizes leave no room inside the section (bar centres sit ${Math.round(dPrime)} mm from each face). Reduce the cover or bar sizes, or enlarge the column.`,
      });
    }
  });

export type ColumnDesignInput = z.infer<typeof columnDesignInputSchema>;

const EC2_ONLY_FIELDS = ["alphaCc", "gammaC", "gammaS", "creepRatio"] as const;

export type ColumnDesignFormValues = Record<keyof ColumnDesignInput, string>;

/**
 * The one way to turn raw form values into a validated input. Drops fields
 * that don't apply to the current choices before validating.
 */
export function parseColumnDesignInput(values: Partial<ColumnDesignFormValues>) {
  const inactive: string[] = [];
  if (values.endCondition !== "custom") inactive.push("betaCustom");
  if (values.code === "bs8110") inactive.push(...EC2_ONLY_FIELDS);
  return columnDesignInputSchema.safeParse(omitKeys(values, inactive));
}

/** The code-dependent defaults as form strings, applied when the code changes. */
export function columnCodeDefaultsForForm(id: CodeId) {
  const d = getColumnCode(id).defaults;
  return {
    concreteStrengthMpa: String(d.concreteStrength),
    fyMpa: String(d.fy),
    alphaCc: String(d.alphaCc),
    gammaC: String(d.gammaC),
    gammaS: String(d.gammaS),
    creepRatio: String(d.creepRatio),
  };
}

/** What a first-time user sees: a short 300 x 400 column with 8 bars under Eurocode 2. */
export const columnDesignDefaults: ColumnDesignFormValues = {
  code: DEFAULT_COLUMN_CODE_ID,
  bMm: "300",
  hMm: "400",
  coverMm: "30",
  mainBarDiameterMm: "20",
  barsAcrossB: "3",
  barsAcrossH: "3",
  linkDiameterMm: "8",
  heightM: "3.5",
  endCondition: "restrained1" satisfies EndCondition,
  betaCustom: "0.85",
  nEdKn: "1200",
  mTopKnm: "60",
  mBotKnm: "30",
  ...columnCodeDefaultsForForm(DEFAULT_COLUMN_CODE_ID),
};

export { COLUMN_CODES };
