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
  BiaxialOutcome,
  ColumnCode,
  ColumnGeometry,
  ColumnParameters,
  ColumnShearOutcome,
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
  type ResistancePoint,
  type SectionDefinition,
  type StressModel,
} from "./section-capacity";

/**
 * RC column check: first-order actions to design moment (slenderness by the
 * selected code) about both axes, the section's resistance from strain
 * compatibility, biaxial interaction, shear, the steel limits, bar spacing and
 * link rules.
 *
 * The engine is code-agnostic. Everything specific to Eurocode 2 or BS 8110
 * lives behind the `ColumnCode` interface in `codes/`.
 *
 * Scope: braced, rectangular, tied columns with symmetric bars and axial
 * compression. Not covered: unbraced (sway) columns, circular and spiral
 * columns, fire resistance, and the effect of axial load on the shear of
 * columns outside the code's formulas.
 */

/** Steel ratio above which bars are hard to place and compact, of b × h. */
const CONGESTION_STEEL_RATIO = 0.03;
/** Axial load above this share of the axial capacity leaves little ductility. */
const HIGH_AXIAL_SHARE = 0.8;
/** Link spacing below this is hard to place and compact around. */
const LINK_SPACING_PRACTICAL_MIN_MM = 75;
/** Perimeter links give two legs across each direction of shear. */
const LINK_LEGS = 2;

export type AxisKey = "h" | "b";

const AXIS_LABEL: Record<AxisKey, string> = { h: "along h", b: "along b" };

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

export interface AxisOutputs {
  key: AxisKey;
  label: string;
  /** Section dimension the moment acts along, mm. */
  depthMm: number;
  /** Section dimension across it, mm. */
  widthMm: number;
  geometry: ColumnGeometry;
  slenderness: SlendernessOutcome;
  /** Moment capacity at N_Ed, kNm. Null when N_Ed exceeds the axial capacity. */
  momentCapacityKnm: number | null;
  /** Design moment over capacity. Null when there is no capacity at this load. */
  utilisation: number | null;
  shear: {
    vEdKn: number;
    source: "entered" | "end moments";
    outcome: ColumnShearOutcome;
    /** Link area per mm of height at the spacing provided, mm²/mm. */
    aswPerSProvided: number;
    /** Spacing this shear alone would need, mm. Infinity when no calculated links are needed. */
    spacingRequiredMm: number;
  };
}

