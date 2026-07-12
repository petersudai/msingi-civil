import type {
  Assumption,
  CalcQuantity,
  CalcResultBase,
  CalcWarning,
  SourceReference,
  WorkingStep,
} from "../types";
import { formatNumber, formatTrimmed } from "../format";
import {
  BULKING_FACTOR_TYPICAL_MAX,
  BULKING_FACTOR_TYPICAL_MIN,
  DEFAULT_CEMENT_BAG_KG,
  getMixClass,
  type MixRatio,
  VOLUME_LARGE_POUR_M3,
  VOLUME_TINY_M3,
} from "./constants";
import type { ConcreteMaterialsInput } from "./schema";

/**
 * Concrete material takeoff by the dry-volume (nominal mix) method.
 *
 * Method
 * ------
 * 1. Convert the required wet (in-place) volume to the loose dry volume of
 *    materials that must be batched:  V_dry = V_wet × k   (k ≈ 1.54).
 * 2. Split V_dry between cement, fine and coarse aggregate in proportion to
 *    the volumetric mix ratio (e.g. 1:2:4 → cement gets 1/7 of V_dry).
 * 3. Convert each material volume to mass with its loose bulk density, and
 *    cement mass to bags.
 *
 * This is the standard estimating method for volumetric (nominal) mixes used
 * throughout East African practice. It is a takeoff aid — it does not design
 * the mix, and it says nothing about strength compliance of what is actually
 * batched on site.
 */

/** Raw numeric outputs at full precision — the testable surface. */
export interface ConcreteMaterialsOutputs {
  wetVolumeM3: number;
  dryVolumeM3: number;
  totalParts: number;
  ratio: MixRatio;
  cement: {
    volumeM3: number;
    massKg: number;
    bagsExact: number;
    /** Rounded up to whole bags for purchasing. */
    bagsToBuy: number;
  };
  fineAggregate: {
    volumeM3: number;
    massKg: number;
    tonnes: number;
  };
  coarseAggregate: {
    volumeM3: number;
    massKg: number;
    tonnes: number;
  };
}

export interface ConcreteMaterialsResult extends CalcResultBase {
  outputs: ConcreteMaterialsOutputs;
}

/** Resolve the effective mix ratio from the validated input. */
export function resolveRatio(input: ConcreteMaterialsInput): MixRatio {
  if (input.mixSelection === "custom") {
    // The schema guarantees these are present when mixSelection is "custom";
    // this guard keeps the engine safe if called directly with a bad object.
    const { customCement, customFine, customCoarse } = input;
    if (
      customCement === undefined ||
      customFine === undefined ||
      customCoarse === undefined
    ) {
      throw new Error("Custom mix selected but ratio parts are missing.");
    }
    return { cement: customCement, fine: customFine, coarse: customCoarse };
  }
  return getMixClass(input.mixSelection).ratio;
}

export function calculateConcreteMaterials(
  input: ConcreteMaterialsInput,
): ConcreteMaterialsResult {
  // The engine re-asserts the physical invariants the schema already checks,
  // so it is safe when called from anywhere (API route, CLI, tests).
  if (!(input.volumeM3 > 0)) {
    throw new Error("Concrete volume must be greater than zero.");
  }
  if (!(input.bulkingFactor >= 1)) {
    throw new Error("Bulking factor must be at least 1.0.");
  }

  const ratio = resolveRatio(input);
  const totalParts = ratio.cement + ratio.fine + ratio.coarse;

  const wetVolumeM3 = input.volumeM3;
  const dryVolumeM3 = wetVolumeM3 * input.bulkingFactor;

  const cementVolumeM3 = (dryVolumeM3 * ratio.cement) / totalParts;
  const cementMassKg = cementVolumeM3 * input.cementDensityKgM3;
  const bagsExact = cementMassKg / input.bagSizeKg;
  const bagsToBuy = Math.ceil(bagsExact);

  const fineVolumeM3 = (dryVolumeM3 * ratio.fine) / totalParts;
  const fineMassKg = fineVolumeM3 * input.fineAggDensityKgM3;

  const coarseVolumeM3 = (dryVolumeM3 * ratio.coarse) / totalParts;
  const coarseMassKg = coarseVolumeM3 * input.coarseAggDensityKgM3;

  const outputs: ConcreteMaterialsOutputs = {
    wetVolumeM3,
    dryVolumeM3,
    totalParts,
    ratio,
    cement: {
      volumeM3: cementVolumeM3,
      massKg: cementMassKg,
      bagsExact,
      bagsToBuy,
    },
    fineAggregate: {
      volumeM3: fineVolumeM3,
      massKg: fineMassKg,
      tonnes: fineMassKg / 1000,
    },
    coarseAggregate: {
      volumeM3: coarseVolumeM3,
      massKg: coarseMassKg,
      tonnes: coarseMassKg / 1000,
    },
  };

  return {
    methodology: "Dry-volume method for nominal (volumetric) mixes",
    outputs,
    quantities: buildQuantities(input, outputs),
    steps: buildSteps(input, outputs),
    assumptions: buildAssumptions(input),
    warnings: buildWarnings(input, outputs),
    basis: BASIS,
  };
}

