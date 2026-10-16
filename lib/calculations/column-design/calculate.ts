import { formatNumber, formatTrimmed } from "../format";
import { barAreaMm2 } from "../reinforcement";
import type {
  Assumption,
  CalcChart,
  CalcCheck,
  CalcQuantity,
  CalcResultBase,
  CalcTable,
  CalcWarning,
  WorkingStep,
} from "../types";
import { getColumnCode } from "./codes";
import type {
  ColumnCode,
  ColumnGeometry,
  ColumnParameters,
  SlendernessOutcome,
} from "./codes/types";
import {
  AGGREGATE_SIZE_MM,
  BAR_GAP_ABOVE_AGGREGATE_MM,
  END_CONDITION_FACTORS,
  END_CONDITION_LABELS,
  LINK_SPACING_STEP_MM,
  type CodeId,
} from "./constants";
import type { ColumnDesignInput } from "./schema";
import {
  interactionCurve,
  maxAxialCapacityKn,
  momentCapacityAtAxial,
  type BarRow,
  type SectionDefinition,
} from "./section-capacity";

/**
 * RC column check: first-order actions to design moment (slenderness by the
 * selected code), then the section's resistance from strain compatibility,
 * the steel limits, bar spacing and link rules.
 *
 * The engine is code-agnostic. Everything specific to Eurocode 2 or BS 8110
 * lives behind the `ColumnCode` interface in `codes/`.
 *
 * Scope: braced, rectangular, tied columns with symmetric bars, bending about
 * one axis, axial compression. Not covered: biaxial bending, unbraced
 * (sway) columns, slenderness about the other axis, shear, spirally
 * reinforced or circular sections.
 */

/** Steel ratio above which bars are hard to place and compact, of b × h. */
const CONGESTION_STEEL_RATIO = 0.03;
/** Axial load above this share of the axial capacity leaves little ductility. */
const HIGH_AXIAL_SHARE = 0.8;

export interface BarLayout {
  diameterMm: number;
  /** Bars in each of the two outer rows (across the width). */
  perOuterRow: number;
  /** Rows through the depth, outer rows included. */
  rowCount: number;
  totalBars: number;
  areaMm2: number;
  /** Centre-to-centre spacing across the width and along the depth, mm. */
  spacingAcrossBMm: number;
  spacingAlongHMm: number;
  /** Smallest clear gap between bars, mm. */
  clearGapMm: number;
  /** Clear gap the code and the aggregate size require, mm. */
  requiredGapMm: number;
}

export interface ColumnDesignOutputs {
  code: CodeId;
  nEdKn: number;
  bars: BarLayout;
  geometry: ColumnGeometry;
  slenderness: SlendernessOutcome;
  /** Axial capacity with no moment, kN. Null never occurs; capacity is always positive. */
  axialCapacityKn: number;
  /** Moment capacity at N_Ed, kNm. Null when N_Ed exceeds the axial capacity. */
  momentCapacityKnm: number | null;
  momentUtilisation: number | null;
  /**
   * Steel needed for strength alone, mm², holding the layout shape. Null when
   * even the maximum steel can't carry the actions.
   */
  strengthSteelMm2: number | null;
  minSteelMm2: number;
  maxSteelMm2: number;
  links: { diameterMm: number; spacingMm: number; minDiameterMm: number; maxSpacingMm: number };
  adequate: boolean;
}

export interface ColumnDesignResult extends CalcResultBase {
  outputs: ColumnDesignOutputs;
}

function codeParameters(input: ColumnDesignInput): ColumnParameters {
  const defaults = getColumnCode(input.code).defaults;
  return {
    concreteStrength: input.concreteStrengthMpa,
    fy: input.fyMpa,
    alphaCc: input.alphaCc ?? defaults.alphaCc,
    gammaC: input.gammaC ?? defaults.gammaC,
    gammaS: input.gammaS ?? defaults.gammaS,
    creepRatio: input.creepRatio ?? defaults.creepRatio,
  };
}

export function effectiveLengthFactor(input: ColumnDesignInput): number {
  return input.endCondition === "custom"
    ? (input.betaCustom ?? 1)
    : END_CONDITION_FACTORS[input.endCondition];
}