export interface ColumnDesignOutputs {
  code: CodeId;
  nEdKn: number;
  bars: BarLayout;
  axes: Record<AxisKey, AxisOutputs>;
  /** Null when the code lets the two directions be designed on their own. */
  biaxial: BiaxialOutcome | null;
  /** Axial capacity with no moment, kN. */
  axialCapacityKn: number;
  /**
   * Largest of the two uniaxial utilisations and the biaxial one. Null when
   * N_Ed is beyond the axial capacity so there is nothing to divide by.
   */
  governingUtilisation: number | null;
  /** Which check governs, e.g. "bending along h" or "biaxial bending". */
  governingLabel: string;
  /**
   * Steel needed for strength alone, mm², holding the layout shape. Null when
   * even the maximum steel can't carry the actions.
   */
  strengthSteelMm2: number | null;
  minSteelMm2: number;
  maxSteelMm2: number;
  links: {
    diameterMm: number;
    spacingMm: number;
    legs: number;
    minDiameterMm: number;
    maxSpacingMm: number;
    governedBy: string;
  };
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
    fyv: input.fyvMpa,
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

export type BarLayoutInput = Pick<
  ColumnDesignInput,
  "coverMm" | "linkDiameterMm" | "mainBarDiameterMm" | "hMm" | "barsAcrossH" | "barsAcrossB"
>;

/** Bar rows at their distance from the compression face: outer rows carry the across-width bars, inner rows two each. */
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

/**
 * The column seen from one axis. Bending along b is the same problem with the
 * section turned a quarter turn, so it is solved by swapping the two sides and
 * the bar counts, and reading the other pair of end moments.
 */
function axisInput(input: ColumnDesignInput, axis: AxisKey): ColumnDesignInput {
  if (axis === "h") return input;
  return {
    ...input,
    bMm: input.hMm,
    hMm: input.bMm,
    barsAcrossB: input.barsAcrossH,
    barsAcrossH: input.barsAcrossB,
    mTopKnm: input.mTopBKnm,
    mBotKnm: input.mBotBKnm,
  };
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

interface AxisFlexure {
  key: AxisKey;
  ai: ColumnDesignInput;
  geometry: ColumnGeometry;
  slenderness: SlendernessOutcome;
  section: SectionDefinition;
  capacity: ResistancePoint | null;
  utilisation: number | null;
}

interface FlexureEvaluation {
  axes: Record<AxisKey, AxisFlexure>;
  biaxial: BiaxialOutcome | null;
  governing: number;
  governingLabel: string;
}

/**
 * Slenderness, design moment, capacity and biaxial interaction for both axes
 * at a given steel scale (1 = the bars as entered). Used for the result and,
 * by scaling the steel, to find how much steel the actions need.
 */
function evaluateFlexure(
  input: ColumnDesignInput,
  code: ColumnCode,
  params: ColumnParameters,
  model: StressModel,
  beta: number,
  areaScale: number,
): FlexureEvaluation {
  const build = (key: AxisKey): AxisFlexure => {
    const ai = axisInput(input, key);
    const geometry = geometryFor(ai, areaScale);
    const slenderness = code.slenderness({
      nEdKn: input.nEdKn,
      mTopKnm: ai.mTopKnm,
      mBotKnm: ai.mBotKnm,
      heightMm: input.heightM * 1000,
      beta,
      geometry,
      params,
    });
    const section: SectionDefinition = {
      bMm: ai.bMm,
      hMm: ai.hMm,
      rows: barRows(ai, areaScale),
    };
    const capacity = momentCapacityAtAxial(section, model, input.nEdKn);
    const utilisation = capacity
      ? capacity.mKnm > 0
        ? slenderness.designMomentKnm / capacity.mKnm
        : Number.POSITIVE_INFINITY
      : null;
    return { key, ai, geometry, slenderness, section, capacity, utilisation };
  };

  const axes = { h: build("h"), b: build("b") };
  let biaxial: BiaxialOutcome | null = null;
  if (axes.h.capacity && axes.b.capacity) {
    const axisData = (a: AxisFlexure) => ({
      key: a.key,
      fullKnm: a.slenderness.designMomentKnm,
      actualKnm: a.slenderness.designMomentNoMinKnm,
      capacityKnm: a.capacity!.mKnm,
      slenderness: a.slenderness.slenderness,
      effectiveDepthMm: a.geometry.dMm,
      dimensionMm: a.ai.hMm,
    });
    biaxial = code.biaxial({
      nEdKn: input.nEdKn,
      h: axisData(axes.h),
      b: axisData(axes.b),
      grossAreaMm2: input.bMm * input.hMm,
      steelAreaMm2: axes.h.geometry.asTotalMm2,
      params,
    });
  }

  const candidates: Array<{ value: number; label: string }> = [];
  for (const key of ["h", "b"] as const) {
    const u = axes[key].utilisation;
    candidates.push({
      value: u === null ? Number.POSITIVE_INFINITY : u,
      label: `bending ${AXIAL_AXIS_WORDS[key]}`,
    });
  }
  if (biaxial?.applies && biaxial.utilisation !== null) {
    candidates.push({ value: biaxial.utilisation, label: "biaxial bending" });
  }
  const top = candidates.reduce((best, c) => (c.value > best.value ? c : best));
  return { axes, biaxial, governing: top.value, governingLabel: top.label };
}

const AXIAL_AXIS_WORDS: Record<AxisKey, string> = { h: "along h", b: "along b" };

/** Smallest steel area, layout shape held, whose capacity covers every flexural check. Null if even the maximum steel can't. */
function steelForStrength(
  input: ColumnDesignInput,
  code: ColumnCode,
  params: ColumnParameters,
  model: StressModel,
  beta: number,
  providedMm2: number,
  maxMm2: number,
): number | null {
  const governingAt = (scale: number) =>
    evaluateFlexure(input, code, params, model, beta, scale).governing;
  const hi = maxMm2 / providedMm2;
  if (governingAt(hi) > 1) return null;
  let lo = 0.01;
  if (governingAt(lo) <= 1) return lo * providedMm2;
  let top = hi;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + top) / 2;
    if (governingAt(mid) <= 1) top = mid;
    else lo = mid;
  }
  return top * providedMm2;
}

function barLabel(b: BarLayout): string {
  return `${b.totalBars} No. Ø${b.diameterMm} mm`;
}

