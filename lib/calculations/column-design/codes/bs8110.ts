import { BS8110_GRADES, bs8110Vc } from "../../beam-design/codes/bs8110";
import { formatNumber, formatTrimmed } from "../../format";
import type { Assumption, SourceReference, WorkingStep } from "../../types";
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
 * BS 8110-1:1997 column check for braced columns: slenderness and additional
 * moments by cl. 3.8.3, section resistance by strain compatibility with the
 * cl. 3.4.4.1 stress block (0.45 f_cu over 0.9 x, bars at 0.87 f_y), and the
 * detailing rules of cl. 3.12.
 *
 * BS 8110 was withdrawn in the UK when the Eurocodes replaced it. It is kept
 * for projects whose specification still names it.
 */

/** Braced columns are short up to this l_e / h. BS 8110-1 cl. 3.8.1.3. */
const SHORT_LIMIT = 15;
/** Link steel strength is capped at this in design. BS 8110-1 cl. 3.4.5.1. */
const FYV_DESIGN_CAP = 460;
/** Upper limit on shear stress regardless of grade, N/mm². BS 8110-1 cl. 3.4.5.2. */
const V_MAX_ABSOLUTE = 5;
/** Shear stress carried by nominal links, N/mm². BS 8110-1 Table 3.7. */
const NOMINAL_LINK_STRESS = 0.4;
/** Clear height limit as a multiple of the smaller dimension, braced. BS 8110-1 cl. 3.8.1.7. */
const MAX_HEIGHT_TO_DIMENSION = 60;

