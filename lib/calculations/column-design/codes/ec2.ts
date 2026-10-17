import { EC2_GRADES } from "../../beam-design/codes/ec2";
import { formatNumber, formatTrimmed } from "../../format";
import type { Assumption, SourceReference, WorkingStep } from "../../types";
import { STEEL_MODULUS } from "../constants";
import type {
  BiaxialInput,
  BiaxialOutcome,
  ColumnCode,
  ColumnParameters,
  ColumnShearInput,
  ColumnShearOutcome,
  LinkRules,
  SlendernessInput,
  SlendernessOutcome,
  SteelLimits,
} from "./types";

/**
 * Eurocode 2 (EN 1992-1-1:2004) column check: slenderness by the nominal
 * curvature method (cl. 5.8.8), section resistance by strain compatibility
 * with the rectangular stress block (cl. 3.1.7), and the detailing limits of
 * cl. 9.5.
 *
 * National parameters follow the UK National Annex (see the beam tool for
 * why: no published Kenya National Annex was found).
 *
 * Greek letters are spelled out in the working strings because the PDF fonts
 * carry no Greek glyphs.
 */

/** Stress block depth factor, fck <= 50 N/mm². EN 1992-1-1 cl. 3.1.7(3). */
const LAMBDA_BLOCK = 0.8;
/** Relative axial force at maximum moment capacity, usually taken as 0.4. EN 1992-1-1 cl. 5.8.8.3(3). */
const N_BAL = 0.4;
/** Curvature distribution factor for a constant cross-section (pi squared). EN 1992-1-1 cl. 5.8.8.2(4). */
const CURVATURE_FACTOR_C = 10;
/** Floor on the relative axial force n in the slenderness limit, so a column with almost no load isn't judged "infinitely short". */
const N_FLOOR = 0.01;
/** Strut inclination limits for shear: cot(theta) between 1 and 2.5. EN 1992-1-1 cl. 6.2.3(2). */
const COT_THETA_MAX = 2.5;
const COT_THETA_MIN = 1.0;
/** Internal lever arm for shear, as a fraction of d. EN 1992-1-1 cl. 6.2.3(1). */
const SHEAR_LEVER_ARM_RATIO = 0.9;
/** Coefficient for the effect of axial compression on shear resistance. EN 1992-1-1 cl. 6.2.2(1). */
const K1_AXIAL = 0.15;
/** Slenderness above which the nominal curvature method is not relied on in this tool. */
const SCOPE_LAMBDA_MAX = 140;

function designStrengths(p: ColumnParameters) {
  return { fcd: (p.alphaCc * p.concreteStrength) / p.gammaC, fyd: p.fy / p.gammaS };
}