/** Ratio as display text, e.g. "1 : 2 : 4". */
export function ratioLabel(ratio: MixRatio): string {
  return [ratio.cement, ratio.fine, ratio.coarse]
    .map((p) => formatTrimmed(p, 2))
    .join(" : ");
}

function buildQuantities(
  input: ConcreteMaterialsInput,
  o: ConcreteMaterialsOutputs,
): CalcQuantity[] {
  return [
    {
      label: "Cement",
      value: formatNumber(o.cement.bagsToBuy, 0),
      unit: `bags × ${formatTrimmed(input.bagSizeKg, 1)} kg`,
      emphasis: true,
      note: `${formatNumber(o.cement.bagsExact, 2)} bags exact (${formatNumber(o.cement.massKg, 0)} kg) — rounded up for purchasing`,
    },
    {
      label: "Sand (fine aggregate)",
      value: formatNumber(o.fineAggregate.tonnes, 2),
      unit: "tonnes",
      emphasis: true,
      note: `${formatNumber(o.fineAggregate.volumeM3, 2)} m³ loose volume`,
    },
    {
      label: "Ballast (coarse aggregate)",
      value: formatNumber(o.coarseAggregate.tonnes, 2),
      unit: "tonnes",
      emphasis: true,
      note: `${formatNumber(o.coarseAggregate.volumeM3, 2)} m³ loose volume`,
    },
    {
      label: "Dry volume of materials",
      value: formatNumber(o.dryVolumeM3, 2),
      unit: "m³",
    },
    {
      label: "Cement mass",
      value: formatNumber(o.cement.massKg, 0),
      unit: "kg",
    },
    {
      label: "Sand mass",
      value: formatNumber(o.fineAggregate.massKg, 0),
      unit: "kg",
    },
    {
      label: "Ballast mass",
      value: formatNumber(o.coarseAggregate.massKg, 0),
      unit: "kg",
    },
  ];
}

function buildSteps(
  input: ConcreteMaterialsInput,
  o: ConcreteMaterialsOutputs,
): WorkingStep[] {
  const r = o.ratio;
  const n = formatTrimmed(o.totalParts, 2);
  return [
    {
      title: "Dry volume of loose materials",
      formula: "V_dry = V_wet × k",
      substitution: `V_dry = ${formatNumber(o.wetVolumeM3, 2)} m³ × ${formatTrimmed(input.bulkingFactor, 3)}`,
      result: `${formatNumber(o.dryVolumeM3, 3)} m³`,
      note: "k covers the volume lost when loose materials consolidate into compacted concrete.",
    },
    {
      title: "Sum of mix ratio parts",
      formula: "n = c + f + a",
      substitution: `n = ${formatTrimmed(r.cement, 2)} + ${formatTrimmed(r.fine, 2)} + ${formatTrimmed(r.coarse, 2)}`,
      result: n,
      note: `Mix ratio ${ratioLabel(r)} (cement : sand : ballast, by volume).`,
    },
    {
      title: "Cement volume",
      formula: "V_c = V_dry × c ⁄ n",
      substitution: `V_c = ${formatNumber(o.dryVolumeM3, 3)} × ${formatTrimmed(r.cement, 2)} ⁄ ${n}`,
      result: `${formatNumber(o.cement.volumeM3, 3)} m³`,
    },
    {
      title: "Cement mass and bags",
      formula: "m_c = V_c × cement density ;  bags = m_c ⁄ bag mass",
      substitution: `m_c = ${formatNumber(o.cement.volumeM3, 3)} × ${formatNumber(input.cementDensityKgM3, 0)} = ${formatNumber(o.cement.massKg, 1)} kg ;  bags = ${formatNumber(o.cement.massKg, 1)} ⁄ ${formatTrimmed(input.bagSizeKg, 1)}`,
      result: `${formatNumber(o.cement.bagsExact, 2)} bags → buy ${formatNumber(o.cement.bagsToBuy, 0)}`,
      note: "Bags are rounded up — you can't buy a fraction of a bag.",
    },
    {
      title: "Sand (fine aggregate) volume",
      formula: "V_f = V_dry × f ⁄ n",
      substitution: `V_f = ${formatNumber(o.dryVolumeM3, 3)} × ${formatTrimmed(r.fine, 2)} ⁄ ${n}`,
      result: `${formatNumber(o.fineAggregate.volumeM3, 3)} m³`,
    },
    {
      title: "Sand mass",
      formula: "m_f = V_f × sand density",
      substitution: `m_f = ${formatNumber(o.fineAggregate.volumeM3, 3)} × ${formatNumber(input.fineAggDensityKgM3, 0)}`,
      result: `${formatNumber(o.fineAggregate.massKg, 0)} kg  (${formatNumber(o.fineAggregate.tonnes, 2)} t)`,
    },
    {
      title: "Ballast (coarse aggregate) volume",
      formula: "V_a = V_dry × a ⁄ n",
      substitution: `V_a = ${formatNumber(o.dryVolumeM3, 3)} × ${formatTrimmed(r.coarse, 2)} ⁄ ${n}`,
      result: `${formatNumber(o.coarseAggregate.volumeM3, 3)} m³`,
    },
    {
      title: "Ballast mass",
      formula: "m_a = V_a × ballast density",
      substitution: `m_a = ${formatNumber(o.coarseAggregate.volumeM3, 3)} × ${formatNumber(input.coarseAggDensityKgM3, 0)}`,
      result: `${formatNumber(o.coarseAggregate.massKg, 0)} kg  (${formatNumber(o.coarseAggregate.tonnes, 2)} t)`,
    },
  ];
}

