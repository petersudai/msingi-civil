import type { Assumption, SourceReference, WorkingStep } from "../../types";
import { formatNumber, formatTrimmed } from "../../format";
import {
  MAX_LEVER_ARM_RATIO,
  MAX_LINK_SPACING_RATIO,
  MAX_STEEL_RATIO,
  STEEL_MODULUS_N_MM2,
  ULTIMATE_CONCRETE_STRAIN,
} from "../constants";
import type {
  BeamCode,
  CodeParameters,
  FlexureInput,
  FlexureOutcome,
  GradeOption,
  ShearInput,
  ShearOutcome,
} from "./types";

/**
 * BS 8110-1:1997 beam design: simplified stress block for bending (cl. 3.4.4)
 * and the vc / link table method for shear (cl. 3.4.5).
 *
 * BS 8110 was withdrawn in the UK when the Eurocodes replaced it, and Kenya
 * has adopted the Eurocodes. It stays here because older drawings, existing
 * buildings and many site engineers still work to it. Check what your
 * approving authority accepts for new designs.
 */

/** Limiting K = M / (b d² fcu) with no moment redistribution (beta_b = 1). BS 8110-1 cl. 3.4.4.4. */
const K_LIMIT = 0.156;
/** Material factor for steel: design stress 0.87 fy. BS 8110-1 Table 2.2. */
const STEEL_DESIGN_FACTOR = 0.87;
/** Material factor for shear resistance of concrete. BS 8110-1 Table 3.8 note. */
const GAMMA_M_SHEAR = 1.25;
/** Concrete grade above which the vc strength factor stops increasing. BS 8110-1 Table 3.8 note. */
const FCU_CAP_FOR_VC = 40;
/** Cap on design shear stress, N/mm². BS 8110-1 cl. 3.4.5.2. */
const V_MAX_ABSOLUTE = 5.0;
/** Link steel yield used in design is capped at this, N/mm². BS 8110-1 cl. 3.4.5.1 note. */
const FYV_DESIGN_CAP = 460;
/** Nominal link requirement is 0.4 N/mm² over b. BS 8110-1 Table 3.7. */
const NOMINAL_LINK_STRESS = 0.4;
/** Minimum tension steel, fraction of b h, for high yield steel. BS 8110-1 Table 3.25. */
const MIN_STEEL_RATIO_HIGH_YIELD = 0.0013;

export const BS8110_GRADES: readonly GradeOption[] = [
  { label: "C25", value: 25 },
  { label: "C30", value: 30 },
  { label: "C35", value: 35 },
  { label: "C40", value: 40 },
  { label: "C45", value: 45 },
];

/** Design concrete shear stress vc, N/mm². BS 8110-1 Table 3.8 formula. */
export function bs8110Vc(
  asTensionMm2: number,
  bMm: number,
  dMm: number,
  fcu: number,
): number {
  const steelPercent = Math.min((100 * asTensionMm2) / (bMm * dMm), 3.0);
  const depthFactor = Math.max(400 / dMm, 1.0);
  const gradeFactor = Math.cbrt(Math.min(fcu, FCU_CAP_FOR_VC) / 25);
  return (
    ((0.79 * Math.cbrt(steelPercent) * Math.pow(depthFactor, 0.25)) / GAMMA_M_SHEAR) *
    gradeFactor
  );
}

