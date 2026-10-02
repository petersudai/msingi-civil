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
 * Eurocode 2 (EN 1992-1-1:2004) beam design: bending with the rectangular
 * stress block, and shear by the variable strut inclination method.
 *
 * Nationally Determined Parameters use the EN recommended values, except the
 * long-term strength factor alpha_cc, which defaults to the conservative
 * 0.85 (the value most national annexes adopt for bending). The Kenya National
 * Annex values are NOT built in: check them and override under Advanced.
 *
 * Greek letters are spelled out in the working strings because the PDF fonts
 * carry no Greek glyphs.
 */

/** Stress block depth factor, fck <= 50 N/mm². EN 1992-1-1 cl. 3.1.7(3). */
const LAMBDA = 0.8;
/** Stress block strength factor, fck <= 50 N/mm². EN 1992-1-1 cl. 3.1.7(3). */
const ETA = 1.0;
/** Ductility limit constants, no moment redistribution (delta = 1). EN 1992-1-1 cl. 5.5(4), fck <= 50. */
const K1_REDISTRIBUTION = 0.44;
const K2_REDISTRIBUTION = 1.25 * (0.6 + 0.0014 / ULTIMATE_CONCRETE_STRAIN);
/** Neutral axis depth limit x/d with no redistribution: (1 - k1) / k2 = 0.448. */
const XI_LIMIT = (1 - K1_REDISTRIBUTION) / K2_REDISTRIBUTION;
/** Strut inclination limits for shear: cot(theta) between 1 and 2.5. EN 1992-1-1 cl. 6.2.3(2). */
const COT_THETA_MAX = 2.5;
const COT_THETA_MIN = 1.0;
/** Internal lever arm assumed for shear design, as a fraction of d. EN 1992-1-1 cl. 6.2.3(1). */
const SHEAR_LEVER_ARM_RATIO = 0.9;
/** Coefficient for web crushing strength reduction, no axial prestress. EN 1992-1-1 cl. 6.2.3(3). */
const ALPHA_CW = 1.0;

export const EC2_GRADES: readonly GradeOption[] = [
  { label: "C20/25", value: 20 },
  { label: "C25/30", value: 25 },
  { label: "C30/37", value: 30 },
  { label: "C35/45", value: 35 },
  { label: "C40/50", value: 40 },
];

/** Mean tensile strength, N/mm². EN 1992-1-1 Table 3.1, fck <= 50. */
export function ec2MeanTensileStrength(fck: number): number {
  return 0.3 * Math.pow(fck, 2 / 3);
}

function designStrengths(p: CodeParameters) {
  return { fcd: (p.alphaCc * p.concreteStrength) / p.gammaC, fyd: p.fy / p.gammaS };
}

/** Section parameter at the neutral-axis limit: eta * lambda * xi * (1 - lambda * xi / 2). */
export function ec2LimitingK(): number {
  return ETA * LAMBDA * XI_LIMIT * (1 - (LAMBDA * XI_LIMIT) / 2);
}