/** Bar rows at their distance from the compression face: outer rows carry the across-width bars, inner rows two each. */
export type BarLayoutInput = Pick<
  ColumnDesignInput,
  "coverMm" | "linkDiameterMm" | "mainBarDiameterMm" | "hMm" | "barsAcrossH" | "barsAcrossB"
>;

export function barRows(input: BarLayoutInput, areaScale = 1): BarRow[] {
  const barArea = barAreaMm2(input.mainBarDiameterMm);
  const dPrime = input.coverMm + input.linkDiameterMm + input.mainBarDiameterMm / 2;
  const rows: BarRow[] = [];
  for (let k = 0; k < input.barsAcrossH; k++) {
    const y = dPrime + (k * (input.hMm - 2 * dPrime)) / (input.barsAcrossH - 1);
    const outer = k === 0 || k === input.barsAcrossH - 1;
    rows.push({ yMm: y, areaMm2: (outer ? input.barsAcrossB : 2) * barArea * areaScale });
  }
  return rows;
}

function geometryFor(input: ColumnDesignInput, areaScale = 1): ColumnGeometry {
  const rows = barRows(input, areaScale);
  const total = rows.reduce((s, r) => s + r.areaMm2, 0);
  const second = rows.reduce((s, r) => s + r.areaMm2 * (r.yMm - input.hMm / 2) ** 2, 0);
  const dPrime = input.coverMm + input.linkDiameterMm + input.mainBarDiameterMm / 2;
  return {
    bMm: input.bMm,
    hMm: input.hMm,
    dMm: input.hMm - dPrime,
    asTotalMm2: total,
    steelRadiusMm: Math.sqrt(second / total),
  };
}

function layoutFor(input: ColumnDesignInput): BarLayout {
  const dPrime = input.coverMm + input.linkDiameterMm + input.mainBarDiameterMm / 2;
  const total = 2 * input.barsAcrossB + 2 * (input.barsAcrossH - 2);
  const spacingB = (input.bMm - 2 * dPrime) / (input.barsAcrossB - 1);
  const spacingH = (input.hMm - 2 * dPrime) / (input.barsAcrossH - 1);
  return {
    diameterMm: input.mainBarDiameterMm,
    perOuterRow: input.barsAcrossB,
    rowCount: input.barsAcrossH,
    totalBars: total,
    areaMm2: total * barAreaMm2(input.mainBarDiameterMm),
    spacingAcrossBMm: spacingB,
    spacingAlongHMm: spacingH,
    clearGapMm: Math.min(spacingB, spacingH) - input.mainBarDiameterMm,
    requiredGapMm: Math.max(
      input.mainBarDiameterMm,
      AGGREGATE_SIZE_MM + BAR_GAP_ABOVE_AGGREGATE_MM,
    ),
  };
}

function floorToStep(value: number, step: number): number {
  return Math.floor(value / step + 1e-9) * step;
}

/** Capacity minus demand for the layout scaled by `areaScale`, kNm. Negative means inadequate. */
function reserve(
  input: ColumnDesignInput,
  code: ColumnCode,
  params: ColumnParameters,
  beta: number,
  areaScale: number,
): number {
  const geometry = geometryFor(input, areaScale);
  const demand = code.slenderness({
    nEdKn: input.nEdKn,
    mTopKnm: input.mTopKnm,
    mBotKnm: input.mBotKnm,
    heightMm: input.heightM * 1000,
    beta,
    geometry,
    params,
  }).designMomentKnm;
  const section: SectionDefinition = {
    bMm: input.bMm,
    hMm: input.hMm,
    rows: barRows(input, areaScale),
  };
  const cap = momentCapacityAtAxial(section, code.stressModel(params), input.nEdKn);
  return (cap ? cap.mKnm : -Infinity) - demand;
}