function slenderness(input: SlendernessInput): SlendernessOutcome {
  const { nEdKn, mTopKnm, mBotKnm, heightMm, beta, geometry: g, params } = input;
  const acMm2 = g.bMm * g.hMm;
  const nN = nEdKn * 1000;

  const m2 = Math.max(Math.abs(mTopKnm), Math.abs(mBotKnm));
  const smaller = Math.abs(mTopKnm) >= Math.abs(mBotKnm) ? mBotKnm : mTopKnm;
  const larger = Math.abs(mTopKnm) >= Math.abs(mBotKnm) ? mTopKnm : mBotKnm;
  // M1 is the algebraically smaller end moment: negative for double curvature.
  const m1 = m2 === 0 ? 0 : (smaller / larger) * m2;

  const le = beta * heightMm;
  const ratio = le / g.hMm;
  const bPrime = Math.min(g.bMm, g.hMm);
  const slender = ratio > SHORT_LIMIT;
  const eMin = Math.min(0.05 * g.hMm, 20);
  const minimumMoment = (nEdKn * eMin) / 1000;

  const steps: WorkingStep[] = [
    {
      title: "Effective height and slenderness",
      formula: "l_e = beta × L ;  slenderness = l_e / h ;  short if l_e / h <= 15 (braced)",
      substitution: `l_e = ${formatTrimmed(beta, 2)} × ${formatNumber(heightMm, 0)} = ${formatNumber(le, 0)} mm ;  l_e / h = ${formatNumber(le, 0)} / ${formatNumber(g.hMm, 0)}`,
      result: `l_e / h = ${formatNumber(ratio, 1)} (${slender ? "slender, additional moment needed" : "short, no additional moment"})`,
      note: "BS 8110-1 cl. 3.8.1.3 and Table 3.19. Slenderness is taken in the plane of bending only.",
    },
  ];

  let additional = 0;
  let design: number;
  let designNoMin: number;

  if (!slender) {
    designNoMin = m2;
    design = Math.max(m2, minimumMoment);
    steps.push({
      title: "Design moment (short column)",
      formula: "M = max(M_2 , N × e_min) ;  e_min = min(0.05 h , 20 mm)",
      substitution: `e_min = min(0.05 × ${formatNumber(g.hMm, 0)} , 20) = ${formatNumber(eMin, 1)} mm ;  M = max(${formatNumber(m2, 1)} , ${formatNumber(nEdKn, 0)} × ${formatNumber(eMin, 1)} / 1000)`,
      result: `M = ${formatNumber(design, 1)} kNm`,
      note: "BS 8110-1 cl. 3.8.2.4: minimum eccentricity.",
    });
  } else {
    const nuz = 0.45 * params.concreteStrength * acMm2 + 0.95 * params.fy * g.asTotalMm2;
    const nbal = 0.25 * params.concreteStrength * g.bMm * g.dMm;
    const k = Math.max(0, Math.min(1, (nuz - nN) / (nuz - nbal)));
    const betaA = (1 / 2000) * (le / bPrime) ** 2;
    const au = betaA * k * g.hMm;
    additional = (nEdKn * au) / 1000;
    const mi = Math.max(0.4 * m1 + 0.6 * m2, 0.4 * m2);
    designNoMin = Math.max(m2, mi + additional, m1 + additional / 2);
    design = Math.max(designNoMin, minimumMoment);

    steps.push(
      {
        title: "Additional moment",
        formula: "N_uz = 0.45 f_cu A_c + 0.95 f_y A_sc ;  N_bal = 0.25 f_cu b d ;  K = (N_uz − N) / (N_uz − N_bal) <= 1 ;  beta_a = (l_e / b')² / 2000 ;  a_u = beta_a K h ;  M_add = N a_u",
        substitution: `N_uz = 0.45 × ${params.concreteStrength} × ${formatNumber(acMm2, 0)} + 0.95 × ${params.fy} × ${formatNumber(g.asTotalMm2, 0)} = ${formatNumber(nuz / 1000, 0)} kN ;  N_bal = 0.25 × ${params.concreteStrength} × ${formatNumber(g.bMm, 0)} × ${formatNumber(g.dMm, 1)} = ${formatNumber(nbal / 1000, 0)} kN ;  K = ${formatTrimmed(k, 3)} ;  beta_a = (${formatNumber(le, 0)} / ${formatNumber(bPrime, 0)})² / 2000 = ${formatTrimmed(betaA, 3)} ;  a_u = ${formatTrimmed(betaA, 3)} × ${formatTrimmed(k, 3)} × ${formatNumber(g.hMm, 0)} = ${formatNumber(au, 1)} mm`,
        result: `M_add = ${formatNumber(nEdKn, 0)} × ${formatNumber(au, 1)} / 1000 = ${formatNumber(additional, 1)} kNm`,
        note: "BS 8110-1 cl. 3.8.3.1 and 3.8.3.2. b' is the smaller section dimension. K uses the steel provided, where the code would iterate on the steel needed.",
      },
      {
        title: "Design moment (slender column)",
        formula: "M_i = max(0.4 M_1 + 0.6 M_2 , 0.4 M_2) ;  M = max(M_2 , M_i + M_add , M_1 + M_add / 2 , N × e_min)",
        substitution: `M_i = max(0.4 × ${formatNumber(m1, 1)} + 0.6 × ${formatNumber(m2, 1)} , 0.4 × ${formatNumber(m2, 1)}) = ${formatNumber(mi, 1)} kNm ;  M = max(${formatNumber(m2, 1)} , ${formatNumber(mi, 1)} + ${formatNumber(additional, 1)} , ${formatNumber(m1, 1)} + ${formatNumber(additional / 2, 1)} , ${formatNumber(minimumMoment, 1)})`,
        result: `M = ${formatNumber(design, 1)} kNm`,
        note: "BS 8110-1 cl. 3.8.3.3 to 3.8.3.4, braced column.",
      },
    );
  }

  return {
    effectiveLengthMm: le,
    slenderness: ratio,
    slendernessLimit: SHORT_LIMIT,
    slender,
    firstOrderKnm: m2,
    minimumMomentKnm: minimumMoment,
    secondOrderKnm: additional,
    designMomentKnm: design,
    designMomentNoMinKnm: designNoMin,
    scopeDemand: heightMm / bPrime,
    scopeLimit: MAX_HEIGHT_TO_DIMENSION,
    scopeLabel: "Clear height within 60 times the smaller dimension",
    steps,
  };
}

/** Table 3.22 of BS 8110-1: beta against N / (b h f_cu), interpolated linearly. */
const BETA_TABLE: ReadonlyArray<readonly [number, number]> = [
  [0, 1.0],
  [0.1, 0.88],
  [0.2, 0.77],
  [0.3, 0.65],
  [0.4, 0.53],
  [0.5, 0.42],
  [0.6, 0.3],
];

export function bs8110BiaxialBeta(nRatio: number): number {
  if (nRatio <= 0) return BETA_TABLE[0][1];
  const last = BETA_TABLE[BETA_TABLE.length - 1];
  if (nRatio >= last[0]) return last[1];
  for (let i = 1; i < BETA_TABLE.length; i++) {
    const [x1, y1] = BETA_TABLE[i];
    const [x0, y0] = BETA_TABLE[i - 1];
    if (nRatio <= x1) return y0 + ((y1 - y0) * (nRatio - x0)) / (x1 - x0);
  }
  return last[1];
}