function slenderness(input: SlendernessInput): SlendernessOutcome {
  const { nEdKn, mTopKnm, mBotKnm, heightMm, beta, geometry: g, params } = input;
  const { fcd, fyd } = designStrengths(params);
  const acMm2 = g.bMm * g.hMm;
  const nN = nEdKn * 1000;

  const m02 = Math.max(Math.abs(mTopKnm), Math.abs(mBotKnm));
  const smaller = Math.abs(mTopKnm) >= Math.abs(mBotKnm) ? mBotKnm : mTopKnm;
  const larger = Math.abs(mTopKnm) >= Math.abs(mBotKnm) ? mTopKnm : mBotKnm;
  // Signed ratio M01 / M02: positive for single curvature.
  const rm = m02 === 0 ? 1 : smaller / larger;
  const m01 = rm * m02;

  const l0 = beta * heightMm;
  const iRadius = g.hMm / Math.sqrt(12);
  const lambda = l0 / iRadius;
  const n = nN / (acMm2 * fcd);
  const omega = (g.asTotalMm2 * fyd) / (acMm2 * fcd);
  const aFactor = 1 / (1 + 0.2 * params.creepRatio);
  const bFactor = Math.sqrt(1 + 2 * omega);
  const cFactor = 1.7 - rm;
  const nUsed = Math.max(n, N_FLOOR);
  const lambdaLim = (20 * aFactor * bFactor * cFactor) / Math.sqrt(nUsed);
  const slender = lambda > lambdaLim;

  const e0 = Math.max(g.hMm / 30, 20);
  const minimumMoment = (nEdKn * e0) / 1000;
  const steps: WorkingStep[] = [];

  steps.push(
    {
      title: "Effective length and slenderness",
      formula: "l_0 = beta × L ;  i = h / sqrt(12) ;  lambda = l_0 / i",
      substitution: `l_0 = ${formatTrimmed(beta, 2)} × ${formatNumber(heightMm, 0)} = ${formatNumber(l0, 0)} mm ;  i = ${formatNumber(g.hMm, 0)} / sqrt(12) = ${formatNumber(iRadius, 1)} mm ;  lambda = ${formatNumber(l0, 0)} / ${formatNumber(iRadius, 1)}`,
      result: `lambda = ${formatNumber(lambda, 1)}`,
      note: "EN 1992-1-1 cl. 5.8.3.2. Slenderness is taken in the plane of bending only.",
    },
    {
      title: "Slenderness limit",
      formula: "lambda_lim = 20 × A × B × C / sqrt(n) ;  A = 1 / (1 + 0.2 phi_ef) ;  B = sqrt(1 + 2 omega) ;  C = 1.7 − r_m",
      substitution: `n = ${formatNumber(nEdKn, 0)} × 10³ / (${formatNumber(acMm2, 0)} × ${formatTrimmed(fcd, 2)}) = ${formatTrimmed(n, 3)}${n < N_FLOOR ? ` (taken as ${N_FLOOR})` : ""} ;  omega = ${formatNumber(g.asTotalMm2, 0)} × ${formatTrimmed(fyd, 1)} / (${formatNumber(acMm2, 0)} × ${formatTrimmed(fcd, 2)}) = ${formatTrimmed(omega, 3)} ;  A = ${formatTrimmed(aFactor, 3)}, B = ${formatTrimmed(bFactor, 3)}, r_m = ${formatTrimmed(rm, 2)}, C = ${formatTrimmed(cFactor, 2)}`,
      result: `lambda_lim = ${formatNumber(lambdaLim, 1)} (${slender ? "slender, second-order moment needed" : "short, second-order effects ignored"})`,
      note: "EN 1992-1-1 cl. 5.8.3.1, with A from the effective creep ratio and B and C calculated from the actual column.",
    },
  );

  let secondOrder = 0;
  let design: number;
  let designNoMin: number;

  if (!slender) {
    designNoMin = m02;
    design = Math.max(m02, minimumMoment);
    steps.push({
      title: "Design moment (short column)",
      formula: "M_Ed = max(M_02 , N_Ed × e_0) ;  e_0 = max(h / 30 , 20 mm)",
      substitution: `e_0 = max(${formatNumber(g.hMm, 0)} / 30 , 20) = ${formatNumber(e0, 1)} mm ;  M_Ed = max(${formatNumber(m02, 1)} , ${formatNumber(nEdKn, 0)} × ${formatNumber(e0, 1)} / 1000)`,
      result: `M_Ed = ${formatNumber(design, 1)} kNm`,
      note: "EN 1992-1-1 cl. 6.1(4): minimum eccentricity.",
    });
  } else {
    const m0e = Math.max(0.6 * m02 + 0.4 * m01, 0.4 * m02);
    const ei = l0 / 400;
    const m0Ed = m0e + (nEdKn * ei) / 1000;
    const nu = 1 + omega;
    const kr = Math.max(0, Math.min(1, (nu - n) / (nu - N_BAL)));
    const betaCreep = 0.35 + params.concreteStrength / 200 - lambda / 150;
    const kPhi = Math.max(1, 1 + betaCreep * params.creepRatio);
    const epsYd = fyd / STEEL_MODULUS;
    const dEff = g.hMm / 2 + g.steelRadiusMm;
    const curvature0 = epsYd / (0.45 * dEff);
    const curvature = kr * kPhi * curvature0;
    const e2 = (curvature * l0 * l0) / CURVATURE_FACTOR_C;
    secondOrder = (nEdKn * e2) / 1000;
    designNoMin = Math.max(m02, m0Ed + secondOrder);
    design = Math.max(designNoMin, minimumMoment);

    steps.push(
      {
        title: "First-order moment with imperfections",
        formula: "M_0e = max(0.6 M_02 + 0.4 M_01 , 0.4 M_02) ;  e_i = l_0 / 400 ;  M_0Ed = M_0e + N_Ed × e_i",
        substitution: `M_0e = max(0.6 × ${formatNumber(m02, 1)} + 0.4 × ${formatNumber(m01, 1)} , 0.4 × ${formatNumber(m02, 1)}) = ${formatNumber(m0e, 1)} kNm ;  e_i = ${formatNumber(l0, 0)} / 400 = ${formatNumber(ei, 1)} mm ;  M_0Ed = ${formatNumber(m0e, 1)} + ${formatNumber(nEdKn, 0)} × ${formatNumber(ei, 1)} / 1000`,
        result: `M_0Ed = ${formatNumber(m0Ed, 1)} kNm`,
        note: "EN 1992-1-1 cl. 5.8.8.2(2) and 5.2(7), isolated column.",
      },
      {
        title: "Curvature",
        formula: "1/r = K_r × K_phi / r_0 ;  1/r_0 = eps_yd / (0.45 d) ;  d = h / 2 + i_s",
        substitution: `K_r = (n_u − n) / (n_u − n_bal) = (${formatTrimmed(nu, 3)} − ${formatTrimmed(n, 3)}) / (${formatTrimmed(nu, 3)} − ${N_BAL}) = ${formatTrimmed(kr, 3)} ;  beta = 0.35 + f_ck / 200 − lambda / 150 = ${formatTrimmed(betaCreep, 3)}, K_phi = max(1 , 1 + beta × phi_ef) = ${formatTrimmed(kPhi, 3)} ;  d = ${formatNumber(g.hMm, 0)} / 2 + ${formatNumber(g.steelRadiusMm, 1)} = ${formatNumber(dEff, 1)} mm ;  1/r_0 = ${formatTrimmed(epsYd, 5)} / (0.45 × ${formatNumber(dEff, 1)})`,
        result: `1/r = ${(curvature * 1e6).toFixed(2)} × 1e-6 per mm`,
        note: "EN 1992-1-1 cl. 5.8.8.3. n_u = 1 + omega, n_bal = 0.4.",
      },
      {
        title: "Second-order moment and design moment",
        formula: "e_2 = (1/r) × l_0² / c ;  M_2 = N_Ed × e_2 ;  M_Ed = max(M_02 , M_0Ed + M_2 , N_Ed × e_0)",
        substitution: `e_2 = ${(curvature * 1e6).toFixed(2)} × 1e-6 × ${formatNumber(l0, 0)}² / ${CURVATURE_FACTOR_C} = ${formatNumber(e2, 1)} mm ;  M_2 = ${formatNumber(nEdKn, 0)} × ${formatNumber(e2, 1)} / 1000 = ${formatNumber(secondOrder, 1)} kNm ;  M_Ed = max(${formatNumber(m02, 1)} , ${formatNumber(m0Ed, 1)} + ${formatNumber(secondOrder, 1)} , ${formatNumber(minimumMoment, 1)})`,
        result: `M_Ed = ${formatNumber(design, 1)} kNm`,
        note: "EN 1992-1-1 cl. 5.8.8.2, with c = 10 for a constant cross-section. The end moment M_02 is also checked at the column ends.",
      },
    );
  }

  return {
    effectiveLengthMm: l0,
    slenderness: lambda,
    slendernessLimit: lambdaLim,
    slender,
    firstOrderKnm: m02,
    minimumMomentKnm: minimumMoment,
    secondOrderKnm: secondOrder,
    designMomentKnm: design,
    designMomentNoMinKnm: designNoMin,
    scopeDemand: lambda,
    scopeLimit: SCOPE_LAMBDA_MAX,
    scopeLabel: "Slenderness within the tool's range",
    steps,
  };
}