/** Smallest steel area, layout shape held, whose capacity covers the demand. Null if even the maximum steel can't. */
function steelForStrength(
  input: ColumnDesignInput,
  code: ColumnCode,
  params: ColumnParameters,
  beta: number,
  providedMm2: number,
  maxMm2: number,
): number | null {
  const hi = maxMm2 / providedMm2;
  if (reserve(input, code, params, beta, hi) < 0) return null;
  let lo = 0.01;
  if (reserve(input, code, params, beta, lo) >= 0) return lo * providedMm2;
  let top = hi;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + top) / 2;
    if (reserve(input, code, params, beta, mid) >= 0) top = mid;
    else lo = mid;
  }
  return top * providedMm2;
}

function barLabel(b: BarLayout): string {
  return `${b.totalBars} No. Ø${b.diameterMm} mm`;
}

export function calculateColumnDesign(input: ColumnDesignInput): ColumnDesignResult {
  const code = getColumnCode(input.code);
  const params = codeParameters(input);
  const beta = effectiveLengthFactor(input);
  const bars = layoutFor(input);
  const geometry = geometryFor(input);
  const grossArea = input.bMm * input.hMm;
  const dPrime = input.coverMm + input.linkDiameterMm + input.mainBarDiameterMm / 2;
  const steps: WorkingStep[] = [];

  steps.push({
    title: "Design actions",
    formula: "N_Ed, M_top and M_bot as entered",
    substitution: "Ultimate design values from the user's own analysis, about the axis of bending",
    result: `N_Ed = ${formatNumber(input.nEdKn, 0)} kN, M_top = ${formatNumber(input.mTopKnm, 1)} kNm, M_bot = ${formatNumber(input.mBotKnm, 1)} kNm`,
    note: "Entered as ultimate values, so no load factors are applied. Same sign means single curvature.",
  });

  steps.push({
    title: "Bar layout",
    formula: "bars = 2 × n_across + 2 × (n_rows − 2) ;  d' = cover + link + bar / 2",
    substitution: `bars = 2 × ${bars.perOuterRow} + 2 × (${bars.rowCount} − 2) = ${bars.totalBars} ;  A_s = ${bars.totalBars} × ${formatNumber(barAreaMm2(bars.diameterMm), 1)} ;  d' = ${formatNumber(input.coverMm, 0)} + ${input.linkDiameterMm} + ${input.mainBarDiameterMm} / 2`,
    result: `${barLabel(bars)}, A_s = ${formatNumber(bars.areaMm2, 0)} mm², d' = ${formatNumber(dPrime, 1)} mm`,
    note: `${bars.perOuterRow} bars in each outer row, 2 in each of the ${Math.max(0, bars.rowCount - 2)} inner rows, so the steel is symmetric about the centroid.`,
  });

  // Slenderness and design moment
  const slenderness = code.slenderness({
    nEdKn: input.nEdKn,
    mTopKnm: input.mTopKnm,
    mBotKnm: input.mBotKnm,
    heightMm: input.heightM * 1000,
    beta,
    geometry,
    params,
  });
  steps.push(...slenderness.steps);

  // Section resistance
  const model = code.stressModel(params);
  const section: SectionDefinition = { bMm: input.bMm, hMm: input.hMm, rows: barRows(input) };
  const axialCapacity = maxAxialCapacityKn(section, model);
  const capacityPoint = momentCapacityAtAxial(section, model, input.nEdKn);
  const momentCapacity = capacityPoint ? capacityPoint.mKnm : null;
  const utilisation =
    momentCapacity && momentCapacity > 0 ? slenderness.designMomentKnm / momentCapacity : null;

  steps.push({
    title: "Section resistance",
    formula: `Strain compatibility with ${code.stressModelSummary(params)}`,
    substitution: capacityPoint
      ? `At N = ${formatNumber(input.nEdKn, 0)} kN the neutral axis is x = ${formatNumber(capacityPoint.xMm, 0)} mm; summing concrete and bar forces about the centroid`
      : `N_Ed = ${formatNumber(input.nEdKn, 0)} kN is above the axial capacity of ${formatNumber(axialCapacity, 0)} kN, so no neutral axis position balances it`,
    result: capacityPoint
      ? `M_Rd = ${formatNumber(capacityPoint.mKnm, 1)} kNm at N_Ed ;  N_Rd,max = ${formatNumber(axialCapacity, 0)} kN`
      : `N_Rd,max = ${formatNumber(axialCapacity, 0)} kN`,
    note: `${code.clauses.capacity}. The interaction diagram below is the same calculation repeated for every neutral axis depth. Bars inside the compression block are reduced by the concrete they displace.`,
  });

  // Limits and detailing
  const limits = code.steelLimits(input.nEdKn, grossArea, params);
  steps.push(limits.minAreaStep);

  const linkRules = code.linkRules(input.mainBarDiameterMm, input.bMm, input.hMm, params);
  steps.push(...linkRules.steps);
  const linkSpacing = Math.max(
    LINK_SPACING_STEP_MM,
    floorToStep(linkRules.maxSpacingMm, LINK_SPACING_STEP_MM),
  );
  const links = {
    diameterMm: input.linkDiameterMm,
    spacingMm: linkSpacing,
    minDiameterMm: linkRules.minDiameterMm,
    maxSpacingMm: linkRules.maxSpacingMm,
  };

  const strengthSteel = steelForStrength(
    input,
    code,
    params,
    beta,
    bars.areaMm2,
    limits.maxAreaMm2,
  );
  if (strengthSteel !== null) {
    steps.push({
      title: "Steel needed for strength",
      formula: "Smallest A_s, same bar layout shape, whose M_Rd at N_Ed covers the design moment",
      substitution: "Solved by repeating the design moment and the section resistance at each trial steel area (the slenderness moment depends on the steel)",
      result: `${formatNumber(strengthSteel, 0)} mm² for strength; ${formatNumber(Math.max(strengthSteel, limits.minAreaMm2), 0)} mm² with the minimum steel rule`,
      note: "Shows how much of the steel provided is working, so you can see the margin or the shortfall.",
    });
  }

  // Checks
  const checks: CalcCheck[] = [];
  checks.push({
    label: "Axial load within section capacity",
    demand: `${formatNumber(input.nEdKn, 0)} kN`,
    capacity: `${formatNumber(axialCapacity, 0)} kN`,
    utilisation: input.nEdKn / axialCapacity,
    status: input.nEdKn <= axialCapacity ? "pass" : "fail",
    clause: code.clauses.capacity,
  });
  if (momentCapacity !== null && utilisation !== null) {
    checks.push({
      label: "Design moment within moment capacity at this axial load",
      demand: `${formatNumber(slenderness.designMomentKnm, 1)} kNm`,
      capacity: `${formatNumber(momentCapacity, 1)} kNm`,
      utilisation,
      status: utilisation <= 1 ? "pass" : "fail",
      clause: code.clauses.capacity,
    });
  }
  checks.push(
    {
      label: "Steel at least the minimum",
      demand: `${formatNumber(limits.minAreaMm2, 0)} mm²`,
      capacity: `${formatNumber(bars.areaMm2, 0)} mm²`,
      utilisation: limits.minAreaMm2 / bars.areaMm2,
      status: bars.areaMm2 >= limits.minAreaMm2 ? "pass" : "fail",
      clause: code.clauses.steelLimits,
    },
    {
      label: "Steel within the maximum",
      demand: `${formatNumber(bars.areaMm2, 0)} mm²`,
      capacity: `${formatNumber(limits.maxAreaMm2, 0)} mm²`,
      utilisation: bars.areaMm2 / limits.maxAreaMm2,
      status: bars.areaMm2 <= limits.maxAreaMm2 ? "pass" : "fail",
      clause: code.clauses.steelLimits,
    },
    {
      label: "Clear gap between bars",
      demand: `at least ${formatNumber(bars.requiredGapMm, 0)} mm`,
      capacity: `${formatNumber(Math.max(bars.clearGapMm, 0), 0)} mm`,
      utilisation: bars.clearGapMm > 0 ? bars.requiredGapMm / bars.clearGapMm : 99.9,
      status: bars.clearGapMm >= bars.requiredGapMm ? "pass" : "fail",
      clause: `Bar size or aggregate + ${BAR_GAP_ABOVE_AGGREGATE_MM} mm, EN 1992-1-1 cl. 8.2(2); BS 8110-1 cl. 3.12.11.1`,
    },
    {
      label: "Link size",
      demand: `at least Ø${formatTrimmed(links.minDiameterMm, 1)} mm`,
      capacity: `Ø${links.diameterMm} mm`,
      utilisation: links.minDiameterMm / links.diameterMm,
      status: links.diameterMm >= links.minDiameterMm ? "pass" : "fail",
      clause: code.clauses.linkRules,
    },
    {
      label: slenderness.scopeLabel,
      demand: formatTrimmed(slenderness.scopeDemand, 1),
      capacity: formatTrimmed(slenderness.scopeLimit, 0),
      utilisation: slenderness.scopeDemand / slenderness.scopeLimit,
      status: slenderness.scopeDemand <= slenderness.scopeLimit ? "pass" : "fail",
      clause: code.clauses.slendernessScope,
    },
  );

  const adequate = checks.every((c) => c.status === "pass");

  const outputs: ColumnDesignOutputs = {
    code: input.code,
    nEdKn: input.nEdKn,
    bars,
    geometry,
    slenderness,
    axialCapacityKn: axialCapacity,
    momentCapacityKnm: momentCapacity,
    momentUtilisation: utilisation,
    strengthSteelMm2: strengthSteel,
    minSteelMm2: limits.minAreaMm2,
    maxSteelMm2: limits.maxAreaMm2,
    links,
    adequate,
  };

  return {
    methodology: `RC column check to ${code.name}: slenderness, design moment and interaction capacity`,
    outputs,
    quantities: buildQuantities(input, outputs),
    steps,
    tables: [buildTable(input, outputs)],
    checks,
    charts: [buildChart(section, model, outputs, slenderness.designMomentKnm)],
    assumptions: buildAssumptions(input, code, params, beta),
    warnings: buildWarnings(input, outputs, code),
    basis: [
      ...code.basis,
      {
        label: "Not covered",
        note: "Biaxial bending, unbraced (sway) columns, slenderness about the other axis, shear, circular and spiral columns, and fire resistance are not checked. This is a preliminary section check, not a full column design.",
      },
    ],
  };
}