/** Prefix a step title with the axis it belongs to. */
function forAxis(key: AxisKey, steps: WorkingStep[]): WorkingStep[] {
  return steps.map((s) => ({ ...s, title: `Bending ${AXIS_LABEL[key]}: ${s.title}` }));
}

export function calculateColumnDesign(input: ColumnDesignInput): ColumnDesignResult {
  const code = getColumnCode(input.code);
  const params = codeParameters(input);
  const beta = effectiveLengthFactor(input);
  const bars = layoutFor(input);
  const grossArea = input.bMm * input.hMm;
  const dPrime = input.coverMm + input.linkDiameterMm + input.mainBarDiameterMm / 2;
  const steps: WorkingStep[] = [];

  steps.push({
    title: "Design actions",
    formula: "N_Ed and the end moments about each axis, as entered",
    substitution: `Along h: M_top ${formatNumber(input.mTopKnm, 1)}, M_bot ${formatNumber(input.mBotKnm, 1)} kNm ;  along b: M_top ${formatNumber(input.mTopBKnm, 1)}, M_bot ${formatNumber(input.mBotBKnm, 1)} kNm`,
    result: `N_Ed = ${formatNumber(input.nEdKn, 0)} kN`,
    note: "Ultimate values from the user's own analysis, so no load factors are applied. Same sign means single curvature. A moment of zero about one axis still gets the minimum-eccentricity moment.",
  });

  steps.push({
    title: "Bar layout",
    formula: "bars = 2 × n_across + 2 × (n_rows − 2) ;  d' = cover + link + bar / 2",
    substitution: `bars = 2 × ${bars.perOuterRow} + 2 × (${bars.rowCount} − 2) = ${bars.totalBars} ;  A_s = ${bars.totalBars} × ${formatNumber(barAreaMm2(bars.diameterMm), 1)} ;  d' = ${formatNumber(input.coverMm, 0)} + ${input.linkDiameterMm} + ${input.mainBarDiameterMm} / 2`,
    result: `${barLabel(bars)}, A_s = ${formatNumber(bars.areaMm2, 0)} mm², d' = ${formatNumber(dPrime, 1)} mm`,
    note: `${bars.perOuterRow} bars in each outer row, 2 in each of the ${Math.max(0, bars.rowCount - 2)} inner rows, so the steel is symmetric about the centroid and the same bars serve both axes.`,
  });

  // Section resistance and slenderness, both axes
  const model = code.stressModel(params);
  const evaluation = evaluateFlexure(input, code, params, model, beta, 1);
  const axisResults = evaluation.axes;
  const axialCapacity = maxAxialCapacityKn(axisResults.h.section, model);

  for (const key of ["h", "b"] as const) {
    const a = axisResults[key];
    steps.push(...forAxis(key, a.slenderness.steps));
    steps.push({
      title: `Bending ${AXIS_LABEL[key]}: Section resistance`,
      formula: `Strain compatibility with ${code.stressModelSummary(params)}`,
      substitution: a.capacity
        ? `Moment acts along the ${formatNumber(a.ai.hMm, 0)} mm side. At N = ${formatNumber(input.nEdKn, 0)} kN the neutral axis is x = ${formatNumber(a.capacity.xMm, 0)} mm; summing concrete and bar forces about the centroid`
        : `N_Ed = ${formatNumber(input.nEdKn, 0)} kN is above the axial capacity of ${formatNumber(axialCapacity, 0)} kN, so no neutral axis position balances it`,
      result: a.capacity
        ? `M_Rd = ${formatNumber(a.capacity.mKnm, 1)} kNm at N_Ed ;  N_Rd,max = ${formatNumber(axialCapacity, 0)} kN`
        : `N_Rd,max = ${formatNumber(axialCapacity, 0)} kN`,
      note: `${code.clauses.capacity}. The interaction diagram is the same calculation repeated for every neutral axis depth. Bars inside the compression block are reduced by the concrete they displace.`,
    });
  }

  if (evaluation.biaxial) steps.push(...evaluation.biaxial.steps);

  // Limits and detailing
  const limits = code.steelLimits(input.nEdKn, grossArea, params);
  steps.push(limits.minAreaStep);
  const linkRules = code.linkRules(input.mainBarDiameterMm, input.bMm, input.hMm, params);
  steps.push(...linkRules.steps);

  // Shear, each direction
  const linkArea = LINK_LEGS * barAreaMm2(input.linkDiameterMm);
  interface ShearEntry {
    key: AxisKey;
    vEdKn: number;
    source: "entered" | "end moments";
    outcome: ColumnShearOutcome;
    spacingRequiredMm: number;
  }
  const shearEntries: Record<AxisKey, ShearEntry> = { h: null!, b: null! };
  for (const key of ["h", "b"] as const) {
    const a = axisResults[key];
    const entered = key === "h" ? input.shearHKn : input.shearBKn;
    const fromMoments = Math.abs(a.ai.mTopKnm - a.ai.mBotKnm) / input.heightM;
    const vEdKn = entered ?? fromMoments;
    const outcome = code.shear({
      vEdKn,
      nEdKn: input.nEdKn,
      momentKnm: a.slenderness.designMomentKnm,
      widthMm: a.ai.bMm,
      effectiveDepthMm: a.geometry.dMm,
      overallDepthMm: a.ai.hMm,
      tensionSteelMm2: a.section.rows[0].areaMm2,
      params,
    });
    const spacingRequired =
      outcome.aswPerSMmReq > 0 ? linkArea / outcome.aswPerSMmReq : Number.POSITIVE_INFINITY;
    shearEntries[key] = {
      key,
      vEdKn,
      source: entered !== undefined ? "entered" : "end moments",
      outcome,
      spacingRequiredMm: spacingRequired,
    };
    steps.push({
      title: `Shear ${AXIS_LABEL[key]}: Design shear`,
      formula: "V_Ed = |M_top − M_bot| / L, unless entered",
      substitution:
        entered !== undefined
          ? `V_Ed = ${formatNumber(entered, 1)} kN as entered`
          : `V_Ed = |${formatNumber(a.ai.mTopKnm, 1)} − ${formatNumber(a.ai.mBotKnm, 1)}| / ${formatTrimmed(input.heightM, 3)}`,
      result: `V_Ed = ${formatNumber(vEdKn, 1)} kN`,
      note:
        entered !== undefined
          ? "Taken from the user's analysis."
          : "From statics on the end moments. Equal single-curvature moments give no shear; double curvature gives the most. Enter your own value if the column also carries a transverse load.",
    });
    steps.push(...outcome.steps.map((s) => ({ ...s, title: `Shear ${AXIS_LABEL[key]}: ${s.title}` })));
  }

  // Link spacing: the tighter of the detailing rules and what each shear needs.
  const shearSpacing = Math.min(shearEntries.h.spacingRequiredMm, shearEntries.b.spacingRequiredMm);
  const cappedSpacing = Math.min(linkRules.maxSpacingMm, shearSpacing);
  const linkSpacing = Math.max(
    LINK_SPACING_STEP_MM,
    floorToStep(cappedSpacing, LINK_SPACING_STEP_MM),
  );
  const governedBy =
    shearSpacing < linkRules.maxSpacingMm
      ? shearEntries.h.spacingRequiredMm <= shearEntries.b.spacingRequiredMm
        ? "shear along h"
        : "shear along b"
      : "the detailing rules";
  steps.push({
    title: "Link spacing",
    formula: "s = the smaller of the detailing limit and A_sw / (A_sw / s)_required, rounded down to 25 mm",
    substitution: `A_sw = ${LINK_LEGS} × π × ${input.linkDiameterMm}² / 4 = ${formatNumber(linkArea, 1)} mm² ;  detailing limit ${formatNumber(linkRules.maxSpacingMm, 0)} mm ;  shear needs ${Number.isFinite(shearSpacing) ? `${formatNumber(shearSpacing, 0)} mm` : "no calculated links"}`,
    result: `Ø${input.linkDiameterMm} @ ${linkSpacing} mm c/c, set by ${governedBy}`,
    note: "Reduce the spacing near beam and slab junctions and at laps, as the detailing clause requires.",
  });

  const links = {
    diameterMm: input.linkDiameterMm,
    spacingMm: linkSpacing,
    legs: LINK_LEGS,
    minDiameterMm: linkRules.minDiameterMm,
    maxSpacingMm: linkRules.maxSpacingMm,
    governedBy,
  };

  const strengthSteel = steelForStrength(
    input,
    code,
    params,
    model,
    beta,
    bars.areaMm2,
    limits.maxAreaMm2,
  );
  if (strengthSteel !== null) {
    steps.push({
      title: "Steel needed for strength",
      formula: "Smallest A_s, same bar layout shape, that passes the moment checks about both axes and the biaxial check",
      substitution: "Solved by repeating the design moments and the section resistance at each trial steel area (the slenderness moment depends on the steel)",
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
  for (const key of ["h", "b"] as const) {
    const a = axisResults[key];
    if (a.capacity && a.utilisation !== null) {
      checks.push({
        label: `Moment ${AXIS_LABEL[key]} (${formatNumber(a.ai.hMm, 0)} mm side) within capacity`,
        demand: `${formatNumber(a.slenderness.designMomentKnm, 1)} kNm`,
        capacity: `${formatNumber(a.capacity.mKnm, 1)} kNm`,
        utilisation: a.utilisation,
        status: a.utilisation <= 1 ? "pass" : "fail",
        clause: code.clauses.capacity,
      });
    }
  }
  if (evaluation.biaxial?.applies && evaluation.biaxial.utilisation !== null) {
    checks.push({
      label: "Combined bending about both axes",
      demand: evaluation.biaxial.demand,
      capacity: evaluation.biaxial.capacity,
      utilisation: evaluation.biaxial.utilisation,
      status: evaluation.biaxial.utilisation <= 1 ? "pass" : "fail",
      clause: code.clauses.biaxial,
    });
  }
  for (const key of ["h", "b"] as const) {
    const e = shearEntries[key];
    checks.push({
      label: `Shear ${AXIS_LABEL[key]} within section limit`,
      demand: `${formatNumber(e.vEdKn, 1)} kN`,
      capacity: `${formatNumber(e.outcome.maxCapacityKn, 1)} kN`,
      utilisation: e.outcome.maxCapacityKn > 0 ? e.vEdKn / e.outcome.maxCapacityKn : Number.POSITIVE_INFINITY,
      status: e.outcome.verdict === "section-inadequate" ? "fail" : "pass",
      clause: code.clauses.shearLimit,
    });
    if (e.outcome.aswPerSMmReq > 0) {
      const provided = linkArea / linkSpacing;
      checks.push({
        label: `Links resist the shear ${AXIS_LABEL[key]}`,
        demand: `${formatTrimmed(e.outcome.aswPerSMmReq, 3)} mm²/mm`,
        capacity: `${formatTrimmed(provided, 3)} mm²/mm`,
        utilisation: e.outcome.aswPerSMmReq / provided,
        status: provided >= e.outcome.aswPerSMmReq - 1e-9 ? "pass" : "fail",
        clause: code.clauses.shear,
      });
    }
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
  );
  for (const key of ["h", "b"] as const) {
    const s = axisResults[key].slenderness;
    checks.push({
      label: `${s.scopeLabel} (${AXIS_LABEL[key]})`,
      demand: formatTrimmed(s.scopeDemand, 1),
      capacity: formatTrimmed(s.scopeLimit, 0),
      utilisation: s.scopeDemand / s.scopeLimit,
      status: s.scopeDemand <= s.scopeLimit ? "pass" : "fail",
      clause: code.clauses.slendernessScope,
    });
  }

  const adequate = checks.every((c) => c.status === "pass");

  const axes: Record<AxisKey, AxisOutputs> = {
    h: buildAxisOutputs(axisResults.h, shearEntries.h, linkArea / linkSpacing),
    b: buildAxisOutputs(axisResults.b, shearEntries.b, linkArea / linkSpacing),
  };

  const outputs: ColumnDesignOutputs = {
    code: input.code,
    nEdKn: input.nEdKn,
    bars,
    axes,
    biaxial: evaluation.biaxial?.applies ? evaluation.biaxial : null,
    axialCapacityKn: axialCapacity,
    governingUtilisation: Number.isFinite(evaluation.governing) ? evaluation.governing : null,
    governingLabel: evaluation.governingLabel,
    strengthSteelMm2: strengthSteel,
    minSteelMm2: limits.minAreaMm2,
    maxSteelMm2: limits.maxAreaMm2,
    links,
    adequate,
  };

  return {
    methodology: `RC column check to ${code.name}: slenderness, interaction capacity about both axes, biaxial bending and shear`,
    outputs,
    quantities: buildQuantities(input, outputs),
    steps,
    tables: [buildTable(outputs)],
    checks,
    charts: (["h", "b"] as const).map((key) =>
      buildChart(axisResults[key], model, outputs, evaluation.biaxial),
    ),
    assumptions: buildAssumptions(input, code, params, beta),
    warnings: buildWarnings(input, outputs, code),
    basis: [
      ...code.basis,
      {
        label: "Not covered",
        note: "Unbraced (sway) columns, circular and spiral columns, fire resistance, and the shear effect of transverse loads on the column are not checked. This is a preliminary section check, not a full column design.",
      },
    ],
  };
}

function buildAxisOutputs(
  a: AxisFlexure,
  shear: {
    vEdKn: number;
    source: "entered" | "end moments";
    outcome: ColumnShearOutcome;
    spacingRequiredMm: number;
  },
  aswPerSProvided: number,
): AxisOutputs {
  return {
    key: a.key,
    label: AXIS_LABEL[a.key],
    depthMm: a.ai.hMm,
    widthMm: a.ai.bMm,
    geometry: a.geometry,
    slenderness: a.slenderness,
    momentCapacityKnm: a.capacity ? a.capacity.mKnm : null,
    utilisation: a.utilisation,
    shear: {
      vEdKn: shear.vEdKn,
      source: shear.source,
      outcome: shear.outcome,
      aswPerSProvided,
      spacingRequiredMm: shear.spacingRequiredMm,
    },
  };
}

function buildQuantities(input: ColumnDesignInput, o: ColumnDesignOutputs): CalcQuantity[] {
  const governing = o.governingUtilisation;
  const utilisationCard: CalcQuantity =
    governing !== null
      ? {
          label: "Highest utilisation",
          value: formatNumber(governing * 100, 0),
          unit: "%",
          emphasis: true,
          note: `Governed by ${o.governingLabel}, at N_Ed ${formatNumber(o.nEdKn, 0)} kN`,
        }
      : {
          label: "Highest utilisation",
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
    note: `Set by ${o.links.governedBy}. Reduce near beam and slab junctions.`,
  };

  const detail: CalcQuantity[] = [{ label: "Design axial load", value: formatNumber(o.nEdKn, 0), unit: "kN" }];
  for (const key of ["h", "b"] as const) {
    const a = o.axes[key];
    const s = a.slenderness;
    detail.push(
      { label: `Column type, ${a.label}`, value: s.slender ? "Slender" : "Short", unit: "" },
      {
        label: `${o.code === "ec2" ? "Slenderness, lambda" : "Slenderness, l_e / h"} ${a.label}`,
        value: formatNumber(s.slenderness, 1),
        unit: `limit ${formatNumber(s.slendernessLimit, 1)}`,
      },
      {
        label: `${o.code === "ec2" ? "Second-order moment" : "Additional moment"} ${a.label}`,
        value: formatNumber(s.secondOrderKnm, 1),
        unit: "kNm",
      },
      { label: `Design moment ${a.label}`, value: formatNumber(s.designMomentKnm, 1), unit: "kNm" },
      {
        label: `Moment capacity ${a.label}`,
        value: a.momentCapacityKnm === null ? "n/a" : formatNumber(a.momentCapacityKnm, 1),
        unit: "kNm",
      },
      {
        label: `Design shear ${a.label}`,
        value: formatNumber(a.shear.vEdKn, 1),
        unit: `kN, ${a.shear.source === "entered" ? "entered" : "from end moments"}`,
      },
    );
  }
  detail.push(
    { label: "Effective length", value: formatNumber(o.axes.h.slenderness.effectiveLengthMm, 0), unit: "mm" },
    { label: "Axial capacity, no moment", value: formatNumber(o.axialCapacityKn, 0), unit: "kN" },
    {
      label: "Steel ratio",
      value: formatTrimmed((100 * o.bars.areaMm2) / (input.bMm * input.hMm), 2),
      unit: "% of b × h",
    },
  );

  return [utilisationCard, strengthCard, linksCard, ...detail];
}

function buildTable(o: ColumnDesignOutputs): CalcTable {
  const requiredSteel =
    o.strengthSteelMm2 === null
      ? "Not possible"
      : `${formatNumber(Math.max(o.strengthSteelMm2, o.minSteelMm2), 0)} mm²`;
  const shearSpacing = Math.min(o.axes.h.shear.spacingRequiredMm, o.axes.b.shear.spacingRequiredMm);
  const maxSpacing = Math.min(o.links.maxSpacingMm, shearSpacing);
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
        required: `min Ø${formatTrimmed(o.links.minDiameterMm, 1)}, max ${formatNumber(maxSpacing, 0)} mm`,
        provided: `Ø${o.links.diameterMm}, ${o.links.spacingMm} mm`,
      },
    ],
  };
}

