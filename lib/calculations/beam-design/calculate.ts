import type {
  Assumption,
  CalcCheck,
  CalcQuantity,
  CalcResultBase,
  CalcTable,
  CalcWarning,
  WorkingStep,
} from "../types";
import { formatNumber, formatTrimmed } from "../format";
import { barAreaMm2 } from "../reinforcement";
import { getBeamCode } from "./codes";
import type {
  CodeParameters,
  FlexureOutcome,
  SectionGeometry,
  ShearOutcome,
} from "./codes/types";
import {
  AGGREGATE_SIZE_MM,
  BAR_GAP_ABOVE_AGGREGATE_MM,
  LINK_SPACING_PRACTICAL_MIN_MM,
  LINK_SPACING_STEP_MM,
  SLENDER_DEPTH_TO_WIDTH_NOTICE,
  SPAN_DEPTH_NOTICE,
  SUPPORT_LABELS,
  WIDTH_TO_DEPTH_NOTICE,
  type CodeId,
} from "./constants";
import type { BeamDesignInput } from "./schema";

/**
 * RC beam design: design actions from span and load (or entered directly),
 * flexural and shear design by the selected code, then practical detailing
 * (bar selection, link spacing, fit within the width).
 *
 * The engine is code-agnostic. Everything specific to Eurocode 2 or BS 8110
 * lives behind the `BeamCode` interface in `codes/`.
 *
 * Not covered: deflection and cracking (serviceability), anchorage and
 * curtailment, torsion, flanged sections, continuous-beam moment
 * redistribution. The result says so on the sheet.
 */

/** Span/depth beyond which deflection is likely to govern. Basic ratios shared by EC2 Table 7.4N and BS 8110 Table 3.9. */
const SPAN_DEPTH_LIMIT: Record<"simple" | "cantilever", number> = {
  simple: SPAN_DEPTH_NOTICE,
  cantilever: 7,
};
/** Steel ratio above which bars are hard to fit and compact, of b × h. */
const CONGESTION_STEEL_RATIO = 0.025;
const MIN_BARS_PER_FACE = 2;

export interface BarArrangement {
  count: number;
  diameterMm: number;
  areaProvidedMm2: number;
  /** Width of beam needed to place these bars in one layer, mm. */
  widthNeededMm: number;
  fitsInOneLayer: boolean;
}

export interface LinkArrangement {
  diameterMm: number;
  legs: number;
  /** Spacing to provide, mm c/c. */
  spacingMm: number;
  /** Spacing strictly required by calculation, mm, before rounding and caps. */
  spacingRequiredMm: number;
  aswPerSProvidedMmPerMm: number;
}

export interface BeamDesignOutputs {
  code: CodeId;
  momentKnm: number;
  shearKn: number;
  loads: {
    selfWeightKnm: number;
    characteristicDeadKnm: number;
    designLoadKnm: number;
  } | null;
  geometry: SectionGeometry;
  flexure: FlexureOutcome;
  shear: ShearOutcome;
  tension: BarArrangement | null;
  compression: BarArrangement | null;
  links: LinkArrangement | null;
  adequate: boolean;
}

export interface BeamDesignResult extends CalcResultBase {
  outputs: BeamDesignOutputs;
}

/** Effective depths for a section. d' is also the cover to the centroid of the compression steel. */
export function sectionGeometry(input: BeamDesignInput): SectionGeometry {
  const centroidFromFace =
    input.coverMm + input.linkDiameterMm + input.mainBarDiameterMm / 2;
  return {
    bMm: input.bMm,
    hMm: input.hMm,
    dMm: input.hMm - centroidFromFace,
    dPrimeMm: centroidFromFace,
  };
}

function codeParameters(input: BeamDesignInput): CodeParameters {
  const defaults = getBeamCode(input.code).defaults;
  return {
    concreteStrength: input.concreteStrengthMpa,
    fy: input.fyMpa,
    fyv: input.fyvMpa,
    alphaCc: input.alphaCc ?? defaults.alphaCc,
    gammaC: input.gammaC ?? defaults.gammaC,
    gammaS: input.gammaS ?? defaults.gammaS,
  };
}