function buildQuantities(input: ColumnDesignInput, o: ColumnDesignOutputs): CalcQuantity[] {
  const s = o.slenderness;
  const utilisationCard: CalcQuantity =
    o.momentUtilisation !== null
      ? {
          label: "Moment utilisation",
          value: formatNumber(o.momentUtilisation * 100, 0),
          unit: "%",
          emphasis: true,
          note: `M_Ed ${formatNumber(s.designMomentKnm, 1)} kNm of M_Rd ${formatNumber(o.momentCapacityKnm ?? 0, 1)} kNm at N_Ed ${formatNumber(o.nEdKn, 0)} kN`,
        }
      : {
          label: "Moment utilisation",
          value: "Not possible",
          unit: "",
          emphasis: true,
          note: `N_Ed is above the axial capacity of ${formatNumber(o.axialCapacityKn, 0)} kN. Enlarge the column.`,
        };

  const strengthCard: CalcQuantity =
    o.strengthSteelMm2 !== null
      ? {
          label: "Steel needed for strength",
          value: formatNumber(Math.max(o.strengthSteelMm2, o.minSteelMm2), 0),
          unit: "mm²",
          emphasis: true,
          note: `You provide ${barLabel(o.bars)} = ${formatNumber(o.bars.areaMm2, 0)} mm² (${formatTrimmed((100 * o.bars.areaMm2) / (input.bMm * input.hMm), 2)}%)`,
        }
      : {
          label: "Steel needed for strength",
          value: "Not possible",
          unit: "",
          emphasis: true,
          note: "Even the maximum steel can't carry these actions. Enlarge the column or raise the concrete grade.",
        };

  const linksCard: CalcQuantity = {
    label: "Links",
    value: `Ø${o.links.diameterMm} @ ${o.links.spacingMm}`,
    unit: "mm c/c",
    emphasis: true,
    note: `Maximum spacing ${formatNumber(o.links.maxSpacingMm, 0)} mm. Reduce near beam and slab junctions.`,
  };

  const detail: CalcQuantity[] = [
    { label: "Design axial load", value: formatNumber(o.nEdKn, 0), unit: "kN" },
    { label: "Larger end moment", value: formatNumber(s.firstOrderKnm, 1), unit: "kNm" },
    {
      label: "Column type",
      value: s.slender ? "Slender" : "Short",
      unit: "",
    },
    {
      label: "Effective length",
      value: formatNumber(s.effectiveLengthMm, 0),
      unit: "mm",
    },
    {
      label: o.code === "ec2" ? "Slenderness, lambda" : "Slenderness, l_e / h",
      value: formatNumber(s.slenderness, 1),
      unit: `limit ${formatNumber(s.slendernessLimit, 1)}`,
    },
    {
      label: o.code === "ec2" ? "Second-order moment" : "Additional moment",
      value: formatNumber(s.secondOrderKnm, 1),
      unit: "kNm",
    },
    { label: "Design moment", value: formatNumber(s.designMomentKnm, 1), unit: "kNm" },
    { label: "Axial capacity, no moment", value: formatNumber(o.axialCapacityKn, 0), unit: "kN" },
    {
      label: "Steel ratio",
      value: formatTrimmed((100 * o.bars.areaMm2) / (input.bMm * input.hMm), 2),
      unit: "% of b × h",
    },
  ];

  return [utilisationCard, strengthCard, linksCard, ...detail];
}

