import {
  AXIAL_CONCRETE_STRAIN,
  PIVOT_HEIGHT_RATIO,
  STEEL_MODULUS,
  ULTIMATE_CONCRETE_STRAIN,
} from "./constants";

/**
 * Strain-compatibility resistance of a rectangular reinforced concrete
 * section under axial load and bending in one plane.
 *
 * Shared by Eurocode 2 and BS 8110: both use a rectangular concrete stress
 * block and an elastic-perfectly-plastic steel law. The codes differ only in
 * three numbers (block depth ratio, block stress, steel design yield stress),
 * carried in {@link StressModel}.
 *
 * Strain profile: concrete strain is 0.0035 at the compression face while the
 * neutral axis lies inside the section. Once it moves outside, the profile
 * pivots about the point 3/7 h from the compression face where the strain is
 * 0.002 (EN 1992-1-1 Fig. 6.1), so a uniform 0.002 is reached at pure axial
 * compression. This is the same profile as BS 8110-1 cl. 3.4.4.1, which limits
 * the top strain to 0.0035 less 0.75 times the strain at the other face.
 *
 * Sign convention: compression positive. Distances `y` run from the
 * compression face. Moment is taken about the section centroid and is
 * positive when it compresses the face at y = 0.
 */

export interface StressModel {
  /** Stress block depth as a fraction of the neutral axis depth (0.8 EC2, 0.9 BS 8110). */
  blockRatio: number;
  /** Uniform stress in the block, N/mm² (alpha_cc f_ck / gamma_c for EC2, 0.45 f_cu for BS 8110). */
  blockStress: number;
  /** Design yield stress of the steel, N/mm² (f_yk / gamma_s for EC2, 0.87 f_y for BS 8110). */
  steelYield: number;
}

/** One line of bars, at distance `yMm` from the compression face. */
export interface BarRow {
  yMm: number;
  areaMm2: number;
}

export interface SectionDefinition {
  bMm: number;
  hMm: number;
  rows: readonly BarRow[];
}

export interface ResistancePoint {
  /** Neutral axis depth from the compression face, mm. May exceed h. */
  xMm: number;
  nKn: number;
  mKnm: number;
}

/** Concrete strain at depth y for neutral axis depth x. */
export function strainAt(xMm: number, yMm: number, hMm: number): number {
  if (xMm <= hMm) return (ULTIMATE_CONCRETE_STRAIN * (xMm - yMm)) / xMm;
  return (AXIAL_CONCRETE_STRAIN * (xMm - yMm)) / (xMm - PIVOT_HEIGHT_RATIO * hMm);
}

/** Axial force and moment resisted when the neutral axis is at depth x. */
export function resistanceAtNeutralAxis(
  section: SectionDefinition,
  model: StressModel,
  xMm: number,
): ResistancePoint {
  const { bMm: b, hMm: h, rows } = section;
  const block = Math.min(model.blockRatio * xMm, h);
  const concreteForce = model.blockStress * b * block;
  let n = concreteForce;
  let m = concreteForce * (h / 2 - block / 2);

  for (const row of rows) {
    const strain = strainAt(xMm, row.yMm, h);
    const stress = Math.max(
      -model.steelYield,
      Math.min(model.steelYield, STEEL_MODULUS * strain),
    );
    // Bars inside the stress block displace concrete that is already counted.
    const displaced = row.yMm < block ? model.blockStress : 0;
    const force = (stress - displaced) * row.areaMm2;
    n += force;
    m += force * (h / 2 - row.yMm);
  }
  return { xMm, nKn: n / 1000, mKnm: m / 1e6 };
}

/** Neutral axis depth, in section depths, standing in for "uniformly compressed". */
const X_UNIFORM_FACTOR = 1e6;
const X_MIN_FACTOR = 1e-4;

/** Axial capacity with no moment, kN: the limit as the neutral axis goes to infinity. */
export function maxAxialCapacityKn(section: SectionDefinition, model: StressModel): number {
  return resistanceAtNeutralAxis(section, model, section.hMm * X_UNIFORM_FACTOR).nKn;
}

/**
 * Moment capacity at a given axial load, found by bisecting on the neutral
 * axis depth (axial force rises monotonically with it). Returns null when the
 * load is outside what the section can resist: above its axial capacity,
 * or in tension beyond what the bars can carry.
 */
export function momentCapacityAtAxial(
  section: SectionDefinition,
  model: StressModel,
  nKn: number,
): ResistancePoint | null {
  const h = section.hMm;
  let lo = h * X_MIN_FACTOR;
  let hi = h * X_UNIFORM_FACTOR;
  if (nKn < resistanceAtNeutralAxis(section, model, lo).nKn) return null;
  if (nKn > resistanceAtNeutralAxis(section, model, hi).nKn) return null;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (resistanceAtNeutralAxis(section, model, mid).nKn < nKn) lo = mid;
    else hi = mid;
  }
  const point = resistanceAtNeutralAxis(section, model, (lo + hi) / 2);
  return { ...point, mKnm: Math.abs(point.mKnm) };
}

/**
 * Points along the interaction curve from zero axial load up to the axial
 * capacity, for plotting. Moment is positive; for a symmetric section the
 * curve is the same for reversed bending.
 */
export function interactionCurve(
  section: SectionDefinition,
  model: StressModel,
  pointCount = 48,
): Array<{ nKn: number; mKnm: number }> {
  const h = section.hMm;
  const nMax = maxAxialCapacityKn(section, model);
  const points: Array<{ nKn: number; mKnm: number }> = [];
  const atZero = momentCapacityAtAxial(section, model, 0);
  if (atZero) points.push({ nKn: 0, mKnm: atZero.mKnm });
  // Sample the neutral axis geometrically so detail is concentrated where the curve bends.
  const xStart = h * 0.02;
  const xEnd = h * 40;
  for (let i = 0; i <= pointCount; i++) {
    const x = xStart * Math.pow(xEnd / xStart, i / pointCount);
    const p = resistanceAtNeutralAxis(section, model, x);
    if (p.nKn >= 0 && p.nKn <= nMax) points.push({ nKn: p.nKn, mKnm: Math.abs(p.mKnm) });
  }
  points.push({ nKn: nMax, mKnm: 0 });
  return points.sort((a, b) => a.nKn - b.nKn);
}