function designFlexure({ momentKnm, geometry, params }: FlexureInput): FlexureOutcome {
  const { bMm: b, hMm: h, dMm: d, dPrimeMm: dp } = geometry;
  const fcu = params.concreteStrength;
  const fy = params.fy;
  const fyDesign = STEEL_DESIGN_FACTOR * fy;
  const M = momentKnm * 1e6;

  const k = M / (b * d * d * fcu);
  const asMin = MIN_STEEL_RATIO_HIGH_YIELD * b * h;
  const asMax = MAX_STEEL_RATIO * b * h;

  const steps: WorkingStep[] = [
    {
      title: "Section parameter",
      formula: "K = M / (b × d² × f_cu) ;  K' = 0.156",
      substitution: `K = ${formatNumber(M, 0)} / (${formatNumber(b, 0)} × ${formatNumber(d, 1)}² × ${fcu})`,
      result: `K = ${formatTrimmed(k, 4)}, K' = ${K_LIMIT}`,
      note: "BS 8110-1 cl. 3.4.4.4. K' = 0.156 means no moment redistribution.",
    },
  ];

  const minMaxStep: WorkingStep = {
    title: "Minimum and maximum steel",
    formula: "A_s,min = 0.13% × b × h ;  A_s,max = 4% × b × h",
    substitution: `A_s,min = 0.0013 × ${formatNumber(b, 0)} × ${formatNumber(h, 0)} ;  A_s,max = 0.04 × ${formatNumber(b, 0)} × ${formatNumber(h, 0)}`,
    result: `A_s,min = ${formatNumber(asMin, 0)} mm², A_s,max = ${formatNumber(asMax, 0)} mm²`,
    note: "BS 8110-1 Table 3.25 (high yield steel) and cl. 3.12.6.1.",
  };

  if (k <= K_LIMIT) {
    const zRaw = d * (0.5 + Math.sqrt(0.25 - k / 0.9));
    const z = Math.min(zRaw, MAX_LEVER_ARM_RATIO * d);
    const x = (d - zRaw) / 0.45;
    const asCalc = M / (fyDesign * z);
    steps.push(
      {
        title: "Lever arm",
        formula: "z = d × [0.5 + sqrt(0.25 − K / 0.9)]  (not more than 0.95 d)",
        substitution: `z = ${formatNumber(d, 1)} × [0.5 + sqrt(0.25 − ${formatTrimmed(k, 4)} / 0.9)]`,
        result: `z = ${formatNumber(z, 1)} mm${zRaw > z ? " (capped at 0.95 d)" : ""}, x = ${formatNumber(x, 1)} mm`,
        note: "Section is singly reinforced: K does not exceed K'.",
      },
      {
        title: "Tension steel",
        formula: "A_s = M / (0.87 × f_y × z)",
        substitution: `A_s = ${formatNumber(M, 0)} / (0.87 × ${fy} × ${formatNumber(z, 1)})`,
        result: `${formatNumber(asCalc, 0)} mm²`,
      },
      minMaxStep,
    );
    return {
      feasible: true,
      reinforcement: "singly",
      momentKnm,
      asCalcMm2: asCalc,
      asMinMm2: asMin,
      asDesignMm2: Math.max(asCalc, asMin),
      asCompMm2: 0,
      asMaxMm2: asMax,
      leverArmMm: z,
      neutralAxisMm: x,
      kValue: k,
      kLimit: K_LIMIT,
      compressionSteelStressRatio: 0,
      steps,
    };
  }

  // Doubly reinforced
  const z = d * (0.5 + Math.sqrt(0.25 - K_LIMIT / 0.9));
  const x = (d - z) / 0.45;
  const base = {
    reinforcement: "doubly" as const,
    momentKnm,
    asMinMm2: asMin,
    asMaxMm2: asMax,
    leverArmMm: z,
    neutralAxisMm: x,
    kValue: k,
    kLimit: K_LIMIT,
  };

  const dpOverX = dp / x;
  const compressionStrain = ULTIMATE_CONCRETE_STRAIN * (1 - dpOverX);
  if (compressionStrain <= 0) {
    steps.push({
      title: "Compression steel position",
      formula: "d' / x must be below 1.0",
      substitution: `d' / x = ${formatNumber(dp, 1)} / ${formatNumber(x, 1)}`,
      result: formatTrimmed(dpOverX, 3),
      note: "Compression steel sits at or above the neutral axis, so it carries no compression.",
    });
    return {
      ...base,
      feasible: false,
      infeasibleReason: `Compression steel (d' = ${formatNumber(dp, 0)} mm) is above the neutral axis (x = ${formatNumber(x, 0)} mm), so it cannot help. Increase the beam depth.`,
      asCalcMm2: 0,
      asDesignMm2: 0,
      asCompMm2: 0,
      compressionSteelStressRatio: 0,
      steps,
    };
  }

  const fsc = Math.min(fyDesign, STEEL_MODULUS_N_MM2 * compressionStrain);
  const asComp = ((k - K_LIMIT) * fcu * b * d * d) / (fsc * (d - dp));
  const asCalc =
    (K_LIMIT * fcu * b * d * d) / (fyDesign * z) + (asComp * fsc) / fyDesign;

  steps.push(
    {
      title: "Lever arm at the limit",
      formula: "z = d × [0.5 + sqrt(0.25 − K' / 0.9)] ;  x = (d − z) / 0.45",
      substitution: `z = ${formatNumber(d, 1)} × [0.5 + sqrt(0.25 − ${K_LIMIT} / 0.9)]`,
      result: `z = ${formatNumber(z, 1)} mm, x = ${formatNumber(x, 1)} mm`,
      note: "K exceeds K', so the section needs compression steel.",
    },
    {
      title: "Compression steel stress",
      formula: "f_sc = min(0.87 × f_y, 700 × (1 − d' / x))",
      substitution: `d' / x = ${formatNumber(dp, 1)} / ${formatNumber(x, 1)} = ${formatTrimmed(dpOverX, 3)} ;  f_sc = min(${formatNumber(fyDesign, 1)}, ${formatNumber(700 * (1 - dpOverX), 1)})`,
      result: `f_sc = ${formatNumber(fsc, 1)} N/mm²${fsc < fyDesign ? " (below yield)" : " (yielding)"}`,
      note: "Reduces to the standard 0.87 f_y when d'/x is small enough (BS 8110-1 cl. 3.4.4.1, Fig. 2.2).",
    },
    {
      title: "Compression steel",
      formula: "A_s' = (K − K') × f_cu × b × d² / (f_sc × (d − d'))",
      substitution: `A_s' = (${formatTrimmed(k, 4)} − ${K_LIMIT}) × ${fcu} × ${formatNumber(b, 0)} × ${formatNumber(d, 1)}² / (${formatNumber(fsc, 1)} × (${formatNumber(d, 1)} − ${formatNumber(dp, 1)}))`,
      result: `${formatNumber(asComp, 0)} mm²`,
    },
    {
      title: "Tension steel",
      formula: "A_s = K' × f_cu × b × d² / (0.87 × f_y × z) + A_s' × f_sc / (0.87 × f_y)",
      substitution: `A_s = ${K_LIMIT} × ${fcu} × ${formatNumber(b, 0)} × ${formatNumber(d, 1)}² / (0.87 × ${fy} × ${formatNumber(z, 1)}) + ${formatNumber(asComp, 0)} × ${formatNumber(fsc, 1)} / ${formatNumber(fyDesign, 1)}`,
      result: `${formatNumber(asCalc, 0)} mm²`,
    },
    minMaxStep,
  );

  return {
    ...base,
    feasible: true,
    asCalcMm2: asCalc,
    asDesignMm2: Math.max(asCalc, asMin),
    asCompMm2: asComp,
    compressionSteelStressRatio: fsc / fyDesign,
    steps,
  };
}