/** Exponent a for biaxial bending of a rectangular section: 1.0 at N/N_Rd 0.1, 1.5 at 0.7, 2.0 at 1.0. EN 1992-1-1 cl. 5.8.9(4). */
export function ec2BiaxialExponent(nOverNRd: number): number {
  if (nOverNRd <= 0.1) return 1.0;
  if (nOverNRd >= 1.0) return 2.0;
  if (nOverNRd <= 0.7) return 1.0 + (0.5 * (nOverNRd - 0.1)) / 0.6;
  return 1.5 + (0.5 * (nOverNRd - 0.7)) / 0.3;
}

/** Effect of axial compression on the web crushing limit, alpha_cw. EN 1992-1-1 cl. 6.2.3(3). */
export function ec2AlphaCw(sigmaCpOverFcd: number): number {
  const r = Math.min(Math.max(sigmaCpOverFcd, 0), 1);
  if (r === 0) return 1.0;
  if (r <= 0.25) return 1 + r;
  if (r <= 0.5) return 1.25;
  return 2.5 * (1 - r);
}

function biaxial(input: BiaxialInput): BiaxialOutcome {
  const { nEdKn, h, b, grossAreaMm2, steelAreaMm2, params } = input;
  const { fcd, fyd } = designStrengths(params);
  const nRdKn = (grossAreaMm2 * fcd + steelAreaMm2 * fyd) / 1000;
  const ratio = nEdKn / nRdKn;
  const a = ec2BiaxialExponent(ratio);

  // Separate design in each direction is allowed when the slenderness and the
  // eccentricities are lopsided enough (EN 1992-1-1 Eq. 5.38a and 5.38b).
  const lambdaRatio = Math.max(h.slenderness / b.slenderness, b.slenderness / h.slenderness);
  const eH = (h.actualKnm * 1000) / nEdKn;
  const eB = (b.actualKnm * 1000) / nEdKn;
  const relH = eH / h.dimensionMm;
  const relB = eB / b.dimensionMm;
  const lopsided = relH === 0 || relB === 0 || relH / relB <= 0.2 || relB / relH <= 0.2;
  const separate = lambdaRatio <= 2 && lopsided;

  const steps: WorkingStep[] = [
    {
      title: "Biaxial bending: is a combined check needed?",
      formula:
        "lambda_h / lambda_b and lambda_b / lambda_h <= 2 ;  (e_h / h) / (e_b / b) <= 0.2 or >= 5",
      substitution: `lambda ratio = ${formatTrimmed(lambdaRatio, 2)} ;  e_h / h = ${formatNumber(eH, 1)} / ${formatNumber(h.dimensionMm, 0)} = ${formatTrimmed(relH, 3)} ;  e_b / b = ${formatNumber(eB, 1)} / ${formatNumber(b.dimensionMm, 0)} = ${formatTrimmed(relB, 3)}`,
      result: separate
        ? "Not needed: each direction can be designed on its own"
        : "Needed: bending about both axes is significant",
      note: "EN 1992-1-1 cl. 5.8.9(2) and (3). Eccentricities are from the design moments without the minimum-eccentricity floor.",
    },
  ];

  if (separate) {
    return { applies: false, utilisation: null, demand: "n/a", capacity: "n/a", steps };
  }

  // The minimum eccentricity is applied about one axis at a time, never both.
  const sumFor = (mh: number, mb: number) =>
    Math.pow(mh / h.capacityKnm, a) + Math.pow(mb / b.capacityKnm, a);
  const hFloor = sumFor(h.fullKnm, b.actualKnm);
  const bFloor = sumFor(h.actualKnm, b.fullKnm);
  const governing = Math.max(hFloor, bFloor);

  steps.push({
    title: "Biaxial interaction",
    formula:
      "(M_Edh / M_Rdh)^a + (M_Edb / M_Rdb)^a <= 1.0 ;  a from N_Ed / N_Rd, with N_Rd = A_c f_cd + A_s f_yd",
    substitution: `N_Rd = ${formatNumber(nRdKn, 0)} kN, N_Ed / N_Rd = ${formatTrimmed(ratio, 3)}, a = ${formatTrimmed(a, 3)} ;  minimum eccentricity along h: (${formatNumber(h.fullKnm, 1)} / ${formatNumber(h.capacityKnm, 1)})^a + (${formatNumber(b.actualKnm, 1)} / ${formatNumber(b.capacityKnm, 1)})^a = ${formatTrimmed(hFloor, 3)} ;  along b: (${formatNumber(h.actualKnm, 1)} / ${formatNumber(h.capacityKnm, 1)})^a + (${formatNumber(b.fullKnm, 1)} / ${formatNumber(b.capacityKnm, 1)})^a = ${formatTrimmed(bFloor, 3)}`,
    result: `Sum = ${formatTrimmed(governing, 3)} (limit 1.0)`,
    note: "EN 1992-1-1 cl. 5.8.9(4), Eq. 5.39. The minimum-eccentricity moment is applied about one axis at a time (cl. 6.1(4)).",
  });

  return {
    applies: true,
    utilisation: governing,
    demand: formatTrimmed(governing, 2),
    capacity: "1.00",
    steps,
  };
}