function selectBars(areaRequiredMm2: number, diameterMm: number, input: BeamDesignInput): BarArrangement {
  const area = barAreaMm2(diameterMm);
  const count = Math.max(MIN_BARS_PER_FACE, Math.ceil(areaRequiredMm2 / area - 1e-9));
  const gap = Math.max(diameterMm, AGGREGATE_SIZE_MM + BAR_GAP_ABOVE_AGGREGATE_MM);
  const widthNeeded =
    2 * (input.coverMm + input.linkDiameterMm) + count * diameterMm + (count - 1) * gap;
  return {
    count,
    diameterMm,
    areaProvidedMm2: count * area,
    widthNeededMm: widthNeeded,
    fitsInOneLayer: widthNeeded <= input.bMm,
  };
}

function floorToStep(value: number, step: number): number {
  return Math.floor(value / step + 1e-9) * step;
}

function arrangementLabel(a: BarArrangement): string {
  return `${a.count} No. Ø${a.diameterMm} mm`;
}

function linkLabel(l: LinkArrangement): string {
  return `Ø${l.diameterMm} @ ${l.spacingMm} mm c/c, ${l.legs} legs`;
}

export function calculateBeamDesign(input: BeamDesignInput): BeamDesignResult {
  const code = getBeamCode(input.code);
  const params = codeParameters(input);
  const geometry = sectionGeometry(input);
  const { dMm: d, dPrimeMm: dp } = geometry;

  // 1. Design actions
  const steps: WorkingStep[] = [];
  let momentKnm: number;
  let shearKn: number;
  let loads: BeamDesignOutputs["loads"] = null;
  const defaults = code.defaults;

  if (input.loadMode === "udl") {
    const support = input.support ?? "simple";
    const gammaG = input.gammaG ?? defaults.gammaG;
    const gammaQ = input.gammaQ ?? defaults.gammaQ;
    const density = input.densityKnM3 ?? defaults.densityKnM3;
    const dead = input.deadKnm ?? 0;
    const live = input.liveKnm ?? 0;
    const selfWeight = input.selfWeight === "no" ? 0 : (density * input.bMm * input.hMm) / 1e6;
    const gk = dead + selfWeight;
    const w = gammaG * gk + gammaQ * live;
    const L = input.spanM;
    momentKnm = support === "simple" ? (w * L * L) / 8 : (w * L * L) / 2;
    shearKn = support === "simple" ? (w * L) / 2 : w * L;
    loads = { selfWeightKnm: selfWeight, characteristicDeadKnm: gk, designLoadKnm: w };

    steps.push(
      {
        title: "Design load",
        formula: `w = gamma_G × (g_k + self-weight) + gamma_Q × q_k  (${code.loadCombinationLabel})`,
        substitution: `self-weight = ${formatTrimmed(density, 2)} × ${formatNumber(input.bMm, 0)} × ${formatNumber(input.hMm, 0)} / 10⁶ = ${formatNumber(selfWeight, 2)} kN/m ;  w = ${formatTrimmed(gammaG, 2)} × (${formatNumber(dead, 2)} + ${formatNumber(selfWeight, 2)}) + ${formatTrimmed(gammaQ, 2)} × ${formatNumber(live, 2)}`,
        result: `${formatNumber(w, 2)} kN/m`,
        note: input.selfWeight === "no" ? "Self-weight excluded by the user." : undefined,
      },
      {
        title: "Design moment and shear",
        formula:
          support === "simple"
            ? "M_Ed = w × L² / 8 ;  V_Ed = w × L / 2"
            : "M_Ed = w × L² / 2 ;  V_Ed = w × L",
        substitution:
          support === "simple"
            ? `M_Ed = ${formatNumber(w, 2)} × ${formatTrimmed(L, 3)}² / 8 ;  V_Ed = ${formatNumber(w, 2)} × ${formatTrimmed(L, 3)} / 2`
            : `M_Ed = ${formatNumber(w, 2)} × ${formatTrimmed(L, 3)}² / 2 ;  V_Ed = ${formatNumber(w, 2)} × ${formatTrimmed(L, 3)}`,
        result: `M_Ed = ${formatNumber(momentKnm, 1)} kNm, V_Ed = ${formatNumber(shearKn, 1)} kN`,
        note: `${SUPPORT_LABELS[support]}, uniformly distributed load over the effective span. Shear is taken at the support centreline (conservative: no reduction at d from the face).`,
      },
    );
  } else {
    momentKnm = input.momentKnm ?? 0;
    shearKn = input.shearKn ?? 0;
    steps.push({
      title: "Design actions",
      formula: "M_Ed and V_Ed as entered",
      substitution: "Ultimate design values from the user's own analysis",
      result: `M_Ed = ${formatNumber(momentKnm, 1)} kNm, V_Ed = ${formatNumber(shearKn, 1)} kN`,
      note: "Entered as ultimate values, so no load factors are applied.",
    });
  }

  steps.push({
    title: "Effective depth",
    formula: "d = h − cover − link − main bar / 2 ;  d' = cover + link + main bar / 2",
    substitution: `d = ${formatNumber(input.hMm, 0)} − ${formatNumber(input.coverMm, 0)} − ${input.linkDiameterMm} − ${input.mainBarDiameterMm} / 2`,
    result: `d = ${formatNumber(d, 1)} mm, d' = ${formatNumber(dp, 1)} mm`,
    note: "One layer of tension steel. Compression bars assumed the same size as the main bars.",
  });

  // 2. Flexure and shear by the selected code
  const flexure = code.designFlexure({ momentKnm, geometry, params });
  const asForShear = flexure.feasible ? flexure.asDesignMm2 : 0;
  const shear = code.designShear({ vEdKn: shearKn, geometry, asTensionMm2: asForShear, params });
  steps.push(...flexure.steps);
  if (flexure.feasible) steps.push(...shear.steps);

  // 3. Detailing
  const tension = flexure.feasible
    ? selectBars(flexure.asDesignMm2, input.mainBarDiameterMm, input)
    : null;
  const compression =
    flexure.feasible && flexure.asCompMm2 > 0
      ? selectBars(flexure.asCompMm2, input.mainBarDiameterMm, input)
      : null;

  let links: LinkArrangement | null = null;
  if (flexure.feasible && shear.verdict !== "section-inadequate") {
    const aswMm2 = input.linkLegs * barAreaMm2(input.linkDiameterMm);
    const spacingRequired = aswMm2 / shear.aswPerSMmReq;
    const capped = Math.min(spacingRequired, shear.maxSpacingMm);
    const spacing = Math.max(LINK_SPACING_STEP_MM, floorToStep(capped, LINK_SPACING_STEP_MM));
    links = {
      diameterMm: input.linkDiameterMm,
      legs: input.linkLegs,
      spacingMm: spacing,
      spacingRequiredMm: spacingRequired,
      aswPerSProvidedMmPerMm: aswMm2 / spacing,
    };
    steps.push({
      title: "Link spacing",
      formula: "s <= A_sw / (A_sw / s)_required, rounded down to 25 mm and not above 0.75 d",
      substitution: `A_sw = ${input.linkLegs} × π × ${input.linkDiameterMm}² / 4 = ${formatNumber(aswMm2, 1)} mm² ;  s <= ${formatNumber(aswMm2, 1)} / ${formatTrimmed(shear.aswPerSMmReq, 4)} = ${formatNumber(spacingRequired, 0)} mm ;  s_max = 0.75 × ${formatNumber(d, 1)} = ${formatNumber(shear.maxSpacingMm, 0)} mm`,
      result: `Ø${input.linkDiameterMm} @ ${spacing} mm c/c`,
    });
  }

  if (tension) {
    steps.push({
      title: "Bars",
      formula: "n = ceil(A_s / A_bar), at least 2 per face",
      substitution: `Tension: ${formatNumber(flexure.asDesignMm2, 0)} / ${formatNumber(barAreaMm2(tension.diameterMm), 1)}${compression ? ` ;  Compression: ${formatNumber(flexure.asCompMm2, 0)} / ${formatNumber(barAreaMm2(compression.diameterMm), 1)}` : ""}`,
      result: `${arrangementLabel(tension)} = ${formatNumber(tension.areaProvidedMm2, 0)} mm²${compression ? `, ${arrangementLabel(compression)} = ${formatNumber(compression.areaProvidedMm2, 0)} mm²` : ""}`,
      note: `Bar size is your assumed main bar. Single layer needs ${formatNumber(tension.widthNeededMm, 0)} mm of width (clear gap max(bar size, ${AGGREGATE_SIZE_MM + BAR_GAP_ABOVE_AGGREGATE_MM} mm)).`,
    });
  }

  // 4. Checks
  const checks: CalcCheck[] = [];
  const asMax = flexure.asMaxMm2;
  if (tension) {
    checks.push({
      label: "Tension steel within maximum",
      demand: `${formatNumber(tension.areaProvidedMm2, 0)} mm²`,
      capacity: `${formatNumber(asMax, 0)} mm²`,
      utilisation: tension.areaProvidedMm2 / asMax,
      status: tension.areaProvidedMm2 <= asMax ? "pass" : "fail",
      clause: `4% of the gross area, ${code.clauses.steelLimit}`,
    });
  }
  if (compression) {
    checks.push({
      label: "Compression steel within maximum",
      demand: `${formatNumber(compression.areaProvidedMm2, 0)} mm²`,
      capacity: `${formatNumber(asMax, 0)} mm²`,
      utilisation: compression.areaProvidedMm2 / asMax,
      status: compression.areaProvidedMm2 <= asMax ? "pass" : "fail",
      clause: `4% of the gross area, ${code.clauses.steelLimit}`,
    });
  }
  if (flexure.reinforcement === "doubly") {
    const dpOverX = dp / flexure.neutralAxisMm;
    checks.push({
      label: "Compression steel below the neutral axis",
      demand: `d' = ${formatNumber(dp, 0)} mm`,
      capacity: `x = ${formatNumber(flexure.neutralAxisMm, 0)} mm`,
      utilisation: dpOverX,
      status: flexure.feasible ? "pass" : "fail",
      clause: code.clauses.compressionSteel,
    });
  }
  if (flexure.feasible) {
    checks.push({
      label: "Shear within section limit",
      demand: `${formatNumber(shear.vEdKn, 1)} kN`,
      capacity: `${formatNumber(shear.maxCapacityKn, 1)} kN`,
      utilisation: shear.vEdKn / shear.maxCapacityKn,
      status: shear.verdict === "section-inadequate" ? "fail" : "pass",
      clause: code.clauses.shearLimit,
    });
  }

  const adequate = flexure.feasible && checks.every((c) => c.status === "pass");

  // 5. Outputs
  const outputs: BeamDesignOutputs = {
    code: input.code,
    momentKnm,
    shearKn,
    loads,
    geometry,
    flexure,
    shear,
    tension,
    compression,
    links,
    adequate,
  };

  return {
    methodology: `RC beam design to ${code.name}: bending, shear and bar selection`,
    outputs,
    quantities: buildQuantities(input, outputs),
    steps,
    tables: tension ? [buildTable(outputs)] : [],
    checks,
    assumptions: buildAssumptions(input, params),
    warnings: buildWarnings(input, outputs),
    basis: [
      ...code.basis,
      {
        label: "Not covered",
        note: "Deflection and cracking, anchorage and curtailment, torsion, flanged sections and moment redistribution are not checked. This is a preliminary section design, not a full beam design.",
      },
    ],
  };
}

