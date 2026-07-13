import { z } from "zod";
import {
  BULKING_FACTOR_MAX,
  BULKING_FACTOR_MIN,
  CEMENT_BAG_MAX_KG,
  CEMENT_BAG_MIN_KG,
  DEFAULT_BULKING_FACTOR,
  DEFAULT_CEMENT_BAG_KG,
  DEFAULT_CEMENT_DENSITY_KG_M3,
  DEFAULT_COARSE_AGG_DENSITY_KG_M3,
  DEFAULT_FINE_AGG_DENSITY_KG_M3,
  DENSITY_MAX_KG_M3,
  DENSITY_MIN_KG_M3,
  VOLUME_MAX_M3,
} from "./constants";

/**
 * Input validation for the concrete materials calculator.
 *
 * All numeric fields coerce from strings so the same schema validates raw
 * form values. Error messages are written for a site engineer, not a
 * programmer: they say what to enter and why the value was rejected.
 */

/** Builds a coerced number field with a human "that's not a number" message. */
function numberField(whatToEnter: string) {
  return z.coerce.number({
    error: `Enter ${whatToEnter} as a number: digits and a decimal point only.`,
  });
}

export const mixSelectionSchema = z.enum(
  ["class15", "class20", "class25", "class30", "custom"],
  { error: "Choose a mix class, or pick Custom to enter your own ratio." },
);
export type MixSelection = z.infer<typeof mixSelectionSchema>;

const ratioPartSchema = (material: string) =>
  numberField(`the ${material} part of the ratio`)
    .positive(`The ${material} part of the mix ratio must be greater than zero.`)
    .max(50, `A ${material} part above 50 isn't a workable mix ratio. Check the numbers.`);

export const concreteMaterialsInputSchema = z
  .object({
    /** Required wet (compacted, in-place) concrete volume, m³. */
    volumeM3: numberField("the concrete volume in m³")
      .positive("Enter the concrete volume in m³; it must be greater than zero.")
      .max(
        VOLUME_MAX_M3,
        `That's more than ${VOLUME_MAX_M3.toLocaleString("en-US")} m³ in one calculation. Split the work into separate pours.`,
      ),

    mixSelection: mixSelectionSchema,

    /** Only read when mixSelection is "custom". */
    customCement: ratioPartSchema("cement").optional(),
    customFine: ratioPartSchema("sand").optional(),
    customCoarse: ratioPartSchema("ballast").optional(),

    /** Cement bag mass, kg. */
    bagSizeKg: numberField("the cement bag mass in kg")
      .min(
        CEMENT_BAG_MIN_KG,
        `Cement bags below ${CEMENT_BAG_MIN_KG} kg aren't sold; the standard bag is 50 kg.`,
      )
      .max(
        CEMENT_BAG_MAX_KG,
        `Cement bags above ${CEMENT_BAG_MAX_KG} kg aren't sold; the standard bag is 50 kg.`,
      )
      .default(DEFAULT_CEMENT_BAG_KG),

    /** Dry-to-wet volume factor. */
    bulkingFactor: numberField("the bulking factor")
      .min(
        BULKING_FACTOR_MIN,
        "The bulking factor can't be below 1.0: dry loose materials always occupy more volume than compacted concrete.",
      )
      .max(
        BULKING_FACTOR_MAX,
        "A bulking factor above 2.0 isn't physically realistic; standard practice uses 1.52–1.57.",
      )
      .default(DEFAULT_BULKING_FACTOR),

    /** Material loose bulk densities, kg/m³. */
    cementDensityKgM3: densityField("cement").default(DEFAULT_CEMENT_DENSITY_KG_M3),
    fineAggDensityKgM3: densityField("sand").default(DEFAULT_FINE_AGG_DENSITY_KG_M3),
    coarseAggDensityKgM3: densityField("ballast").default(
      DEFAULT_COARSE_AGG_DENSITY_KG_M3,
    ),
  })
  .superRefine((data, ctx) => {
    if (data.mixSelection !== "custom") return;
    const parts: Array<[keyof typeof data, number | undefined, string]> = [
      ["customCement", data.customCement, "cement"],
      ["customFine", data.customFine, "sand"],
      ["customCoarse", data.customCoarse, "ballast"],
    ];
    for (const [key, value, material] of parts) {
      if (value === undefined) {
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: `Enter the ${material} part of your custom ratio (e.g. the "${material === "cement" ? "1" : material === "sand" ? "2" : "4"}" in 1:2:4).`,
        });
      }
    }
  });

function densityField(material: string) {
  return numberField(`the ${material} bulk density in kg/m³`)
    .min(
      DENSITY_MIN_KG_M3,
      `A ${material} bulk density below ${DENSITY_MIN_KG_M3} kg/m³ isn't physically realistic. Check the units (kg/m³, not t/m³).`,
    )
    .max(
      DENSITY_MAX_KG_M3,
      `A ${material} bulk density above ${DENSITY_MAX_KG_M3} kg/m³ isn't realistic for loose material. Check the value.`,
    );
}

export type ConcreteMaterialsInput = z.infer<typeof concreteMaterialsInputSchema>;

/** Default input values: what a first-time user sees pre-filled. */
export const concreteMaterialsDefaults = {
  volumeM3: "" as string, // the one field the user must supply
  mixSelection: "class20" as MixSelection,
  customCement: "1",
  customFine: "2",
  customCoarse: "4",
  bagSizeKg: String(DEFAULT_CEMENT_BAG_KG),
  bulkingFactor: String(DEFAULT_BULKING_FACTOR),
  cementDensityKgM3: String(DEFAULT_CEMENT_DENSITY_KG_M3),
  fineAggDensityKgM3: String(DEFAULT_FINE_AGG_DENSITY_KG_M3),
  coarseAggDensityKgM3: String(DEFAULT_COARSE_AGG_DENSITY_KG_M3),
};

/** The raw string shape the form works with before validation. */
export type ConcreteMaterialsFormValues = typeof concreteMaterialsDefaults;