function buildChart(
  a: AxisFlexure,
  model: StressModel,
  o: ColumnDesignOutputs,
  biaxial: BiaxialOutcome | null,
): CalcChart {
  const curve = interactionCurve(a.section, model, 60);
  const ok =
    (a.utilisation ?? 2) <= 1 && (!biaxial?.applies || (biaxial.utilisation ?? 0) <= 1);
  return {
    title: `Interaction diagram, bending ${AXIS_LABEL[a.key]} (${formatNumber(a.ai.hMm, 0)} mm side)`,
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
        x: a.slenderness.designMomentKnm,
        y: o.nEdKn,
        status: ok ? "pass" : "fail",
      },
    ],
    caption:
      a.key === "h"
        ? "A design point inside the curve is safe. The curve is this section's capacity at every combination of axial load and moment about this axis, from strain compatibility."
        : "The same section turned a quarter turn, for the other axis. Where bending acts about both axes, the combined check on the sheet also applies.",
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
      value: `${formatNumber(input.bMm, 0)} × ${formatNumber(input.hMm, 0)} mm rectangular`,
      source: "Moments along h act in the h direction; moments along b act in the b direction",
    },
    {
      label: "Cover to links",
      value: `${formatNumber(input.coverMm, 0)} mm`,
    },
    {
      label: "Links",
      value: `Ø${input.linkDiameterMm}, ${LINK_LEGS} legs resisting shear in each direction`,
      source: "Perimeter links. Cross-ties would add legs and capacity, which is ignored here",
    },
    {
      label: "Effective length factor",
      value: formatTrimmed(beta, 2),
      source:
        input.endCondition === "custom"
          ? "Entered by the user. The column is assumed braced, with the same factor about both axes"
          : `${END_CONDITION_LABELS[input.endCondition]}: BS 8110-1 Table 3.19 factor for a braced column, used for both codes and both axes (conservative against the Eurocode 2 stiffness method)`,
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

  for (const key of ["h", "b"] as const) {
    const a = o.axes[key];
    const s = a.slenderness;
    if (s.slender) {
      warnings.push({
        level: "notice",
        message: `The column is slender ${a.label} (${formatNumber(s.slenderness, 1)} against a limit of ${formatNumber(s.slendernessLimit, 1)}), so a second-order moment of ${formatNumber(s.secondOrderKnm, 1)} kNm was added.`,
      });
    } else if (s.minimumMomentKnm >= s.firstOrderKnm) {
      warnings.push({
        level: "notice",
        message: `Bending ${a.label}, the minimum eccentricity moment (${formatNumber(s.minimumMomentKnm, 1)} kNm) governs over your end moments, which is normal where the column is loaded almost centrally.`,
      });
    }
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
  if (o.links.spacingMm < LINK_SPACING_PRACTICAL_MIN_MM) {
    warnings.push({
      level: "caution",
      message: `Links at ${o.links.spacingMm} mm are very close for placing. Use larger links or a bigger section.`,
    });
  }
  for (const key of ["h", "b"] as const) {
    const a = o.axes[key];
    if (a.shear.outcome.verdict === "section-inadequate") {
      warnings.push({
        level: "caution",
        message: `The shear ${a.label} (${formatNumber(a.shear.vEdKn, 1)} kN) is above the section's limit of ${formatNumber(a.shear.outcome.maxCapacityKn, 1)} kN. No amount of links fixes that: enlarge the column.`,
      });
    }
  }
  if (o.axes.h.shear.source === "end moments" && o.axes.h.shear.vEdKn > 0) {
    warnings.push({
      level: "notice",
      message:
        "Shear was worked out from the end moments by statics. If the column also carries a transverse load or takes sway shear from your frame analysis, enter that shear under Advanced.",
    });
  }
  if (!o.adequate && o.strengthSteelMm2 === null && o.governingUtilisation !== null) {
    warnings.push({
      level: "caution",
      message: `Even at the maximum steel (${formatNumber(o.maxSteelMm2, 0)} mm², ${code.shortName}) this section can't resist the design moments at this axial load. Enlarge the column or raise the concrete grade.`,
    });
  }
  return warnings;
}