function shear(input: ColumnShearInput): ColumnShearOutcome {
  const { vEdKn, nEdKn, widthMm: b, effectiveDepthMm: d, overallDepthMm: h, params } = input;
  const { fcd } = designStrengths(params);
  const fck = params.concreteStrength;
  const V = vEdKn * 1000;
  const sigmaCp = (nEdKn * 1000) / (b * h);
  const sigmaCpCapped = Math.min(sigmaCp, 0.2 * fcd);

  const k = Math.min(1 + Math.sqrt(200 / d), 2.0);
  const rhoL = Math.min(input.tensionSteelMm2 / (b * d), 0.02);
  const cRdc = 0.18 / params.gammaC;
  const concreteTerm = cRdc * k * Math.cbrt(100 * rhoL * fck);
  const vMinStress = 0.035 * Math.pow(k, 1.5) * Math.sqrt(fck);
  const axialTerm = K1_AXIAL * sigmaCpCapped;
  const vRdcStress = Math.max(concreteTerm, vMinStress) + axialTerm;
  const vRdc = vRdcStress * b * d;

  const z = SHEAR_LEVER_ARM_RATIO * d;
  const nu1 = 0.6 * (1 - fck / 250);
  const alphaCw = ec2AlphaCw(sigmaCp / fcd);
  const base = alphaCw * b * z * nu1 * fcd;
  const vMax45 = base / (COT_THETA_MIN + 1 / COT_THETA_MIN);
  const vMaxLow = base / (COT_THETA_MAX + 1 / COT_THETA_MAX);
  const fyvUsed = Math.min(params.fyv, 500);
  const fywd = fyvUsed / params.gammaS;

  const steps: WorkingStep[] = [
    {
      title: "Shear resistance without links",
      formula:
        "V_Rd,c = [max(C_Rd,c × k × (100 rho_l f_ck)^(1/3) , v_min) + k_1 × sigma_cp] × b × d ;  sigma_cp = N_Ed / A_c (at most 0.2 f_cd) ;  k_1 = 0.15",
      substitution: `k = ${formatTrimmed(k, 3)}, rho_l = ${formatNumber(input.tensionSteelMm2, 0)} / (${formatNumber(b, 0)} × ${formatNumber(d, 1)}) = ${formatTrimmed(rhoL, 5)} ;  C_Rd,c term = ${formatTrimmed(concreteTerm, 3)}, v_min = ${formatTrimmed(vMinStress, 3)} N/mm² ;  sigma_cp = ${formatTrimmed(sigmaCpCapped, 2)} N/mm², k_1 sigma_cp = ${formatTrimmed(axialTerm, 3)} N/mm²`,
      result: `V_Rd,c = ${formatNumber(vRdc / 1000, 1)} kN`,
      note: "EN 1992-1-1 cl. 6.2.2(1). Axial compression raises the concrete's shear resistance. rho_l uses the bars on one face.",
    },
    {
      title: "Web crushing limit",
      formula:
        "V_Rd,max = alpha_cw × b × z × nu_1 × f_cd / (cot(theta) + tan(theta)) ;  z = 0.9 d ;  alpha_cw from sigma_cp / f_cd",
      substitution: `sigma_cp / f_cd = ${formatTrimmed(sigmaCp / fcd, 3)}, alpha_cw = ${formatTrimmed(alphaCw, 3)}, nu_1 = ${formatTrimmed(nu1, 3)}, z = ${formatNumber(z, 1)} mm ;  V_Rd,max = ${formatNumber(vMaxLow / 1000, 1)} kN at cot(theta) = 2.5, ${formatNumber(vMax45 / 1000, 1)} kN at cot(theta) = 1.0`,
      result: `Upper limit ${formatNumber(vMax45 / 1000, 1)} kN`,
      note: "EN 1992-1-1 cl. 6.2.3(3). Compression raises alpha_cw above 1 up to half of f_cd, and lowers it again towards the axial capacity.",
    },
  ];

  if (V <= vRdc) {
    steps.push({
      title: "Links for shear",
      formula: "V_Ed <= V_Rd,c: no links are needed for strength",
      substitution: `V_Ed = ${formatNumber(vEdKn, 1)} kN <= V_Rd,c = ${formatNumber(vRdc / 1000, 1)} kN`,
      result: "Link size and spacing are set by the detailing rules",
      note: "EN 1992-1-1 cl. 6.2.1(4) and 9.5.3.",
    });
    return {
      verdict: "links-minimum",
      vEdKn,
      concreteCapacityKn: vRdc / 1000,
      maxCapacityKn: vMax45 / 1000,
      aswPerSMmReq: 0,
      steps,
    };
  }

  if (V > vMax45) {
    return {
      verdict: "section-inadequate",
      vEdKn,
      concreteCapacityKn: vRdc / 1000,
      maxCapacityKn: vMax45 / 1000,
      aswPerSMmReq: 0,
      steps,
    };
  }

  let cotTheta = COT_THETA_MAX;
  if (V > vMaxLow) {
    const theta = 0.5 * Math.asin(Math.min(1, (2 * V) / base));
    cotTheta = Math.max(COT_THETA_MIN, Math.min(COT_THETA_MAX, 1 / Math.tan(theta)));
  }
  const aswPerS = V / (z * fywd * cotTheta);
  steps.push({
    title: "Links for shear",
    formula: "A_sw / s = V_Ed / (z × f_ywd × cot(theta))",
    substitution: `cot(theta) = ${formatTrimmed(cotTheta, 2)} ;  f_ywd = ${fyvUsed} / ${formatTrimmed(params.gammaS, 2)} = ${formatNumber(fywd, 1)} N/mm² ;  A_sw / s = ${formatNumber(V, 0)} / (${formatNumber(z, 1)} × ${formatNumber(fywd, 1)} × ${formatTrimmed(cotTheta, 2)})`,
    result: `${formatTrimmed(aswPerS, 4)} mm²/mm`,
    note: "EN 1992-1-1 cl. 6.2.3(3). Two link legs resist shear in each direction.",
  });
  return {
    verdict: "links-designed",
    vEdKn,
    concreteCapacityKn: vRdc / 1000,
    maxCapacityKn: vMax45 / 1000,
    aswPerSMmReq: aswPerS,
    steps,
  };
}