function biaxial(input: BiaxialInput): BiaxialOutcome {
  const { nEdKn, h, b, grossAreaMm2, params } = input;
  const nRatio = (nEdKn * 1000) / (grossAreaMm2 * params.concreteStrength);
  const beta = bs8110BiaxialBeta(nRatio);

  // The minimum eccentricity is applied about one axis at a time, never both.
  const combo = (mh: number, mb: number) => {
    const alongH = mh / h.effectiveDepthMm >= mb / b.effectiveDepthMm;
    if (alongH) {
      const m = mh + beta * (h.effectiveDepthMm / b.effectiveDepthMm) * mb;
      return { axis: "h" as const, moment: m, capacity: h.capacityKnm, util: m / h.capacityKnm };
    }
    const m = mb + beta * (b.effectiveDepthMm / h.effectiveDepthMm) * mh;
    return { axis: "b" as const, moment: m, capacity: b.capacityKnm, util: m / b.capacityKnm };
  };
  const first = combo(h.fullKnm, b.actualKnm);
  const second = combo(h.actualKnm, b.fullKnm);
  const governing = first.util >= second.util ? first : second;
  const used = first.util >= second.util ? "minimum eccentricity along h" : "minimum eccentricity along b";

  const steps: WorkingStep[] = [
    {
      title: "Biaxial bending",
      formula:
        "if M_h / h' >= M_b / b' :  M'_h = M_h + beta × (h' / b') × M_b ;  otherwise  M'_b = M_b + beta × (b' / h') × M_h",
      substitution: `N / (b h f_cu) = ${formatNumber(nEdKn, 0)} × 10³ / (${formatNumber(grossAreaMm2, 0)} × ${params.concreteStrength}) = ${formatTrimmed(nRatio, 3)}, beta = ${formatTrimmed(beta, 3)} ;  h' = ${formatNumber(h.effectiveDepthMm, 1)} mm, b' = ${formatNumber(b.effectiveDepthMm, 1)} mm ;  governing case (${used}): M_h = ${formatNumber(governing === first ? h.fullKnm : h.actualKnm, 1)}, M_b = ${formatNumber(governing === first ? b.actualKnm : b.fullKnm, 1)} kNm`,
      result: `M'_${governing.axis} = ${formatNumber(governing.moment, 1)} kNm against M_Rd = ${formatNumber(governing.capacity, 1)} kNm`,
      note: "BS 8110-1 cl. 3.8.4.5 and Table 3.22 (beta interpolated linearly). The design is then a single-axis check on the increased moment. The minimum-eccentricity moment is applied about one axis at a time (cl. 3.8.2.4).",
    },
  ];

  return {
    applies: true,
    utilisation: governing.util,
    demand: `${formatNumber(governing.moment, 1)} kNm`,
    capacity: `${formatNumber(governing.capacity, 1)} kNm`,
    steps,
  };
}

