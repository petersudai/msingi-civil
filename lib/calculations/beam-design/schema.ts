import { z } from "zod";
import { omitKeys } from "../omit-keys";
import { isStandardBarDiameter, STANDARD_BAR_DIAMETERS_MM } from "../reinforcement";
import {
  COVER_MAX_MM,
  COVER_MIN_MM,
  LINK_LEG_OPTIONS,
  LINK_STEEL_GRADES_MPA,
  LOAD_MAX_KN_PER_M,
  MAIN_STEEL_GRADES_MPA,
  MOMENT_MAX_KNM,
  SECTION_DEPTH_MAX_MM,
  SECTION_DEPTH_MIN_MM,
  SECTION_WIDTH_MAX_MM,
  SECTION_WIDTH_MIN_MM,
  SHEAR_MAX_KN,
  SPAN_MAX_M,
  SPAN_MIN_M,
  type CodeId,
} from "./constants";
import { BEAM_CODES, DEFAULT_CODE_ID, getBeamCode } from "./codes";

/**
 * Input validation for the RC beam design tool.
 *
 * Fields are string-coercible so the same schema validates raw form values.
 * Which fields matter depends on the mode (loads from span or direct M and V)
 * and the code (Eurocode-only parameters), so `parseBeamDesignInput` drops the
 * inactive ones first: a stale invalid value in a hidden field can never block
 * a result.
 */

function numberField(whatToEnter: string) {
  return z.coerce.number({
    error: `Enter ${whatToEnter} as a number: digits and a decimal point only.`,
  });
}

const DIAMETER_LIST = STANDARD_BAR_DIAMETERS_MM.join(", ");

function diameterField(whatFor: string) {
  return numberField(`the ${whatFor} diameter in mm`).refine(isStandardBarDiameter, {
    error: `Choose a standard bar size for ${whatFor}: ${DIAMETER_LIST} mm.`,
  });
}

export const codeIdSchema = z.enum(["ec2", "bs8110"], { error: "Choose a design code." });
export const loadModeSchema = z.enum(["udl", "direct"], {
  error: "Choose how the loads are entered.",
});
export const supportSchema = z.enum(["simple", "cantilever"], {
  error: "Choose the support condition.",
});
export const selfWeightSchema = z.enum(["yes", "no"]);