function designFlexure({ momentKnm, geometry, params }: FlexureInput): FlexureOutcome {
  const { bMm: b, hMm: h, dMm: d, dPrimeMm: dp } = geometry;
  const { fcd, fyd } = designStrengths(params);
  const fck = params.concreteStrength;
  const M = momentKnm * 1e6;

  const k = M / (b * d * d * fcd);
  const kLim = ec2LimitingK();

  const fctm = ec2MeanTensileStrength(fck);
  const asMin = Math.max(((0.26 * fctm) / params.fy) * b * d, 0.0013 * b * d);
  const asMax = MAX_STEEL_RATIO * b * h;

  const steps: WorkingStep[] = [
    {
      title: "Design strengths",
      formula: "f_cd = alpha_cc × f_ck / gamma_c ;  f_yd = f_yk / gamma_s",
      substitution: `f_cd = ${formatTrimmed(params.alphaCc, 3)} × ${fck} / ${formatTrimmed(params.gammaC, 2)} ;  f_yd = ${params.fy} / ${formatTrimmed(params.gammaS, 2)}`,
      result: `f_cd = ${formatNumber(fcd, 2)} N/mm², f_yd = ${formatNumber(fyd, 1)} N/mm²`,
      note: "EN 1992-1-1 cl. 3.1.6 and 2.4.2.4.",
    },
    {
      title: "Section parameter",
      formula: "K = M_Ed / (b × d² × f_cd) ;  K_lim = eta × lambda × (x/d)_lim × (1 − lambda × (x/d)_lim / 2)",
      substitution: `K = ${formatNumber(M, 0)} / (${formatNumber(b, 0)} × ${formatNumber(d, 1)}² × ${formatNumber(fcd, 2)}) ;  K_lim = ${ETA} × ${LAMBDA} × ${formatTrimmed(XI_LIMIT, 3)} × (1 − ${LAMBDA} × ${formatTrimmed(XI_LIMIT, 3)} / 2)`,
      result: `K = ${formatTrimmed(k, 4)}, K_lim = ${formatTrimmed(kLim, 4)}`,
      note: `Neutral axis limited to x/d = ${formatTrimmed(XI_LIMIT, 3)} (no moment redistribution), EN 1992-1-1 cl. 5.5(4).`,
    },
  ];

  const minMaxStep: WorkingStep = {
    title: "Minimum and maximum steel",
    formula: "A_s,min = max(0.26 × f_ctm / f_yk × b × d, 0.0013 × b × d) ;  A_s,max = 0.04 × b × h",
    substitution: `f_ctm = 0.30 × ${fck}^(2/3) = ${formatNumber(fctm, 2)} N/mm² ;  A_s,min = max(${formatNumber(((0.26 * fctm) / params.fy) * b * d, 0)}, ${formatNumber(0.0013 * b * d, 0)})`,
    result: `A_s,min = ${formatNumber(asMin, 0)} mm², A_s,max = ${formatNumber(asMax, 0)} mm²`,
    note: "EN 1992-1-1 cl. 9.2.1.1.",
  };

  if (k <= kLim) {
    const a = 1 - Math.sqrt(1 - (2 * k) / ETA);
    const zRaw = d * (1 - a / 2);
    const z = Math.min(zRaw, MAX_LEVER_ARM_RATIO * d);
    const x = (a * d) / LAMBDA;
    const asCalc = M / (fyd * z);
    steps.push(
      {
        title: "Lever arm",
        formula: "z = d × [0.5 + 0.5 × sqrt(1 − 2K)]  (not more than 0.95 d)",
        substitution: `z = ${formatNumber(d, 1)} × [0.5 + 0.5 × sqrt(1 − 2 × ${formatTrimmed(k, 4)})]`,
        result: `z = ${formatNumber(z, 1)} mm${zRaw > z ? " (capped at 0.95 d)" : ""}, x = ${formatNumber(x, 1)} mm`,
        note: "Section is singly reinforced: K does not exceed K_lim.",
      },
      {
        title: "Tension steel",
        formula: "A_s = M_Ed / (f_yd × z)",
        substitution: `A_s = ${formatNumber(M, 0)} / (${formatNumber(fyd, 1)} × ${formatNumber(z, 1)})`,
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
      kLimit: kLim,
      compressionSteelStressRatio: 0,
      steps,
    };
  }

  // Doubly reinforced: concrete carries M_lim, compression steel carries the rest.
  const mLim = kLim * b * d * d * fcd;
  const xLim = XI_LIMIT * d;
  const zLim = d * (1 - (LAMBDA * XI_LIMIT) / 2);
  const epsSc = ULTIMATE_CONCRETE_STRAIN * (1 - dp / xLim);

  const base = {
    reinforcement: "doubly" as const,
    momentKnm,
    asMinMm2: asMin,
    asMaxMm2: asMax,
    leverArmMm: zLim,
    neutralAxisMm: xLim,
    kValue: k,
    kLimit: kLim,
  };

  if (epsSc <= 0) {
    steps.push({
      title: "Compression steel strain",
      formula: "eps_sc = eps_cu3 × (1 − d' / x_lim)",
      substitution: `eps_sc = ${ULTIMATE_CONCRETE_STRAIN} × (1 − ${formatNumber(dp, 1)} / ${formatNumber(xLim, 1)})`,
      result: `${formatTrimmed(epsSc, 5)} (no compression)`,
      note: "Compression steel sits at or above the neutral axis, so it carries no compression.",
    });
    return {
      ...base,
      feasible: false,
      infeasibleReason: `Compression steel (d' = ${formatNumber(dp, 0)} mm) is above the neutral axis (x = ${formatNumber(xLim, 0)} mm), so it cannot help. Increase the beam depth.`,
      asCalcMm2: 0,
      asDesignMm2: 0,
      asCompMm2: 0,
      compressionSteelStressRatio: 0,
      steps,
    };
  }

  const fsc = Math.min(fyd, STEEL_MODULUS_N_MM2 * epsSc);
  const as2 = (M - mLim) / (fsc * (d - dp));
  const as1 = mLim / (fyd * zLim) + (as2 * fsc) / fyd;

  steps.push(
    {
      title: "Moment carried by the concrete alone",
      formula: "M_lim = K_lim × b × d² × f_cd ;  z_lim = d × (1 − lambda × (x/d)_lim / 2)",
      substitution: `M_lim = ${formatTrimmed(kLim, 4)} × ${formatNumber(b, 0)} × ${formatNumber(d, 1)}² × ${formatNumber(fcd, 2)} ;  z_lim = ${formatNumber(d, 1)} × (1 − ${LAMBDA} × ${formatTrimmed(XI_LIMIT, 3)} / 2)`,
      result: `M_lim = ${formatNumber(mLim / 1e6, 1)} kNm, z_lim = ${formatNumber(zLim, 1)} mm`,
      note: "K exceeds K_lim, so the section needs compression steel.",
    },
    {
      title: "Compression steel stress",
      formula: "eps_sc = eps_cu3 × (1 − d' / x_lim) ;  f_sc = min(f_yd, E_s × eps_sc)",
      substitution: `eps_sc = ${ULTIMATE_CONCRETE_STRAIN} × (1 − ${formatNumber(dp, 1)} / ${formatNumber(xLim, 1)}) = ${formatTrimmed(epsSc, 5)}`,
      result: `f_sc = ${formatNumber(fsc, 1)} N/mm²${fsc < fyd ? " (below yield)" : " (yielding)"}`,
    },
    {
      title: "Compression steel",
      formula: "A_s2 = (M_Ed − M_lim) / (f_sc × (d − d'))",
      substitution: `A_s2 = (${formatNumber(M, 0)} − ${formatNumber(mLim, 0)}) / (${formatNumber(fsc, 1)} × (${formatNumber(d, 1)} − ${formatNumber(dp, 1)}))`,
      result: `${formatNumber(as2, 0)} mm²`,
    },
    {
      title: "Tension steel",
      formula: "A_s1 = M_lim / (f_yd × z_lim) + A_s2 × f_sc / f_yd",
      substitution: `A_s1 = ${formatNumber(mLim, 0)} / (${formatNumber(fyd, 1)} × ${formatNumber(zLim, 1)}) + ${formatNumber(as2, 0)} × ${formatNumber(fsc, 1)} / ${formatNumber(fyd, 1)}`,
      result: `${formatNumber(as1, 0)} mm²`,
    },
    minMaxStep,
  );

  return {
    ...base,
    feasible: true,
    asCalcMm2: as1,
    asDesignMm2: Math.max(as1, asMin),
    asCompMm2: as2,
    compressionSteelStressRatio: fsc / fyd,
    steps,
  };
}

function designShear({ vEdKn, geometry, asTensionMm2, params }: ShearInput): ShearOutcome {
  const { bMm: b, dMm: d } = geometry;
  const { fcd } = designStrengths(params);
  const fck = params.concreteStrength;
  const V = vEdKn * 1000;

  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);
  const rhoL = Math.min(asTensionMm2 / (b * d), 0.02);
  const cRdc = 0.18 / params.gammaC;
  const vRdcStress = cRdc * k * Math.cbrt(100 * rhoL * fck);
  const vMinStress = 0.035 * Math.pow(k, 1.5) * Math.sqrt(fck);
  const vRdc = Math.max(vRdcStress, vMinStress) * b * d;

  const z = SHEAR_LEVER_ARM_RATIO * d;
  const nu1 = 0.6 * (1 - fck / 250);
  // Force that gets divided by (cot + tan) to give V_Rd,max at a given strut angle.
  const strutCapacityBase = ALPHA_CW * b * z * nu1 * fcd;
  const vMax45 = strutCapacityBase / (COT_THETA_MIN + 1 / COT_THETA_MIN);
  const vMaxLow = strutCapacityBase / (COT_THETA_MAX + 1 / COT_THETA_MAX);
  const fywd = params.fyv / params.gammaS;
  const rhoWMin = (0.08 * Math.sqrt(fck)) / params.fyv;
  const aswPerSMin = rhoWMin * b;
  const maxSpacing = MAX_LINK_SPACING_RATIO * d;

  const steps: WorkingStep[] = [
    {
      title: "Shear resistance without links",
      formula: "V_Rd,c = max[C_Rd,c × k × (100 × rho_l × f_ck)^(1/3), v_min] × b × d ;  C_Rd,c = 0.18 / gamma_c ;  k = 1 + sqrt(200 / d) (max 2.0)",
      substitution: `k = ${formatTrimmed(k, 3)}, rho_l = ${formatNumber(asTensionMm2, 0)} / (${formatNumber(b, 0)} × ${formatNumber(d, 1)}) = ${formatTrimmed(rhoL, 5)} ;  v_Rd,c = ${formatTrimmed(cRdc, 3)} × ${formatTrimmed(k, 3)} × (100 × ${formatTrimmed(rhoL, 5)} × ${fck})^(1/3) = ${formatTrimmed(vRdcStress, 3)} N/mm² ;  v_min = 0.035 × k^1.5 × sqrt(f_ck) = ${formatTrimmed(vMinStress, 3)} N/mm²`,
      result: `V_Rd,c = ${formatNumber(vRdc / 1000, 1)} kN`,
      note: "EN 1992-1-1 cl. 6.2.2(1), no axial force. rho_l uses the required tension steel, so it is conservative once bars are rounded up.",
    },
  ];

  if (V <= vRdc) {
    steps.push({
      title: "Minimum links",
      formula: "A_sw / s >= rho_w,min × b ;  rho_w,min = 0.08 × sqrt(f_ck) / f_yk",
      substitution: `rho_w,min = 0.08 × sqrt(${fck}) / ${params.fyv} = ${formatTrimmed(rhoWMin, 5)} ;  A_sw / s >= ${formatTrimmed(rhoWMin, 5)} × ${formatNumber(b, 0)}`,
      result: `${formatTrimmed(aswPerSMin, 4)} mm²/mm`,
      note: `V_Ed (${formatNumber(vEdKn, 1)} kN) does not exceed V_Rd,c, so only minimum links are needed. EN 1992-1-1 cl. 9.2.2(5).`,
    });
    return {
      verdict: "links-minimum",
      vEdKn,
      concreteCapacityKn: vRdc / 1000,
      maxCapacityKn: vMax45 / 1000,
      aswPerSMmReq: aswPerSMin,
      maxSpacingMm: maxSpacing,
      steps,
    };
  }

  steps.push({
    title: "Web crushing limit",
    formula: "V_Rd,max = alpha_cw × b × z × nu_1 × f_cd / (cot(theta) + tan(theta)) ;  z = 0.9 d ;  nu_1 = 0.6 × (1 − f_ck / 250)",
    substitution: `z = ${formatNumber(z, 1)} mm, nu_1 = ${formatTrimmed(nu1, 3)} ;  V_Rd,max = ${formatNumber(vMaxLow / 1000, 1)} kN at cot(theta) = 2.5, ${formatNumber(vMax45 / 1000, 1)} kN at cot(theta) = 1.0`,
    result: `Upper limit ${formatNumber(vMax45 / 1000, 1)} kN`,
    note: "EN 1992-1-1 cl. 6.2.3(3). Shallowest strut angle (cot 2.5) needs the least steel.",
  });

  if (V > vMax45) {
    return {
      verdict: "section-inadequate",
      vEdKn,
      concreteCapacityKn: vRdc / 1000,
      maxCapacityKn: vMax45 / 1000,
      aswPerSMmReq: 0,
      maxSpacingMm: maxSpacing,
      steps,
    };
  }

  let cotTheta = COT_THETA_MAX;
  if (V > vMaxLow) {
    const sin2Theta = (2 * V) / strutCapacityBase;
    const theta = 0.5 * Math.asin(Math.min(1, sin2Theta));
    cotTheta = Math.max(COT_THETA_MIN, Math.min(COT_THETA_MAX, 1 / Math.tan(theta)));
  }
  const aswPerSCalc = V / (z * fywd * cotTheta);
  const aswPerS = Math.max(aswPerSCalc, aswPerSMin);

  steps.push({
    title: "Links",
    formula: "A_sw / s = V_Ed / (z × f_ywd × cot(theta)) ;  f_ywd = f_ywk / gamma_s",
    substitution: `cot(theta) = ${formatTrimmed(cotTheta, 2)} ;  f_ywd = ${params.fyv} / ${formatTrimmed(params.gammaS, 2)} = ${formatNumber(fywd, 1)} N/mm² ;  A_sw / s = ${formatNumber(V, 0)} / (${formatNumber(z, 1)} × ${formatNumber(fywd, 1)} × ${formatTrimmed(cotTheta, 2)})`,
    result: `${formatTrimmed(aswPerS, 4)} mm²/mm`,
    note: `Not less than the minimum (${formatTrimmed(aswPerSMin, 4)} mm²/mm). The extra tension force 0.5 × V_Ed × cot(theta) must also be covered by the tension steel, EN 1992-1-1 cl. 6.2.3(7).`,
  });

  return {
    verdict: "links-designed",
    vEdKn,
    concreteCapacityKn: vRdc / 1000,
    maxCapacityKn: vMax45 / 1000,
    aswPerSMmReq: aswPerS,
    maxSpacingMm: maxSpacing,
    steps,
  };
}