function buildTable(input: ColumnDesignInput, o: ColumnDesignOutputs): CalcTable {
  const requiredSteel =
    o.strengthSteelMm2 === null
      ? "Not possible"
      : `${formatNumber(Math.max(o.strengthSteelMm2, o.minSteelMm2), 0)} mm²`;
  return {
    title: "Reinforcement summary",
    columns: [
      { key: "item", label: "Item", align: "left" },
      { key: "arrangement", label: "Provide", align: "left" },
      { key: "required", label: "Needed", align: "right" },
      { key: "provided", label: "Provided", align: "right" },
    ],
    rows: [
      {
        item: "Main bars",
        arrangement: `${barLabel(o.bars)}, ${o.bars.perOuterRow} across × ${o.bars.rowCount} rows`,
        required: requiredSteel,
        provided: `${formatNumber(o.bars.areaMm2, 0)} mm²`,
      },
      {
        item: "Links",
        arrangement: `Ø${o.links.diameterMm} @ ${o.links.spacingMm} mm c/c`,
        required: `min Ø${formatTrimmed(o.links.minDiameterMm, 1)}, max ${formatNumber(o.links.maxSpacingMm, 0)} mm`,
        provided: `Ø${o.links.diameterMm}, ${o.links.spacingMm} mm`,
      },
    ],
  };
}