function buildQuantities(input: BeamDesignInput, o: BeamDesignOutputs): CalcQuantity[] {
  const f = o.flexure;
  const { dMm: d } = o.geometry;

  const tensionCard: CalcQuantity = o.tension
    ? {
        label: "Tension steel",
        value: formatNumber(f.asDesignMm2, 0),
        unit: "mm²",
        emphasis: true,
        note: `Provide ${arrangementLabel(o.tension)} (${formatNumber(o.tension.areaProvidedMm2, 0)} mm²)`,
      }
    : {
        label: "Tension steel",
        value: "Not possible",
        unit: "",
        emphasis: true,
        note: f.infeasibleReason ?? "The section cannot carry this moment.",
      };

  const compressionCard: CalcQuantity = o.compression
    ? {
        label: "Compression steel",
        value: formatNumber(f.asCompMm2, 0),
        unit: "mm²",
        emphasis: true,
        note: `Provide ${arrangementLabel(o.compression)} (${formatNumber(o.compression.areaProvidedMm2, 0)} mm²)`,
      }
    : {
        label: "Compression steel",
        value: f.feasible ? "None" : "n/a",
        unit: "",
        emphasis: true,
        note: f.feasible
          ? `Singly reinforced. Fit at least 2 No. Ø${input.linkDiameterMm} hanger bars to hold the links.`
          : "Resolve the flexure problem first.",
      };

  const linksCard: CalcQuantity = o.links
    ? {
        label: "Shear links",
        value: `Ø${o.links.diameterMm} @ ${o.links.spacingMm}`,
        unit: "mm c/c",
        emphasis: true,
        note: `${o.links.legs} legs. ${o.shear.verdict === "links-minimum" ? "Minimum links are enough." : "Designed links."} Required spacing up to ${formatNumber(o.links.spacingRequiredMm, 0)} mm`,
      }
    : {
        label: "Shear links",
        value: f.feasible ? "Not possible" : "n/a",
        unit: "",
        emphasis: true,
        note: f.feasible
          ? "Shear exceeds the section limit. Increase the beam size."
          : "Resolve the flexure problem first.",
      };

  const detail: CalcQuantity[] = [
    { label: "Design moment", value: formatNumber(o.momentKnm, 1), unit: "kNm" },
    { label: "Design shear", value: formatNumber(o.shearKn, 1), unit: "kN" },
    { label: "Effective depth, d", value: formatNumber(d, 0), unit: "mm" },
    {
      label: "Section type",
      value: f.reinforcement === "singly" ? "Singly reinforced" : "Doubly reinforced",
      unit: "",
    },
    { label: "Lever arm, z", value: formatNumber(f.leverArmMm, 0), unit: "mm" },
    { label: "Neutral axis, x / d", value: formatTrimmed(f.neutralAxisMm / d, 3), unit: "" },
  ];
  if (o.tension) {
    detail.push({
      label: "Tension steel ratio",
      value: formatTrimmed((100 * o.tension.areaProvidedMm2) / (input.bMm * input.hMm), 2),
      unit: "% of b × h",
    });
  }
  detail.push({
    label: "Span / effective depth",
    value: formatTrimmed((input.spanM * 1000) / d, 1),
    unit: "",
  });

  return [tensionCard, compressionCard, linksCard, ...detail];
}