function assumptions(p: CodeParameters): Assumption[] {
  const nationalNote =
    "EN recommended value; confirm against the Kenya National Annex (KS EN 1992-1-1)";
  return [
    { label: "Concrete strength f_ck", value: `${p.concreteStrength} N/mm²` },
    { label: "Steel yield f_yk (main / links)", value: `${p.fy} / ${p.fyv} N/mm²` },
    {
      label: "Long-term strength factor alpha_cc",
      value: formatTrimmed(p.alphaCc, 2),
      source:
        p.alphaCc === 1
          ? "EN recommended value (1.0). Many national annexes use 0.85 for bending"
          : "Conservative 0.85 used by most national annexes for bending; EN recommends 1.0. Confirm against the Kenya National Annex",
    },
    { label: "Concrete partial factor gamma_c", value: formatTrimmed(p.gammaC, 2), source: nationalNote },
    { label: "Steel partial factor gamma_s", value: formatTrimmed(p.gammaS, 2), source: nationalNote },
    {
      label: "Stress block",
      value: "Rectangular, lambda 0.8, eta 1.0",
      source: "EN 1992-1-1 cl. 3.1.7(3), valid for f_ck up to 50 N/mm²",
    },
    {
      label: "Moment redistribution",
      value: "None (delta = 1.0)",
      source: "Neutral axis limited to x/d = 0.448",
    },
    {
      label: "Shear model",
      value: "Variable strut, cot(theta) 1.0 to 2.5",
      source: "Vertical links, no axial force, z = 0.9 d",
    },
  ];
}