function buildChart(
  section: SectionDefinition,
  model: ReturnType<ColumnCode["stressModel"]>,
  o: ColumnDesignOutputs,
  designMomentKnm: number,
): CalcChart {
  const curve = interactionCurve(section, model, 60);
  return {
    title: "Interaction diagram",
    xLabel: "Moment, kNm",
    yLabel: "Axial load, kN",
    series: [
      {
        label: "Section capacity",
        points: curve.map((p) => ({ x: p.mKnm, y: p.nKn })),
      },
    ],
    markers: [
      {
        label: "Design point",
        x: designMomentKnm,
        y: o.nEdKn,
        status: o.adequate && (o.momentUtilisation ?? 2) <= 1 ? "pass" : "fail",
      },
    ],
    caption:
      "A design point inside the curve is safe. The curve is this section's capacity at every combination of axial load and moment, from strain compatibility.",
  };
}

function buildAssumptions(
  input: ColumnDesignInput,
  code: ColumnCode,
  params: ColumnParameters,
  beta: number,
): Assumption[] {
  return [
    { label: "Design code", value: code.name },
    ...code.assumptions(params),
    {
      label: "Section",
      value: `${formatNumber(input.bMm, 0)} × ${formatNumber(input.hMm, 0)} mm rectangular, bending in the ${formatNumber(input.hMm, 0)} mm direction`,
      source: "Enter the depth in the plane of bending as h",
    },
    {
      label: "Cover to links",
      value: `${formatNumber(input.coverMm, 0)} mm`,
    },
    {
      label: "Effective length factor",
      value: formatTrimmed(beta, 2),
      source:
        input.endCondition === "custom"
          ? "Entered by the user. The column is assumed braced"
          : `${END_CONDITION_LABELS[input.endCondition]}: BS 8110-1 Table 3.19 factor for a braced column, used for both codes (conservative against the Eurocode 2 stiffness method)`,
    },
    {
      label: "Column height",
      value: `${formatTrimmed(input.heightM, 3)} m`,
      source: "Clear height between restraints",
    },
    {
      label: "Moment shape",
      value: "Linear between the two end moments",
      source: "Same sign means single curvature",
    },
  ];
}