function buildTable(o: BeamDesignOutputs): CalcTable {
  const f = o.flexure;
  const rows: Array<Record<string, string>> = [];
  if (o.tension) {
    rows.push({
      item: "Tension (bottom)",
      arrangement: arrangementLabel(o.tension),
      required: `${formatNumber(f.asDesignMm2, 0)} mm²`,
      provided: `${formatNumber(o.tension.areaProvidedMm2, 0)} mm²`,
    });
  }
  if (o.compression) {
    rows.push({
      item: "Compression (top)",
      arrangement: arrangementLabel(o.compression),
      required: `${formatNumber(f.asCompMm2, 0)} mm²`,
      provided: `${formatNumber(o.compression.areaProvidedMm2, 0)} mm²`,
    });
  }
  if (o.links) {
    rows.push({
      item: "Shear links",
      arrangement: linkLabel(o.links),
      required: `${formatTrimmed(o.shear.aswPerSMmReq, 3)} mm²/mm`,
      provided: `${formatTrimmed(o.links.aswPerSProvidedMmPerMm, 3)} mm²/mm`,
    });
  }
  return {
    title: "Reinforcement summary",
    columns: [
      { key: "item", label: "Item", align: "left" },
      { key: "arrangement", label: "Provide", align: "left" },
      { key: "required", label: "Required", align: "right" },
      { key: "provided", label: "Provided", align: "right" },
    ],
    rows,
  };
}