const basis: readonly SourceReference[] = [
  {
    label: "EN 1992-1-1:2004",
    note: "Bending: cl. 3.1.6, 3.1.7, 5.5(4), 6.1. Shear: cl. 6.2.2, 6.2.3. Detailing: cl. 8.2, 9.2.1.1, 9.2.2.",
  },
  {
    label: "EN 1990 and EN 1991-1-1",
    note: "Ultimate load combination 1.35 G + 1.5 Q (EN 1990 eq. 6.10) and reinforced concrete unit weight 25 kN/m³.",
  },
  {
    label: "National Annex",
    note: "Nationally Determined Parameters use EN recommended values except alpha_cc (0.85). The Kenya National Annex has not been applied; check it before relying on these results.",
  },
];

export const ec2: BeamCode = {
  id: "ec2",
  name: "Eurocode 2 (EN 1992-1-1)",
  shortName: "Eurocode 2",
  strengthSymbol: "f_ck",
  concreteGrades: EC2_GRADES,
  defaults: {
    concreteStrength: 25,
    fy: 500,
    fyv: 500,
    gammaG: 1.35,
    gammaQ: 1.5,
    densityKnM3: 25,
    alphaCc: 0.85,
    gammaC: 1.5,
    gammaS: 1.15,
  },
  loadCombinationLabel: "EN 1990 eq. 6.10: 1.35 G + 1.5 Q",
  clauses: {
    steelLimit: "EN 1992-1-1 cl. 9.2.1.1(3)",
    shearLimit: "EN 1992-1-1 cl. 6.2.3(3)",
    compressionSteel: "EN 1992-1-1 cl. 3.1.7 and 6.1",
  },
  designFlexure,
  designShear,
  assumptions,
  basis,
  usesNationalParameters: true,
};