function steelLimits(nEdKn: number, grossAreaMm2: number, params: ColumnParameters): SteelLimits {
  const { fyd } = designStrengths(params);
  const fromLoad = (0.1 * nEdKn * 1000) / fyd;
  const fromArea = 0.002 * grossAreaMm2;
  const min = Math.max(fromLoad, fromArea);
  const max = 0.04 * grossAreaMm2;
  return {
    minAreaMm2: min,
    maxAreaMm2: max,
    minAreaStep: {
      title: "Steel limits",
      formula: "A_s,min = max(0.10 N_Ed / f_yd , 0.002 A_c) ;  A_s,max = 0.04 A_c",
      substitution: `A_s,min = max(0.10 × ${formatNumber(nEdKn, 0)} × 10³ / ${formatTrimmed(fyd, 1)} , 0.002 × ${formatNumber(grossAreaMm2, 0)}) = max(${formatNumber(fromLoad, 0)} , ${formatNumber(fromArea, 0)}) ;  A_s,max = 0.04 × ${formatNumber(grossAreaMm2, 0)}`,
      result: `A_s,min = ${formatNumber(min, 0)} mm², A_s,max = ${formatNumber(max, 0)} mm²`,
      note: "EN 1992-1-1 cl. 9.5.2(2) and (3). The 4% limit applies outside lap zones.",
    },
  };
}