function shear(input: ColumnShearInput): ColumnShearOutcome {
  const { vEdKn, nEdKn, momentKnm, widthMm: b, effectiveDepthMm: d, overallDepthMm: h, params } = input;
  const fcu = params.concreteStrength;
  const V = vEdKn * 1000;
  const N = nEdKn * 1000;
  const acMm2 = b * h;
  const fyvDesign = 0.87 * Math.min(params.fyv, FYV_DESIGN_CAP);

  const v = V / (b * d);
  const vMax = Math.min(0.8 * Math.sqrt(fcu), V_MAX_ABSOLUTE);
  const vc = bs8110Vc(input.tensionSteelMm2, b, d, fcu);

  // Axial compression raises the concrete shear stress. BS 8110-1 cl. 3.4.5.12.
  const vhOverM = momentKnm > 0 ? Math.min(1, (V * h) / (momentKnm * 1e6)) : 1;
  const enhanced = vc + 0.6 * (N / acMm2) * vhOverM;
  const cap = vc * Math.sqrt(1 + (0.06 * N) / (acMm2 * vc));
  const vcAxial = Math.min(enhanced, cap);

  const steps: WorkingStep[] = [
    {
      title: "Shear stress",
      formula: "v = V / (b × d) ;  v_max = min(0.8 × sqrt(f_cu), 5 N/mm²)",
      substitution: `v = ${formatNumber(V, 0)} / (${formatNumber(b, 0)} × ${formatNumber(d, 1)}) ;  v_max = min(0.8 × sqrt(${fcu}), 5)`,
      result: `v = ${formatTrimmed(v, 3)} N/mm², v_max = ${formatTrimmed(vMax, 3)} N/mm²`,
      note: "BS 8110-1 cl. 3.4.5.2.",
    },
    {
      title: "Concrete shear stress with axial load",
      formula:
        "v_c from Table 3.8 ;  v_c' = v_c + 0.6 × (N / A_c) × (V h / M) (V h / M at most 1) ;  not above v_c × sqrt(1 + 0.06 N / (A_c v_c))",
      substitution: `v_c = ${formatTrimmed(vc, 3)} N/mm² (bars on one face, ${formatTrimmed(Math.min((100 * input.tensionSteelMm2) / (b * d), 3), 3)}%) ;  V h / M = ${formatTrimmed(vhOverM, 3)} ;  v_c' = ${formatTrimmed(vc, 3)} + 0.6 × ${formatTrimmed(N / acMm2, 2)} × ${formatTrimmed(vhOverM, 3)} = ${formatTrimmed(enhanced, 3)}, cap ${formatTrimmed(cap, 3)}`,
      result: `v_c' = ${formatTrimmed(vcAxial, 3)} N/mm²`,
      note: "BS 8110-1 cl. 3.4.5.12 for members with axial compression, applied to columns by cl. 3.8.4.6.",
    },
  ];

  const capacityKn = (vcAxial * b * d) / 1000;
  const maxKn = (vMax * b * d) / 1000;

  if (v > vMax) {
    return {
      verdict: "section-inadequate",
      vEdKn,
      concreteCapacityKn: capacityKn,
      maxCapacityKn: maxKn,
      aswPerSMmReq: 0,
      steps,
    };
  }

  if (v <= 0.5 * vcAxial) {
    steps.push({
      title: "Links for shear",
      formula: "v <= 0.5 v_c': no links are needed for strength",
      substitution: `v = ${formatTrimmed(v, 3)} <= ${formatTrimmed(0.5 * vcAxial, 3)} N/mm²`,
      result: "Link size and spacing are set by the detailing rules",
      note: "BS 8110-1 Table 3.7 and cl. 3.12.7.",
    });
    return {
      verdict: "links-minimum",
      vEdKn,
      concreteCapacityKn: capacityKn,
      maxCapacityKn: maxKn,
      aswPerSMmReq: 0,
      steps,
    };
  }

  const nominal = v <= vcAxial + NOMINAL_LINK_STRESS;
  const aswPerS = nominal
    ? (NOMINAL_LINK_STRESS * b) / fyvDesign
    : (b * (v - vcAxial)) / fyvDesign;
  steps.push({
    title: nominal ? "Nominal links" : "Links for shear",
    formula: nominal
      ? "A_sv / s_v >= 0.4 × b / (0.87 × f_yv)"
      : "A_sv / s_v >= b × (v − v_c') / (0.87 × f_yv)",
    substitution: nominal
      ? `A_sv / s_v >= 0.4 × ${formatNumber(b, 0)} / (0.87 × ${Math.min(params.fyv, FYV_DESIGN_CAP)})`
      : `A_sv / s_v >= ${formatNumber(b, 0)} × (${formatTrimmed(v, 3)} − ${formatTrimmed(vcAxial, 3)}) / (0.87 × ${Math.min(params.fyv, FYV_DESIGN_CAP)})`,
    result: `${formatTrimmed(aswPerS, 4)} mm²/mm`,
    note: "BS 8110-1 Table 3.7. Two link legs resist shear in each direction.",
  });
  return {
    verdict: nominal ? "links-minimum" : "links-designed",
    vEdKn,
    concreteCapacityKn: capacityKn,
    maxCapacityKn: maxKn,
    aswPerSMmReq: aswPerS,
    steps,
  };
}

function steelLimits(_nEdKn: number, grossAreaMm2: number): SteelLimits {
  const min = 0.004 * grossAreaMm2;
  const max = 0.06 * grossAreaMm2;
  return {
    minAreaMm2: min,
    maxAreaMm2: max,
    minAreaStep: {
      title: "Steel limits",
      formula: "A_sc,min = 0.4% A_c ;  A_sc,max = 6% A_c (vertical, cast in place)",
      substitution: `A_sc,min = 0.004 × ${formatNumber(grossAreaMm2, 0)} ;  A_sc,max = 0.06 × ${formatNumber(grossAreaMm2, 0)}`,
      result: `A_sc,min = ${formatNumber(min, 0)} mm², A_sc,max = ${formatNumber(max, 0)} mm²`,
      note: "BS 8110-1 cl. 3.12.5.3 (Table 3.25) and cl. 3.12.6.2. The 6% limit rises to 8% at laps.",
    },
  };
}