function designShear({ vEdKn, geometry, asTensionMm2, params }: ShearInput): ShearOutcome {
  const { bMm: b, dMm: d } = geometry;
  const fcu = params.concreteStrength;
  const fyvDesign = STEEL_DESIGN_FACTOR * Math.min(params.fyv, FYV_DESIGN_CAP);
  const V = vEdKn * 1000;

  const v = V / (b * d);
  const vMax = Math.min(0.8 * Math.sqrt(fcu), V_MAX_ABSOLUTE);
  const vc = bs8110Vc(asTensionMm2, b, d, fcu);
  const maxSpacing = MAX_LINK_SPACING_RATIO * d;
  const steelPercent = Math.min((100 * asTensionMm2) / (b * d), 3.0);

  const steps: WorkingStep[] = [
    {
      title: "Shear stress",
      formula: "v = V / (b × d) ;  v_max = min(0.8 × sqrt(f_cu), 5 N/mm²)",
      substitution: `v = ${formatNumber(V, 0)} / (${formatNumber(b, 0)} × ${formatNumber(d, 1)}) ;  v_max = min(0.8 × sqrt(${fcu}), 5)`,
      result: `v = ${formatTrimmed(v, 3)} N/mm², v_max = ${formatTrimmed(vMax, 3)} N/mm²`,
      note: "BS 8110-1 cl. 3.4.5.2.",
    },
    {
      title: "Concrete shear stress",
      formula: "v_c = 0.79 × (100 A_s / (b d))^(1/3) × (400 / d)^(1/4) / 1.25 × (f_cu / 25)^(1/3)",
      substitution: `100 A_s / (b d) = ${formatTrimmed(steelPercent, 3)} (max 3.0) ;  400 / d = ${formatTrimmed(Math.max(400 / d, 1), 3)} (min 1.0) ;  (min(f_cu, 40) / 25)^(1/3) = ${formatTrimmed(Math.cbrt(Math.min(fcu, FCU_CAP_FOR_VC) / 25), 3)}`,
      result: `v_c = ${formatTrimmed(vc, 3)} N/mm²`,
      note: "BS 8110-1 Table 3.8. Uses the required tension steel, so it is conservative once bars are rounded up.",
    },
  ];

  if (v > vMax) {
    return {
      verdict: "section-inadequate",
      vEdKn,
      concreteCapacityKn: (vc * b * d) / 1000,
      maxCapacityKn: (vMax * b * d) / 1000,
      aswPerSMmReq: 0,
      maxSpacingMm: maxSpacing,
      steps,
    };
  }

  const minimumOnly = v <= vc + NOMINAL_LINK_STRESS;
  const aswPerS = minimumOnly
    ? (NOMINAL_LINK_STRESS * b) / fyvDesign
    : (b * (v - vc)) / fyvDesign;

  steps.push({
    title: minimumOnly ? "Minimum links" : "Links",
    formula: minimumOnly
      ? "A_sv / s_v >= 0.4 × b / (0.87 × f_yv)"
      : "A_sv / s_v >= b × (v − v_c) / (0.87 × f_yv)",
    substitution: minimumOnly
      ? `A_sv / s_v >= 0.4 × ${formatNumber(b, 0)} / (0.87 × ${Math.min(params.fyv, FYV_DESIGN_CAP)})`
      : `A_sv / s_v >= ${formatNumber(b, 0)} × (${formatTrimmed(v, 3)} − ${formatTrimmed(vc, 3)}) / (0.87 × ${Math.min(params.fyv, FYV_DESIGN_CAP)})`,
    result: `${formatTrimmed(aswPerS, 4)} mm²/mm`,
    note: minimumOnly
      ? `v does not exceed v_c + 0.4 (${formatTrimmed(vc + NOMINAL_LINK_STRESS, 3)} N/mm²), so nominal links are enough. BS 8110-1 Table 3.7.`
      : "v exceeds v_c + 0.4, so links are designed to carry the excess. BS 8110-1 Table 3.7.",
  });

  return {
    verdict: minimumOnly ? "links-minimum" : "links-designed",
    vEdKn,
    concreteCapacityKn: (vc * b * d) / 1000,
    maxCapacityKn: (vMax * b * d) / 1000,
    aswPerSMmReq: aswPerS,
    maxSpacingMm: maxSpacing,
    steps,
  };
}