function linkRules(mainBarDiameterMm: number, bMm: number, hMm: number): LinkRules {
  const minDiameter = Math.max(6, mainBarDiameterMm / 4);
  const maxSpacing = Math.min(20 * mainBarDiameterMm, Math.min(bMm, hMm), 400);
  return {
    minDiameterMm: minDiameter,
    maxSpacingMm: maxSpacing,
    steps: [
      {
        title: "Link limits",
        formula: "phi_link >= max(6 , phi_bar / 4) ;  s_max = min(20 phi_bar , min(b , h) , 400)",
        substitution: `phi_link >= max(6 , ${mainBarDiameterMm} / 4) = ${formatTrimmed(minDiameter, 1)} mm ;  s_max = min(${20 * mainBarDiameterMm} , ${formatNumber(Math.min(bMm, hMm), 0)} , 400)`,
        result: `Links at least Ø${formatTrimmed(minDiameter, 1)} mm, spaced no more than ${formatNumber(maxSpacing, 0)} mm`,
        note: "EN 1992-1-1 cl. 9.5.3. Spacing should be reduced to 0.6 times this for a distance equal to the larger section dimension above and below beams and slabs, and near lapped bars.",
      },
    ],
  };
}

function assumptions(p: ColumnParameters): Assumption[] {
  const nationalNote =
    "UK National Annex value, used because no published Kenya National Annex was found; confirm for your project";
  return [
    { label: "Concrete strength f_ck", value: `${p.concreteStrength} N/mm²` },
    { label: "Steel yield f_yk (main / links)", value: `${p.fy} / ${p.fyv} N/mm²` },
    {
      label: "Long-term strength factor alpha_cc",
      value: formatTrimmed(p.alphaCc, 2),
      source:
        p.alphaCc === 1
          ? "EN recommended value (1.0). The UK National Annex uses 0.85 for bending"
          : "UK National Annex value (EN recommends 1.0). No published Kenya National Annex was found; confirm for your project",
    },
    { label: "Concrete partial factor gamma_c", value: formatTrimmed(p.gammaC, 2), source: nationalNote },
    { label: "Steel partial factor gamma_s", value: formatTrimmed(p.gammaS, 2), source: nationalNote },
    {
      label: "Effective creep ratio phi_ef",
      value: formatTrimmed(p.creepRatio, 2),
      source:
        "Assumed value for the nominal curvature method, which lengthens the curvature of slender columns. Raise it for heavily sustained load; check EN 1992-1-1 cl. 5.8.4",
    },
    {
      label: "Stress block",
      value: "Rectangular, lambda 0.8, eta 1.0",
      source: "EN 1992-1-1 cl. 3.1.7(3), valid for f_ck up to 50 N/mm²",
    },
    {
      label: "Section resistance",
      value: "Strain compatibility",
      source: "Concrete strain 0.0035, pivoting about 3/7 h to 0.002 when wholly in compression (Fig. 6.1)",
    },
    {
      label: "Shear model",
      value: "Variable strut, cot(theta) 1.0 to 2.5, two link legs per direction",
      source: "Axial compression raises V_Rd,c and alpha_cw (cl. 6.2.2, 6.2.3)",
    },
    {
      label: "Biaxial bending",
      value: "Eq. 5.39 with the exponent a from N_Ed / N_Rd",
      source: "Only when the slenderness and eccentricity limits of cl. 5.8.9(3) are not met",
    },
  ];
}