function linkRules(mainBarDiameterMm: number): LinkRules {
  const minDiameter = Math.max(6, mainBarDiameterMm / 4);
  const maxSpacing = 12 * mainBarDiameterMm;
  return {
    minDiameterMm: minDiameter,
    maxSpacingMm: maxSpacing,
    steps: [
      {
        title: "Link limits",
        formula: "phi_link >= max(6 , phi_bar / 4) ;  s_max = 12 phi_bar",
        substitution: `phi_link >= max(6 , ${mainBarDiameterMm} / 4) = ${formatTrimmed(minDiameter, 1)} mm ;  s_max = 12 × ${mainBarDiameterMm}`,
        result: `Links at least Ø${formatTrimmed(minDiameter, 1)} mm, spaced no more than ${formatNumber(maxSpacing, 0)} mm`,
        note: "BS 8110-1 cl. 3.12.7.1 and 3.12.7.2, taking the smallest compression bar as the main bar size.",
      },
    ],
  };
}

function assumptions(p: ColumnParameters): Assumption[] {
  return [
    { label: "Concrete strength f_cu", value: `${p.concreteStrength} N/mm²` },
    { label: "Steel yield f_y (main / links)", value: `${p.fy} / ${p.fyv} N/mm²` },
    {
      label: "Stress block",
      value: "Rectangular, 0.45 f_cu over 0.9 x",
      source: "BS 8110-1 cl. 3.4.4.1. Bars at 0.87 f_y, E_s = 200 kN/mm²",
    },
    {
      label: "Section resistance",
      value: "Strain compatibility",
      source: "Concrete strain 0.0035, reduced under high axial load (cl. 3.4.4.1)",
    },
    {
      label: "Shear",
      value: "Table 3.8 v_c raised for axial load, two link legs per direction",
      source: "BS 8110-1 cl. 3.4.5.12 and Table 3.7. Link steel capped at 460 N/mm²",
    },
    {
      label: "Biaxial bending",
      value: "Single-axis check on an increased moment (beta from Table 3.22)",
      source: "BS 8110-1 cl. 3.8.4.5",
    },
    {
      label: "Braced column",
      value: "No sway moments",
      source: "Unbraced columns need a sway analysis and are not covered",
    },
  ];
}

const basis: readonly SourceReference[] = [
  {
    label: "BS 8110-1:1997",
    note: "Slenderness and additional moments: cl. 3.8.1 to 3.8.3. Resistance and biaxial bending: cl. 3.4.4.1, 3.8.4. Shear: cl. 3.4.5. Detailing: cl. 3.12.5 to 3.12.7.",
  },
  {
    label: "Status of BS 8110",
    note: "BS 8110 was withdrawn in the UK and Kenya has adopted the Eurocodes. Confirm your approving authority still accepts it for new designs.",
  },
];

export const bs8110Column: ColumnCode = {
  id: "bs8110",
  name: "BS 8110-1:1997",
  shortName: "BS 8110",
  strengthSymbol: "f_cu",
  concreteGrades: BS8110_GRADES,
  defaults: {
    concreteStrength: 30,
    fy: 460,
    fyv: 460,
    alphaCc: 0.85,
    gammaC: 1.5,
    gammaS: 1.15,
    creepRatio: 2,
  },
  clauses: {
    capacity: "BS 8110-1 cl. 3.8.4",
    steelLimits: "BS 8110-1 cl. 3.12.5 and 3.12.6",
    linkRules: "BS 8110-1 cl. 3.12.7",
    slendernessScope: "BS 8110-1 cl. 3.8.1.7",
    minimumBars: "BS 8110-1 cl. 3.12.5.3",
    shear: "BS 8110-1 cl. 3.4.5 and 3.8.4.6",
    shearLimit: "BS 8110-1 cl. 3.4.5.2",
    biaxial: "BS 8110-1 cl. 3.8.4.5",
  },
  stressModel(p) {
    return { blockRatio: 0.9, blockStress: 0.45 * p.concreteStrength, steelYield: 0.87 * p.fy };
  },
  stressModelSummary(p) {
    return `block 0.9 x at ${formatTrimmed(0.45 * p.concreteStrength, 2)} N/mm² (0.45 f_cu), bars to ${formatTrimmed(0.87 * p.fy, 1)} N/mm² (0.87 f_y)`;
  },
  slenderness,
  steelLimits,
  shear,
  biaxial,
  linkRules: (mainBar) => linkRules(mainBar),
  assumptions,
  basis,
  usesNationalParameters: false,
};