function buildAssumptions(input: ConcreteMaterialsInput): Assumption[] {
  const assumptions: Assumption[] = [
    {
      label: "Bulking factor (dry ÷ wet volume)",
      value: formatTrimmed(input.bulkingFactor, 3),
      source: "Standard estimating practice: 1.52–1.57 for nominal mixes",
    },
    {
      label: "Cement bulk density",
      value: `${formatNumber(input.cementDensityKgM3, 0)} kg/m³`,
      source: "Loose OPC; a 50 kg bag ≈ 0.035 m³",
    },
    {
      label: "Sand bulk density",
      value: `${formatNumber(input.fineAggDensityKgM3, 0)} kg/m³`,
      source: "Dry-loose river sand, typical 1,500–1,700",
    },
    {
      label: "Ballast bulk density",
      value: `${formatNumber(input.coarseAggDensityKgM3, 0)} kg/m³`,
      source: "Loose crushed stone, typical 1,450–1,550",
    },
    {
      label: "Cement bag mass",
      value: `${formatTrimmed(input.bagSizeKg, 1)} kg`,
      source:
        input.bagSizeKg === DEFAULT_CEMENT_BAG_KG
          ? "Standard bag in the Kenyan market"
          : "User override",
    },
    {
      label: "Batching",
      value: "By volume (nominal mix)",
      source: "Quantities assume gauge-box or wheelbarrow batching by volume",
    },
    {
      label: "Wastage",
      value: "Not included",
      source: "Add a site wastage allowance separately (typically 3–5%)",
    },
  ];
  return assumptions;
}

function buildWarnings(
  input: ConcreteMaterialsInput,
  o: ConcreteMaterialsOutputs,
): CalcWarning[] {
  const warnings: CalcWarning[] = [];

  if (input.volumeM3 > VOLUME_LARGE_POUR_M3) {
    warnings.push({
      level: "notice",
      message: `${formatNumber(input.volumeM3, 1)} m³ is a large pour — ready-mix supply may be more economical and gives better quality control than site batching.`,
    });
  }
  if (input.volumeM3 < VOLUME_TINY_M3) {
    warnings.push({
      level: "notice",
      message: `${formatNumber(input.volumeM3, 3)} m³ is a very small volume — the quantities below round to less than a single bag mix.`,
    });
  }
  if (
    input.bulkingFactor < BULKING_FACTOR_TYPICAL_MIN ||
    input.bulkingFactor > BULKING_FACTOR_TYPICAL_MAX
  ) {
    warnings.push({
      level: "caution",
      message: `Bulking factor ${formatTrimmed(input.bulkingFactor, 3)} is outside the usual ${BULKING_FACTOR_TYPICAL_MIN}–${BULKING_FACTOR_TYPICAL_MAX} range — quantities will differ from standard takeoff figures.`,
    });
  }
  if (o.ratio.fine > o.ratio.coarse) {
    warnings.push({
      level: "caution",
      message: `The mix has more sand than ballast (${ratioLabel(o.ratio)}) — unusual for structural concrete. Check the ratio is in cement : sand : ballast order.`,
    });
  }
  if (o.ratio.cement !== 1) {
    warnings.push({
      level: "notice",
      message: `Ratio entered with cement part ${formatTrimmed(o.ratio.cement, 2)} (not 1). That's fine — it is equivalent to 1 : ${formatTrimmed(o.ratio.fine / o.ratio.cement, 2)} : ${formatTrimmed(o.ratio.coarse / o.ratio.cement, 2)}.`,
    });
  }

  return warnings;
}

/** Method and practice references for the basis footer. */
const BASIS: SourceReference[] = [
  {
    label: "Dry-volume method",
    note: "Standard quantity-takeoff practice for volumetric mixes (dry volume = 1.54 × wet volume), as used in East African and Commonwealth estimating references.",
  },
  {
    label: "Nominal mix classes — Kenyan practice",
    note: "Class 15 (1:3:6), Class 20 (1:2:4), Class 25 (1:1.5:3), Class 30 (1:1:2) per Ministry of Works standard specifications; class number is the 28-day characteristic cube strength in N/mm².",
  },
  {
    label: "Estimation aid only",
    note: "Nominal mixes are batched by volume and do not guarantee strength. For strength-critical work, specify a designed mix and trial cubes per BS/KS practice.",
  },
];