function buildWarnings(
  input: ColumnDesignInput,
  o: ColumnDesignOutputs,
  code: ColumnCode,
): CalcWarning[] {
  const warnings: CalcWarning[] = [];
  const s = o.slenderness;

  if (s.slender) {
    warnings.push({
      level: "notice",
      message: `The column is slender (${formatNumber(s.slenderness, 1)} against a limit of ${formatNumber(s.slendernessLimit, 1)}), so a second-order moment of ${formatNumber(s.secondOrderKnm, 1)} kNm was added. Check the other axis too: it is not covered here.`,
    });
  } else if (s.minimumMomentKnm >= s.firstOrderKnm) {
    warnings.push({
      level: "notice",
      message: `The minimum eccentricity moment (${formatNumber(s.minimumMomentKnm, 1)} kNm) governs over your end moments, which is normal for a column loaded almost centrally.`,
    });
  }
  if (o.nEdKn > HIGH_AXIAL_SHARE * o.axialCapacityKn) {
    warnings.push({
      level: "notice",
      message: `The axial load is ${formatNumber((100 * o.nEdKn) / o.axialCapacityKn, 0)}% of the section's axial capacity. A column this heavily loaded gives little warning before failure; a bigger section is cheap insurance.`,
    });
  }
  if (o.bars.clearGapMm < o.bars.requiredGapMm) {
    warnings.push({
      level: "caution",
      message: `Bars ${formatNumber(o.bars.clearGapMm, 0)} mm apart (clear) are closer than the ${formatNumber(o.bars.requiredGapMm, 0)} mm needed to place and compact concrete. Use fewer or smaller bars, or a bigger section.`,
    });
  }
  const ratio = o.bars.areaMm2 / (input.bMm * input.hMm);
  if (ratio > CONGESTION_STEEL_RATIO && o.bars.areaMm2 <= o.maxSteelMm2) {
    warnings.push({
      level: "notice",
      message: `Steel is ${formatTrimmed(100 * ratio, 2)}% of the section. Laps will double this locally, so check the bars can be placed and compacted at the lap.`,
    });
  }
  if (input.barsAcrossB > 2 || input.barsAcrossH > 2) {
    warnings.push({
      level: "notice",
      message:
        "Restrain the intermediate bars with cross-links so that every bar is within 150 mm of a restrained bar (EN 1992-1-1 cl. 9.5.3(6); BS 8110-1 cl. 3.12.7.1).",
    });
  }
  if (input.hMm < input.bMm) {
    warnings.push({
      level: "notice",
      message: `Bending is in the ${formatNumber(input.hMm, 0)} mm direction, the weaker one. If that is intended, ignore this; if the moment acts in the ${formatNumber(input.bMm, 0)} mm direction, swap b and h.`,
    });
  }
  if (!o.adequate && o.strengthSteelMm2 === null && o.momentUtilisation !== null) {
    warnings.push({
      level: "caution",
      message: `Even at the maximum steel (${formatNumber(o.maxSteelMm2, 0)} mm², ${code.shortName}) this section can't resist the design moment at this axial load. Enlarge the column or raise the concrete grade.`,
    });
  }
  return warnings;
}