export const beamDesignInputSchema = z
  .object({
    code: codeIdSchema,
    loadMode: loadModeSchema,

    spanM: numberField("the beam span in m")
      .min(SPAN_MIN_M, "Enter the beam span in m; it must be greater than zero.")
      .max(SPAN_MAX_M, `A span above ${SPAN_MAX_M} m is outside what this tool covers; check the value.`),

    // Loads from span and UDL
    support: supportSchema.optional(),
    selfWeight: selfWeightSchema.optional(),
    deadKnm: numberField("the dead load in kN/m")
      .min(0, "Dead load can't be negative.")
      .max(LOAD_MAX_KN_PER_M, `Dead load above ${LOAD_MAX_KN_PER_M} kN/m isn't realistic for a beam; check the units.`)
      .optional(),
    liveKnm: numberField("the imposed load in kN/m")
      .min(0, "Imposed load can't be negative.")
      .max(LOAD_MAX_KN_PER_M, `Imposed load above ${LOAD_MAX_KN_PER_M} kN/m isn't realistic for a beam; check the units.`)
      .optional(),
    gammaG: numberField("the permanent load factor")
      .min(1.0, "The permanent load factor can't be below 1.0.")
      .max(2.0, "A permanent load factor above 2.0 is unusual; check the value.")
      .optional(),
    gammaQ: numberField("the imposed load factor")
      .min(1.0, "The imposed load factor can't be below 1.0.")
      .max(2.5, "An imposed load factor above 2.5 is unusual; check the value.")
      .optional(),
    densityKnM3: numberField("the concrete unit weight in kN/m³")
      .min(20, "Reinforced concrete weighs about 24 to 25 kN/m³; below 20 isn't realistic.")
      .max(30, "Reinforced concrete weighs about 24 to 25 kN/m³; above 30 isn't realistic.")
      .optional(),

    // Direct design actions
    momentKnm: numberField("the design moment in kNm")
      .positive("Enter the design moment in kNm; it must be greater than zero.")
      .max(MOMENT_MAX_KNM, `A moment above ${MOMENT_MAX_KNM.toLocaleString("en-US")} kNm is outside what this tool covers; check the units.`)
      .optional(),
    shearKn: numberField("the design shear in kN")
      .positive("Enter the design shear force in kN; it must be greater than zero.")
      .max(SHEAR_MAX_KN, `A shear above ${SHEAR_MAX_KN.toLocaleString("en-US")} kN is outside what this tool covers; check the units.`)
      .optional(),

    // Section
    bMm: numberField("the beam width in mm")
      .min(SECTION_WIDTH_MIN_MM, `A beam narrower than ${SECTION_WIDTH_MIN_MM} mm isn't buildable; check the value.`)
      .max(SECTION_WIDTH_MAX_MM, `A beam wider than ${SECTION_WIDTH_MAX_MM} mm is more of a slab strip; check the value.`),
    hMm: numberField("the overall beam depth in mm")
      .min(SECTION_DEPTH_MIN_MM, `A beam shallower than ${SECTION_DEPTH_MIN_MM} mm isn't practical; check the value.`)
      .max(SECTION_DEPTH_MAX_MM, `A beam deeper than ${SECTION_DEPTH_MAX_MM} mm is outside what this tool covers; check the value.`),
    coverMm: numberField("the cover to links in mm")
      .min(COVER_MIN_MM, `Cover below ${COVER_MIN_MM} mm isn't practical to cast; check the value.`)
      .max(COVER_MAX_MM, `Cover above ${COVER_MAX_MM} mm is unusual; check the value.`),
    mainBarDiameterMm: diameterField("main bar"),
    linkDiameterMm: diameterField("link"),
    linkLegs: numberField("the number of link legs").refine(
      (n) => (LINK_LEG_OPTIONS as readonly number[]).includes(n),
      { error: `Choose ${LINK_LEG_OPTIONS.join(", ")} link legs.` },
    ),

    // Materials
    concreteStrengthMpa: numberField("the concrete strength"),
    fyMpa: numberField("the main steel strength").refine(
      (n) => (MAIN_STEEL_GRADES_MPA as readonly number[]).includes(n),
      { error: `Choose a main steel strength: ${MAIN_STEEL_GRADES_MPA.join(" or ")} N/mm².` },
    ),
    fyvMpa: numberField("the link steel strength").refine(
      (n) => (LINK_STEEL_GRADES_MPA as readonly number[]).includes(n),
      { error: `Choose a link steel strength: ${LINK_STEEL_GRADES_MPA.join(", ")} N/mm².` },
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
  })
  .superRefine((data, ctx) => {
    const need = (key: keyof typeof data, label: string) => {
      if (data[key] === undefined) {
        ctx.addIssue({ code: "custom", path: [key], message: `Enter ${label}.` });
      }
    };

    if (data.loadMode === "udl") {
      need("support", "the support condition");
      need("selfWeight", "whether to include self-weight");
      need("deadKnm", "the dead load");
      need("liveKnm", "the imposed load");
      need("gammaG", "the permanent load factor");
      need("gammaQ", "the imposed load factor");
      need("densityKnM3", "the concrete unit weight");
      if (data.deadKnm !== undefined && data.liveKnm !== undefined) {
        const noSelfWeight = data.selfWeight === "no";
        if (data.deadKnm + data.liveKnm <= 0 && noSelfWeight) {
          ctx.addIssue({
            code: "custom",
            path: ["deadKnm"],
            message: "The total load is zero. Enter a dead or imposed load, or include self-weight.",
          });
        }
      }
    } else {
      need("momentKnm", "the design moment");
      need("shearKn", "the design shear");
    }

    if (data.code === "ec2") {
      need("alphaCc", "alpha_cc");
      need("gammaC", "the concrete partial factor");
      need("gammaS", "the steel partial factor");
    }

    const code = getBeamCode(data.code);
    if (!code.concreteGrades.some((g) => g.value === data.concreteStrengthMpa)) {
      ctx.addIssue({
        code: "custom",
        path: ["concreteStrengthMpa"],
        message: `Choose a concrete grade from the ${code.shortName} list (${code.concreteGrades.map((g) => g.label).join(", ")}).`,
      });
    }

    const dPrime = data.coverMm + data.linkDiameterMm + data.mainBarDiameterMm / 2;
    const d = data.hMm - dPrime;
    if (d - dPrime < 50) {
      ctx.addIssue({
        code: "custom",
        path: ["hMm"],
        message: `Cover and bar sizes leave no usable depth (effective depth would be ${Math.round(d)} mm). Increase the beam depth or reduce the cover or bar sizes.`,
      });
    }
  });

export type BeamDesignInput = z.infer<typeof beamDesignInputSchema>;

/** Fields that only apply when loads come from span and UDL. */
const UDL_ONLY_FIELDS = [
  "support",
  "selfWeight",
  "deadKnm",
  "liveKnm",
  "gammaG",
  "gammaQ",
  "densityKnM3",
] as const;
/** Fields that only apply when M and V are entered directly. */
const DIRECT_ONLY_FIELDS = ["momentKnm", "shearKn"] as const;
/** Eurocode-only parameter overrides. */
const EC2_ONLY_FIELDS = ["alphaCc", "gammaC", "gammaS"] as const;

export type BeamDesignFormValues = Record<keyof BeamDesignInput, string>;

/**
 * The one way to turn raw form values into a validated input. Drops fields
 * that don't apply to the current mode and code before validating.
 */
export function parseBeamDesignInput(values: Partial<BeamDesignFormValues>) {
  const inactive: string[] = [];
  if (values.loadMode === "direct") inactive.push(...UDL_ONLY_FIELDS);
  else inactive.push(...DIRECT_ONLY_FIELDS);
  if (values.code === "bs8110") inactive.push(...EC2_ONLY_FIELDS);
  return beamDesignInputSchema.safeParse(omitKeys(values, inactive));
}

/** The code-dependent defaults as form strings, applied when the code changes. */
export function codeDefaultsForForm(id: CodeId) {
  const d = getBeamCode(id).defaults;
  return {
    concreteStrengthMpa: String(d.concreteStrength),
    fyMpa: String(d.fy),
    fyvMpa: String(d.fyv),
    gammaG: String(d.gammaG),
    gammaQ: String(d.gammaQ),
    densityKnM3: String(d.densityKnM3),
    alphaCc: String(d.alphaCc),
    gammaC: String(d.gammaC),
    gammaS: String(d.gammaS),
  };
}

/** What a first-time user sees: a typical 5 m simply supported beam under Eurocode 2. */
export const beamDesignDefaults: BeamDesignFormValues = {
  code: DEFAULT_CODE_ID,
  loadMode: "udl",
  spanM: "5",
  support: "simple",
  selfWeight: "yes",
  deadKnm: "12",
  liveKnm: "8",
  momentKnm: "150",
  shearKn: "100",
  bMm: "250",
  hMm: "500",
  coverMm: "30",
  mainBarDiameterMm: "20",
  linkDiameterMm: "8",
  linkLegs: "2",
  ...codeDefaultsForForm(DEFAULT_CODE_ID),
};

export { BEAM_CODES };