function assumptions(p: CodeParameters): Assumption[] {
  return [
    { label: "Concrete strength f_cu", value: `${p.concreteStrength} N/mm²` },
    { label: "Steel yield f_y (main / links)", value: `${p.fy} / ${p.fyv} N/mm²` },
    {
      label: "Steel design stress",
      value: "0.87 × f_y",
      source: "BS 8110-1 Table 2.2 (gamma_m = 1.15). Link steel capped at 460 N/mm²",
    },
    {
      label: "Stress block",
      value: "Simplified rectangular, K' = 0.156",
      source: "BS 8110-1 cl. 3.4.4.1 and 3.4.4.4",
    },
    {
      label: "Moment redistribution",
      value: "None (beta_b = 1.0)",
      source: "K' = 0.156 applies",
    },
    {
      label: "Shear resistance factor gamma_m",
      value: "1.25",
      source: "BS 8110-1 Table 3.8 note",
    },
  ];
}

const basis: readonly SourceReference[] = [
  {
    label: "BS 8110-1:1997",
    note: "Bending: cl. 3.4.4. Shear: cl. 3.4.5, Tables 3.7 and 3.8. Detailing: cl. 3.12.5, 3.12.6.1, Table 3.25.",
  },
  {
    label: "Loads",
    note: "Ultimate combination 1.4 Gk + 1.6 Qk (BS 8110-1 Table 2.1) and reinforced concrete unit weight 24 kN/m³ (BS 648).",
  },
  {
    label: "Status of the code",
    note: "BS 8110 was withdrawn in the UK and Kenya has adopted the Eurocodes. Confirm your approving authority still accepts it for new designs.",
  },
];

export const bs8110: BeamCode = {
  id: "bs8110",
  name: "BS 8110-1:1997",
  shortName: "BS 8110",
  strengthSymbol: "f_cu",
  concreteGrades: BS8110_GRADES,
  defaults: {
    concreteStrength: 30,
    fy: 460,
    fyv: 460,
    gammaG: 1.4,
    gammaQ: 1.6,
    densityKnM3: 24,
    alphaCc: 0.85,
    gammaC: 1.5,
    gammaS: 1.15,
  },
  loadCombinationLabel: "BS 8110-1 Table 2.1: 1.4 Gk + 1.6 Qk",
  clauses: {
    steelLimit: "BS 8110-1 cl. 3.12.6.1",
    shearLimit: "BS 8110-1 cl. 3.4.5.2",
    compressionSteel: "BS 8110-1 cl. 3.4.4.1 and 3.4.4.4",
  },
  designFlexure,
  designShear,
  assumptions,
  basis,
  usesNationalParameters: false,
};