function buildAssumptions(input: BeamDesignInput, params: CodeParameters): Assumption[] {
  const code = getBeamCode(input.code);
  const list: Assumption[] = [
    { label: "Design code", value: code.name },
    ...code.assumptions(params),
    {
      label: "Section",
      value: `${formatNumber(input.bMm, 0)} × ${formatNumber(input.hMm, 0)} mm rectangular`,
      source: "Single layer of tension steel, no flange",
    },
    {
      label: "Cover to links",
      value: `${formatNumber(input.coverMm, 0)} mm`,
    },
  ];
  if (input.loadMode === "udl") {
    const defaults = code.defaults;
    list.push(
      {
        label: "Load combination",
        value: code.loadCombinationLabel,
        source: `Factors ${formatTrimmed(input.gammaG ?? defaults.gammaG, 2)} and ${formatTrimmed(input.gammaQ ?? defaults.gammaQ, 2)}`,
      },
      {
        label: "Self-weight",
        value:
          input.selfWeight === "no"
            ? "Excluded"
            : `${formatTrimmed(input.densityKnM3 ?? defaults.densityKnM3, 2)} kN/m³ × section area`,
      },
      {
        label: "Span",
        value: `${formatTrimmed(input.spanM, 3)} m`,
        source: "Effective span as entered, uniform load over the full span",
      },
    );
  }
  return list;
}