const basis: readonly SourceReference[] = [
  {
    label: "EN 1992-1-1:2004",
    note: "Resistance: cl. 3.1.7, 6.1. Slenderness and second-order effects: cl. 5.8.3, 5.8.8. Biaxial bending: cl. 5.8.9. Shear: cl. 6.2.2, 6.2.3. Detailing: cl. 9.5.",
  },
  {
    label: "National Annex",
    note: "No published Kenya National Annex to EN 1992-1-1 was found. Nationally Determined Parameters (alpha_cc 0.85, gamma_c 1.5, gamma_s 1.15) equal the UK National Annex values. Confirm them with your approving authority before relying on these results.",
  },
];

export const ec2Column: ColumnCode = {
  id: "ec2",
  name: "Eurocode 2 (EN 1992-1-1)",
  shortName: "Eurocode 2",
  strengthSymbol: "f_ck",
  concreteGrades: EC2_GRADES,
  defaults: {
    concreteStrength: 30,
    fy: 500,
    fyv: 500,
    alphaCc: 0.85,
    gammaC: 1.5,
    gammaS: 1.15,
    creepRatio: 2,
  },
  clauses: {
    capacity: "EN 1992-1-1 cl. 6.1",
    steelLimits: "EN 1992-1-1 cl. 9.5.2",
    linkRules: "EN 1992-1-1 cl. 9.5.3",
    slendernessScope: "Tool limit",
    minimumBars: "EN 1992-1-1 cl. 9.5.2(4)",
    shear: "EN 1992-1-1 cl. 6.2.3",
    shearLimit: "EN 1992-1-1 cl. 6.2.3(3)",
    biaxial: "EN 1992-1-1 cl. 5.8.9",
  },
  stressModel(p) {
    const { fcd, fyd } = designStrengths(p);
    return { blockRatio: LAMBDA_BLOCK, blockStress: fcd, steelYield: fyd };
  },
  stressModelSummary(p) {
    const { fcd, fyd } = designStrengths(p);
    return `block 0.8 x at ${formatTrimmed(fcd, 2)} N/mm² (f_cd), bars to ${formatTrimmed(fyd, 1)} N/mm² (f_yd)`;
  },
  slenderness,
  steelLimits,
  shear,
  biaxial,
  linkRules: (mainBar, b, h) => linkRules(mainBar, b, h),
  assumptions,
  basis,
  usesNationalParameters: true,
};