function buildWarnings(input: BeamDesignInput, o: BeamDesignOutputs): CalcWarning[] {
  const warnings: CalcWarning[] = [];
  const d = o.geometry.dMm;
  const support = input.loadMode === "udl" ? (input.support ?? "simple") : "simple";
  const spanDepth = (input.spanM * 1000) / d;
  const limit = SPAN_DEPTH_LIMIT[support];

  if (!o.flexure.feasible && o.flexure.infeasibleReason) {
    warnings.push({ level: "caution", message: o.flexure.infeasibleReason });
  }
  if (o.flexure.reinforcement === "doubly" && o.flexure.feasible) {
    warnings.push({
      level: "notice",
      message:
        "The section needs compression steel. A deeper beam is usually cheaper and easier to build than a doubly reinforced one.",
    });
  }
  if (spanDepth > limit) {
    warnings.push({
      level: "notice",
      message: `Span to effective depth is ${formatTrimmed(spanDepth, 1)}, above the typical ${limit} for a ${support === "simple" ? "simply supported beam" : "cantilever"}. Deflection probably governs and is not checked here.`,
    });
  }
  const widthFailures = [o.tension, o.compression].filter(
    (b): b is BarArrangement => b !== null && !b.fitsInOneLayer,
  );
  for (const bars of widthFailures) {
    warnings.push({
      level: "caution",
      message: `${arrangementLabel(bars)} need ${formatNumber(bars.widthNeededMm, 0)} mm of width in one layer but the beam is ${formatNumber(input.bMm, 0)} mm. Use larger bars, two layers (which reduces d) or a wider beam.`,
    });
  }
  if (o.tension) {
    const ratio = o.tension.areaProvidedMm2 / (input.bMm * input.hMm);
    if (ratio > CONGESTION_STEEL_RATIO && ratio <= 0.04) {
      warnings.push({
        level: "notice",
        message: `Tension steel is ${formatTrimmed(100 * ratio, 2)}% of the section. That is congested for placing and compacting concrete.`,
      });
    }
  }
  if (o.links && o.links.spacingMm < LINK_SPACING_PRACTICAL_MIN_MM) {
    warnings.push({
      level: "caution",
      message: `Links at ${o.links.spacingMm} mm are very close for placing. Use larger links or more legs.`,
    });
  }
  if (o.links && o.links.spacingRequiredMm < LINK_SPACING_STEP_MM) {
    warnings.push({
      level: "caution",
      message: `Ø${o.links.diameterMm} links with ${o.links.legs} legs can't supply the required shear steel even at ${LINK_SPACING_STEP_MM} mm. Use larger links or more legs.`,
    });
  }
  if (input.bMm / input.hMm > WIDTH_TO_DEPTH_NOTICE) {
    warnings.push({
      level: "notice",
      message: "The beam is wider than it is deep. That is more typical of a slab strip or a band beam.",
    });
  }
  if (input.hMm / input.bMm > SLENDER_DEPTH_TO_WIDTH_NOTICE) {
    warnings.push({
      level: "notice",
      message: `Depth is more than ${SLENDER_DEPTH_TO_WIDTH_NOTICE} times the width. Check lateral stability.`,
    });
  }
  return warnings;
}
