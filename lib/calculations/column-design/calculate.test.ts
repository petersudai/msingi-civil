import { describe, expect, it } from "vitest";
import { calculateColumnDesign } from "./calculate";
import { bs8110BiaxialBeta, bs8110Column } from "./codes/bs8110";
import { ec2AlphaCw, ec2BiaxialExponent, ec2Column } from "./codes/ec2";
import { bs8110Vc } from "../beam-design/codes/bs8110";
import {
  columnCodeDefaultsForForm,
  columnDesignDefaults,
  parseColumnDesignInput,
  type ColumnDesignFormValues,
} from "./schema";
import { momentCapacityAtAxial, type SectionDefinition } from "./section-capacity";

/**
 * Column engine tests.
 *
 * No published column worked example is used as an anchor: the two published
 * beam examples checked for the beam tool disagreed with the code formulas,
 * and the column examples found online use iterated or chart-read values that
 * can't be reproduced to a stated tolerance. Instead each number is checked
 * three ways:
 *
 * - the strain-compatibility engine against hand sums and closed forms
 *   (section-capacity.test.ts);
 * - the slenderness chain restated here from the code equations, with the
 *   arithmetic done independently of the engine;
 * - code constants and limits spot-checked against the clauses.
 *
 * The BS 8110 clause numbers and the 0.95 f_y in N_uz were confirmed from
 * secondary sources only (see the report with this phase), not the standard.
 */

type Overrides = Partial<Record<keyof ColumnDesignFormValues, string | number>>;

function input(overrides: Overrides = {}) {
  const values: Record<string, string> = { ...columnDesignDefaults };
  for (const [k, v] of Object.entries(overrides)) values[k] = String(v);
  const parsed = parseColumnDesignInput(values as ColumnDesignFormValues);
  if (!parsed.success) throw new Error(JSON.stringify(parsed.error.issues));
  return parsed.data;
}

function bsOverrides(extra: Overrides = {}): Overrides {
  return { code: "bs8110", ...columnCodeDefaultsForForm("bs8110"), ...extra };
}

const FCD = (0.85 * 30) / 1.5;
const FYD = 500 / 1.15;

describe("default Eurocode 2 column (300 x 400, 8 x Ø20, N 1200, M 60 / 30)", () => {
  const r = calculateColumnDesign(input());
  const o = r.outputs;

  it("lays the bars out symmetrically: 3 + 2 + 3 = 8 bars, 2,513 mm²", () => {
    expect(o.bars.totalBars).toBe(8);
    expect(o.bars.areaMm2).toBeCloseTo(8 * Math.PI * 100, 3);
  });

  it("slenderness chain matches the hand arithmetic and the column is short", () => {
    const l0 = 0.85 * 3500;
    const lambda = l0 / (400 / Math.sqrt(12));
    const n = 1.2e6 / (300 * 400 * FCD);
    const omega = (o.bars.areaMm2 * FYD) / (300 * 400 * FCD);
    const lim = (20 * (1 / 1.4) * Math.sqrt(1 + 2 * omega) * (1.7 - 0.5)) / Math.sqrt(n);
    expect(o.axes.h.slenderness.effectiveLengthMm).toBeCloseTo(l0, 6);
    expect(o.axes.h.slenderness.slenderness).toBeCloseTo(lambda, 6);
    expect(o.axes.h.slenderness.slendernessLimit).toBeCloseTo(lim, 6);
    expect(o.axes.h.slenderness.slender).toBe(false);
    expect(o.axes.h.slenderness.designMomentKnm).toBeCloseTo(60, 6);
  });

  it("moment capacity equals an independent section built from the bar positions", () => {
    const section: SectionDefinition = {
      bMm: 300,
      hMm: 400,
      rows: [
        { yMm: 48, areaMm2: 3 * Math.PI * 100 },
        { yMm: 200, areaMm2: 2 * Math.PI * 100 },
        { yMm: 352, areaMm2: 3 * Math.PI * 100 },
      ],
    };
    const cap = momentCapacityAtAxial(
      section,
      { blockRatio: 0.8, blockStress: FCD, steelYield: FYD },
      1200,
    );
    expect(o.axes.h.momentCapacityKnm).toBeCloseTo(cap!.mKnm, 6);
    expect(o.axes.h.utilisation).toBeCloseTo(60 / cap!.mKnm, 6);
  });

  it("is adequate, and needs less steel than provided", () => {
    expect(o.adequate).toBe(true);
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
    expect(o.strengthSteelMm2).not.toBeNull();
    expect(o.strengthSteelMm2!).toBeLessThan(o.bars.areaMm2);
  });

  it("steel limits and link rules match the clauses", () => {
    // max(0.10 N / fyd, 0.002 Ac) = max(276.0, 240)
    expect(o.minSteelMm2).toBeCloseTo((0.1 * 1.2e6) / FYD, 6);
    expect(o.maxSteelMm2).toBeCloseTo(0.04 * 120000, 6);
    expect(o.links.minDiameterMm).toBe(6);
    expect(o.links.maxSpacingMm).toBe(300); // min(20 × 20, 300, 400)
    expect(o.links.spacingMm).toBe(300);
  });

  it("returns an interaction diagram with the design point on it", () => {
    expect(r.charts).toHaveLength(2);
    const chart = r.charts![0];
    expect(chart.series[0].points.length).toBeGreaterThan(20);
    expect(chart.markers[0]).toMatchObject({ x: 60, y: 1200, status: "pass" });
  });
});

describe("slender Eurocode 2 column, nominal curvature restated by hand", () => {
  // 300 x 300, 4 x Ø20 (A_s 1,256.6 mm²), cover 30, link 8: bars at y = 48 and 252.
  const r = calculateColumnDesign(
    input({
      bMm: 300,
      hMm: 300,
      barsAcrossB: 2,
      barsAcrossH: 2,
      heightM: 6,
      endCondition: "pinned",
      nEdKn: 800,
      mTopKnm: 40,
      mBotKnm: 40,
    }),
  );
  const s = r.outputs.axes.h.slenderness;

  const as = 4 * Math.PI * 100;
  const l0 = 6000;
  const lambda = l0 / (300 / Math.sqrt(12));
  const n = 800e3 / (90000 * FCD);
  const omega = (as * FYD) / (90000 * FCD);
  const lim = (20 * (1 / 1.4) * Math.sqrt(1 + 2 * omega) * 0.7) / Math.sqrt(n);
  const kr = Math.min(1, (1 + omega - n) / (1 + omega - 0.4));
  const kphi = Math.max(1, 1 + (0.35 + 30 / 200 - lambda / 150) * 2);
  const d = 150 + 102; // h / 2 + radius of gyration of the steel (bars 102 mm from the centroid)
  const curvature = (kr * kphi * (FYD / 200000)) / (0.45 * d);
  const e2 = (curvature * l0 * l0) / 10;
  const m2 = (800 * e2) / 1000;
  const m0Ed = Math.max(0.6 * 40 + 0.4 * 40, 0.4 * 40) + (800 * (l0 / 400)) / 1000;

  it("is slender and exceeds the limit", () => {
    expect(s.slender).toBe(true);
    expect(s.slenderness).toBeCloseTo(lambda, 6);
    expect(s.slendernessLimit).toBeCloseTo(lim, 6);
    expect(lambda).toBeGreaterThan(lim);
  });

  it("second-order and design moments match the hand chain", () => {
    expect(s.secondOrderKnm).toBeCloseTo(m2, 6);
    expect(s.designMomentKnm).toBeCloseTo(m0Ed + m2, 6);
    // Plain-number anchor so a change to any link of the chain shows up: about 104 kNm.
    expect(s.designMomentKnm).toBeGreaterThan(100);
    expect(s.designMomentKnm).toBeLessThan(108);
  });

  it("more height means a bigger design moment", () => {
    const taller = calculateColumnDesign(
      input({
        bMm: 300,
        hMm: 300,
        barsAcrossB: 2,
        barsAcrossH: 2,
        heightM: 7,
        endCondition: "pinned",
        nEdKn: 800,
        mTopKnm: 40,
        mBotKnm: 40,
      }),
    );
    expect(taller.outputs.axes.h.slenderness.designMomentKnm).toBeGreaterThan(s.designMomentKnm);
  });
});

describe("BS 8110 column", () => {
  const slenderInput = bsOverrides({
    bMm: 300,
    hMm: 300,
    barsAcrossB: 2,
    barsAcrossH: 2,
    heightM: 6,
    endCondition: "pinned",
    nEdKn: 800,
    mTopKnm: 40,
    mBotKnm: 40,
  });

  it("additional moment matches the cl. 3.8.3 chain by hand", () => {
    const r = calculateColumnDesign(input(slenderInput));
    const s = r.outputs.axes.h.slenderness;
    const as = 4 * Math.PI * 100;
    const nuz = 0.45 * 30 * 90000 + 0.95 * 460 * as;
    const nbal = 0.25 * 30 * 300 * 252;
    const k = (nuz - 800e3) / (nuz - nbal);
    const au = (1 / 2000) * (6000 / 300) ** 2 * k * 300;
    const madd = (800 * au) / 1000;
    expect(s.slender).toBe(true);
    expect(s.slenderness).toBeCloseTo(20, 6);
    expect(s.secondOrderKnm).toBeCloseTo(madd, 6);
    // M = max(M2, Mi + Madd, M1 + Madd/2, N e_min) with Mi = 40.
    expect(s.designMomentKnm).toBeCloseTo(40 + madd, 6);
  });

  it("a stocky column takes the larger end moment or the minimum eccentricity", () => {
    const r = calculateColumnDesign(input(bsOverrides({ mTopKnm: 0, mBotKnm: 0, nEdKn: 1000 })));
    // e_min = min(0.05 × 400, 20) = 20 mm, so M = 1000 × 0.020 = 20 kNm.
    expect(r.outputs.axes.h.slenderness.slender).toBe(false);
    expect(r.outputs.axes.h.slenderness.designMomentKnm).toBeCloseTo(20, 6);
  });

  it("steel limits and links follow cl. 3.12", () => {
    const o = calculateColumnDesign(input(bsOverrides())).outputs;
    expect(o.minSteelMm2).toBeCloseTo(0.004 * 120000, 6);
    expect(o.maxSteelMm2).toBeCloseTo(0.06 * 120000, 6);
    expect(o.links.maxSpacingMm).toBe(240); // 12 × 20
    expect(o.links.spacingMm).toBe(225);
  });

  it("the same section gets a different capacity from a different code", () => {
    const ec = calculateColumnDesign(input()).outputs;
    const bs = calculateColumnDesign(input(bsOverrides())).outputs;
    expect(bs.axialCapacityKn).not.toBeCloseTo(ec.axialCapacityKn, 0);
    expect(bs.code).toBe("bs8110");
  });
});

describe("curvature and sign convention", () => {
  it("double curvature raises the slenderness limit (C = 1.7 - r_m = 2.7)", () => {
    const single = ec2Column.slenderness({
      nEdKn: 1200,
      mTopKnm: 60,
      mBotKnm: 60,
      heightMm: 3500,
      beta: 0.85,
      geometry: { bMm: 300, hMm: 400, dMm: 352, asTotalMm2: 2513, steelRadiusMm: 152 },
      params: { concreteStrength: 30, fy: 500, fyv: 500, alphaCc: 0.85, gammaC: 1.5, gammaS: 1.15, creepRatio: 2 },
    });
    const double = ec2Column.slenderness({
      nEdKn: 1200,
      mTopKnm: 60,
      mBotKnm: -60,
      heightMm: 3500,
      beta: 0.85,
      geometry: { bMm: 300, hMm: 400, dMm: 352, asTotalMm2: 2513, steelRadiusMm: 152 },
      params: { concreteStrength: 30, fy: 500, fyv: 500, alphaCc: 0.85, gammaC: 1.5, gammaS: 1.15, creepRatio: 2 },
    });
    // C = 0.7 for equal single-curvature moments, 2.7 for equal and opposite ones.
    expect(double.slendernessLimit / single.slendernessLimit).toBeCloseTo(2.7 / 0.7, 6);
  });

  it("BS 8110 reports the moment shape through M1 being negative in double curvature", () => {
    const params = { concreteStrength: 30, fy: 460, fyv: 460, alphaCc: 0.85, gammaC: 1.5, gammaS: 1.15, creepRatio: 2 };
    const geometry = { bMm: 300, hMm: 300, dMm: 252, asTotalMm2: 1257, steelRadiusMm: 102 };
    const common = { nEdKn: 800, heightMm: 6000, beta: 1, geometry, params };
    const single = bs8110Column.slenderness({ ...common, mTopKnm: 40, mBotKnm: 40 });
    const double = bs8110Column.slenderness({ ...common, mTopKnm: 40, mBotKnm: -40 });
    expect(double.designMomentKnm).toBeLessThanOrEqual(single.designMomentKnm);
  });
});

describe("checks flag what fails", () => {
  it("an overloaded column fails the axial check and has no moment capacity", () => {
    const r = calculateColumnDesign(input({ nEdKn: 6000 }));
    expect(r.outputs.adequate).toBe(false);
    expect(r.outputs.axes.h.momentCapacityKnm).toBeNull();
    expect(r.checks.find((c) => c.label.startsWith("Axial"))?.status).toBe("fail");
    expect(r.outputs.strengthSteelMm2).toBeNull();
  });

  it("too large a moment fails and needs more steel than provided", () => {
    const r = calculateColumnDesign(input({ mTopKnm: 400, mBotKnm: 300 }));
    const check = r.checks.find((c) => c.label.startsWith("Moment along h"));
    expect(check?.status).toBe("fail");
    expect(r.outputs.adequate).toBe(false);
    if (r.outputs.strengthSteelMm2 !== null) {
      expect(r.outputs.strengthSteelMm2).toBeGreaterThan(r.outputs.bars.areaMm2);
    }
  });

  it("four small bars in a large column fail the minimum steel check", () => {
    const r = calculateColumnDesign(
      input({ bMm: 400, hMm: 400, barsAcrossB: 2, barsAcrossH: 2, mainBarDiameterMm: 12, nEdKn: 3000 }),
    );
    expect(r.checks.find((c) => c.label === "Steel at least the minimum")?.status).toBe("fail");
  });

  it("links smaller than a quarter of the main bar fail", () => {
    const r = calculateColumnDesign(input({ mainBarDiameterMm: 32, linkDiameterMm: 6, bMm: 500, hMm: 500 }));
    expect(r.checks.find((c) => c.label === "Link size")?.status).toBe("fail");
  });

  it("crowded bars fail the clear gap check", () => {
    const r = calculateColumnDesign(input({ barsAcrossB: 8, mainBarDiameterMm: 25 }));
    expect(r.checks.find((c) => c.label === "Clear gap between bars")?.status).toBe("fail");
  });

  it("BS 8110: a very tall thin column breaks the 60 b' limit", () => {
    const r = calculateColumnDesign(input(bsOverrides({ heightM: 20, bMm: 300, nEdKn: 200 })));
    expect(r.checks.find((c) => c.label.startsWith("Clear height"))?.status).toBe("fail");
  });
});

describe("steel needed for strength", () => {
  it("rises with the axial load's moment demand", () => {
    const light = calculateColumnDesign(input({ mTopKnm: 80, mBotKnm: 40 })).outputs;
    const heavy = calculateColumnDesign(input({ mTopKnm: 180, mBotKnm: 90 })).outputs;
    expect(light.strengthSteelMm2).not.toBeNull();
    expect(heavy.strengthSteelMm2).not.toBeNull();
    expect(heavy.strengthSteelMm2!).toBeGreaterThan(light.strengthSteelMm2!);
  });

});

describe("input parsing ignores fields that don't apply", () => {
  it("a bad custom beta is ignored unless 'enter my own' is chosen", () => {
    const base = { ...columnDesignDefaults, betaCustom: "abc" };
    expect(parseColumnDesignInput({ ...base, endCondition: "pinned" }).success).toBe(true);
    expect(parseColumnDesignInput({ ...base, endCondition: "custom" }).success).toBe(false);
  });

  it("junk in Eurocode-only fields is ignored under BS 8110", () => {
    const values = {
      ...columnDesignDefaults,
      ...columnCodeDefaultsForForm("bs8110"),
      code: "bs8110",
      alphaCc: "abc",
      creepRatio: "-4",
    } as ColumnDesignFormValues;
    expect(parseColumnDesignInput(values).success).toBe(true);
  });

  it("rejects an axial load of zero, a grade from the other code, and no room inside the section", () => {
    expect(parseColumnDesignInput({ ...columnDesignDefaults, nEdKn: "0" }).success).toBe(false);
    expect(
      parseColumnDesignInput({ ...columnDesignDefaults, concreteStrengthMpa: "45" }).success,
    ).toBe(false);
    expect(
      parseColumnDesignInput({ ...columnDesignDefaults, bMm: "150", coverMm: "70" }).success,
    ).toBe(false);
  });
});

describe("steel needed for strength, bracketed against real bar sizes", () => {
  const loads = { mTopKnm: 150, mBotKnm: 75 };
  const need = (d: number) =>
    calculateColumnDesign(input({ ...loads, mainBarDiameterMm: d })).outputs.strengthSteelMm2!;

  it("is about the same whatever bar size you happened to enter (the layout shape is what matters)", () => {
    const n16 = need(16);
    const n20 = need(20);
    const n25 = need(25);
    expect(Math.abs(n16 - n20) / n20).toBeLessThan(0.05);
    expect(Math.abs(n25 - n20) / n20).toBeLessThan(0.05);
  });

  it("separates bar sizes that carry the loads from ones that don't", () => {
    const area = (d: number) => 8 * Math.PI * (d / 2) ** 2;
    const n = need(20);
    expect(area(16)).toBeLessThan(n);
    expect(area(20)).toBeGreaterThan(n);
    const small = calculateColumnDesign(input({ ...loads, mainBarDiameterMm: 16 }));
    const big = calculateColumnDesign(input({ ...loads, mainBarDiameterMm: 20 }));
    const flexureOk = (r: typeof small) =>
      r.checks
        .filter((c) => c.label.startsWith("Moment along") || c.label.startsWith("Combined bending"))
        .every((c) => c.status === "pass");
    expect(flexureOk(small)).toBe(false);
    expect(flexureOk(big)).toBe(true);
  });
});

describe("the other axis (bending along b)", () => {
  const r = calculateColumnDesign(input());
  const b = r.outputs.axes.b;

  // Default column with no minor-axis moments: the section turned a quarter turn.
  const l0 = 0.85 * 3500;
  const lambda = l0 / (300 / Math.sqrt(12));
  const n = 1.2e6 / (300 * 400 * FCD);
  const area = 8 * Math.PI * 100;
  const omega = (area * FYD) / (300 * 400 * FCD);
  const lim = (20 * (1 / 1.4) * Math.sqrt(1 + 2 * omega) * 0.7) / Math.sqrt(n);
  // Bars sit at 48, 150 and 252 mm across the 300 mm side: 3, 2 and 3 bars of the 8 bars... counted per row.
  const rowAreas = [3, 2, 3].map((k) => k * Math.PI * 100);
  const radius = Math.sqrt(
    rowAreas.reduce((s, a, i) => s + a * ([48, 150, 252][i] - 150) ** 2, 0) / area,
  );
  const kr = Math.min(1, (1 + omega - n) / (1 + omega - 0.4));
  const kphi = Math.max(1, 1 + (0.35 + 30 / 200 - lambda / 150) * 2);
  const curvature = (kr * kphi * (FYD / 200000)) / (0.45 * (150 + radius));
  const m2 = (1200 * ((curvature * l0 * l0) / 10)) / 1000;
  const m0Ed = (1200 * (l0 / 400)) / 1000; // M_0e is zero with no end moments

  it("is slender about the narrow side even though it is short about the deep one", () => {
    expect(r.outputs.axes.h.slenderness.slender).toBe(false);
    expect(b.slenderness.slender).toBe(true);
    expect(b.slenderness.slenderness).toBeCloseTo(lambda, 6);
    expect(b.slenderness.slendernessLimit).toBeCloseTo(lim, 6);
  });

  it("second-order and design moments match the restated chain", () => {
    expect(b.slenderness.secondOrderKnm).toBeCloseTo(m2, 6);
    expect(b.slenderness.designMomentKnm).toBeCloseTo(Math.max(m0Ed + m2, 24), 6);
  });

  it("uses the 400 mm side as the section width and the 300 mm side as the depth", () => {
    expect(b.depthMm).toBe(300);
    expect(b.widthMm).toBe(400);
    expect(b.geometry.dMm).toBeCloseTo(300 - 48, 6);
  });

  it("is checked on its own sheet line and its own interaction diagram", () => {
    expect(r.checks.some((c) => c.label.startsWith("Moment along b"))).toBe(true);
    expect(r.charts).toHaveLength(2);
    expect(r.charts![1].title).toContain("along b");
  });

  it("a real minor-axis moment raises the design moment", () => {
    const withMoment = calculateColumnDesign(input({ mTopBKnm: 50, mBotBKnm: 50 }));
    expect(withMoment.outputs.axes.b.slenderness.designMomentKnm).toBeGreaterThan(
      b.slenderness.designMomentKnm,
    );
  });
});

describe("biaxial bending", () => {
  const params = { concreteStrength: 30, fy: 500, fyv: 500, alphaCc: 0.85, gammaC: 1.5, gammaS: 1.15, creepRatio: 2 };
  const axis = (key: "h" | "b", actual: number, cap: number, dim: number, d: number) => ({
    key,
    fullKnm: actual,
    actualKnm: actual,
    capacityKnm: cap,
    slenderness: 30,
    effectiveDepthMm: d,
    dimensionMm: dim,
  });

  it("EC2 exponent: 1.0 up to 0.1, 1.5 at 0.7, 2.0 at 1.0, linear between", () => {
    expect(ec2BiaxialExponent(0.05)).toBe(1.0);
    expect(ec2BiaxialExponent(0.1)).toBe(1.0);
    expect(ec2BiaxialExponent(0.4)).toBeCloseTo(1.25, 10);
    expect(ec2BiaxialExponent(0.7)).toBeCloseTo(1.5, 10);
    expect(ec2BiaxialExponent(0.85)).toBeCloseTo(1.75, 10);
    expect(ec2BiaxialExponent(1.0)).toBe(2.0);
    expect(ec2BiaxialExponent(1.4)).toBe(2.0);
  });

  it("EC2 Eq. 5.39 by hand: two equal 0.5 ratios give 2 × 0.5^a", () => {
    const nRd = (120000 * FCD + 2513 * FYD) / 1000;
    const a = ec2BiaxialExponent(1000 / nRd);
    const out = ec2Column.biaxial({
      nEdKn: 1000,
      h: axis("h", 100, 200, 400, 352),
      b: axis("b", 60, 120, 300, 252),
      grossAreaMm2: 120000,
      steelAreaMm2: 2513,
      params,
    });
    expect(out.applies).toBe(true);
    expect(out.utilisation).toBeCloseTo(2 * Math.pow(0.5, a), 6);
  });

  it("EC2 lets the directions be designed separately when one eccentricity is tiny", () => {
    const out = ec2Column.biaxial({
      nEdKn: 1000,
      h: axis("h", 100, 200, 400, 352),
      b: axis("b", 5, 120, 300, 252),
      grossAreaMm2: 120000,
      steelAreaMm2: 2513,
      params,
    });
    expect(out.applies).toBe(false);
    expect(out.utilisation).toBeNull();
  });

  it("EC2 needs the combined check when the slenderness differs by more than 2", () => {
    const out = ec2Column.biaxial({
      nEdKn: 1000,
      h: { ...axis("h", 100, 200, 400, 352), slenderness: 20 },
      b: { ...axis("b", 5, 120, 300, 252), slenderness: 50 },
      grossAreaMm2: 120000,
      steelAreaMm2: 2513,
      params,
    });
    expect(out.applies).toBe(true);
  });

  it("BS 8110 beta table: 1.0, 0.88, 0.77, 0.65, 0.53, 0.42, 0.30, interpolated and clamped", () => {
    expect(bs8110BiaxialBeta(0)).toBe(1.0);
    expect(bs8110BiaxialBeta(0.1)).toBeCloseTo(0.88, 10);
    expect(bs8110BiaxialBeta(0.25)).toBeCloseTo(0.71, 10);
    expect(bs8110BiaxialBeta(0.5)).toBeCloseTo(0.42, 10);
    expect(bs8110BiaxialBeta(0.6)).toBeCloseTo(0.3, 10);
    expect(bs8110BiaxialBeta(0.9)).toBeCloseTo(0.3, 10);
  });

  it("BS 8110 cl. 3.8.4.5 by hand: M'h = Mh + beta (h'/b') Mb", () => {
    const beta = 0.77 - 0.12 * ((1e6 / (120000 * 30) - 0.2) / 0.1);
    const mPrime = 100 + beta * (352 / 252) * 60;
    const out = bs8110Column.biaxial({
      nEdKn: 1000,
      h: axis("h", 100, 200, 400, 352),
      b: axis("b", 60, 120, 300, 252),
      grossAreaMm2: 120000,
      steelAreaMm2: 2513,
      params: { ...params, fy: 460, fyv: 460 },
    });
    expect(out.applies).toBe(true);
    expect(out.utilisation).toBeCloseTo(mPrime / 200, 6);
  });

  it("the minimum eccentricity is applied about one axis at a time, not both", () => {
    // Stocky 400 × 400 column, no end moments: both axes sit on the minimum moment N × 20 mm = 30 kNm.
    const r = calculateColumnDesign(
      input(
        bsOverrides({
          bMm: 400,
          hMm: 400,
          heightM: 2,
          nEdKn: 1500,
          mTopKnm: 0,
          mBotKnm: 0,
          mTopBKnm: 0,
          mBotBKnm: 0,
        }),
      ),
    );
    const o = r.outputs;
    expect(o.axes.h.slenderness.designMomentKnm).toBeCloseTo(30, 6);
    expect(o.axes.b.slenderness.designMomentKnm).toBeCloseTo(30, 6);
    // Applied to both axes at once it would be close to twice the uniaxial utilisation.
    expect(o.biaxial!.utilisation!).toBeCloseTo(Math.max(o.axes.h.utilisation!, o.axes.b.utilisation!), 6);
  });

  it("real moments about both axes load the column more than either alone", () => {
    const base = { mTopKnm: 90, mBotKnm: 45 };
    const alone = calculateColumnDesign(input(base)).outputs.governingUtilisation!;
    const both = calculateColumnDesign(
      input({ ...base, mTopBKnm: 40, mBotBKnm: 20 }),
    ).outputs.governingUtilisation!;
    expect(both).toBeGreaterThan(alone);
  });
});

describe("column shear", () => {
  const params = { concreteStrength: 30, fy: 500, fyv: 500, alphaCc: 0.85, gammaC: 1.5, gammaS: 1.15, creepRatio: 2 };
  const common = {
    nEdKn: 1200,
    momentKnm: 60,
    widthMm: 300,
    effectiveDepthMm: 352,
    overallDepthMm: 400,
    tensionSteelMm2: 3 * Math.PI * 100,
    params,
  };

  it("EC2 alpha_cw: 1 at no compression, 1 + r to a quarter of f_cd, 1.25 to a half, then falls", () => {
    expect(ec2AlphaCw(0)).toBe(1);
    expect(ec2AlphaCw(0.1)).toBeCloseTo(1.1, 10);
    expect(ec2AlphaCw(0.25)).toBeCloseTo(1.25, 10);
    expect(ec2AlphaCw(0.4)).toBe(1.25);
    expect(ec2AlphaCw(0.5)).toBeCloseTo(1.25, 10);
    expect(ec2AlphaCw(0.75)).toBeCloseTo(0.625, 10);
  });

  it("EC2 V_Rd,c and the links needed match the hand calculation", () => {
    const sigmaCp = 1.2e6 / (300 * 400);
    const k = 1 + Math.sqrt(200 / 352);
    const rho = (3 * Math.PI * 100) / (300 * 352);
    const term = 0.12 * k * Math.cbrt(100 * rho * 30);
    const vmin = 0.035 * Math.pow(k, 1.5) * Math.sqrt(30);
    const vRdc = ((Math.max(term, vmin) + 0.15 * Math.min(sigmaCp, 0.2 * FCD)) * 300 * 352) / 1000;

    const low = ec2Column.shear({ ...common, vEdKn: 100 });
    expect(low.concreteCapacityKn).toBeCloseTo(vRdc, 6);
    expect(vRdc).toBeGreaterThan(115);
    expect(vRdc).toBeLessThan(125);
    expect(low.verdict).toBe("links-minimum");
    expect(low.aswPerSMmReq).toBe(0);

    const z = 0.9 * 352;
    const base = ec2AlphaCw(sigmaCp / FCD) * 300 * z * 0.6 * (1 - 30 / 250) * FCD;
    const high = ec2Column.shear({ ...common, vEdKn: 200 });
    expect(high.verdict).toBe("links-designed");
    expect(high.maxCapacityKn).toBeCloseTo(base / 2 / 1000, 6);
    // 200 kN is below V_Rd,max at cot(theta) = 2.5, so the flattest strut applies.
    expect(200e3).toBeLessThan(base / 2.9);
    expect(high.aswPerSMmReq).toBeCloseTo(200e3 / (z * (500 / 1.15) * 2.5), 6);
  });

  it("EC2 flags a shear above the web crushing limit", () => {
    expect(ec2Column.shear({ ...common, vEdKn: 2000 }).verdict).toBe("section-inadequate");
  });

  it("BS 8110: v, v_c with the axial enhancement capped, and nominal links, by hand", () => {
    const bsParams = { ...params, fy: 460, fyv: 460 };
    const v = 100e3 / (300 * 352);
    const vc = bs8110Vc(3 * Math.PI * 100, 300, 352, 30);
    const nOverA = 1.2e6 / (300 * 400);
    const enhanced = vc + 0.6 * nOverA * Math.min(1, (100e3 * 400) / (60 * 1e6));
    const cap = vc * Math.sqrt(1 + (0.06 * 1.2e6) / (300 * 400 * vc));
    const vcAxial = Math.min(enhanced, cap);
    expect(cap).toBeLessThan(enhanced); // the cap governs at this much axial load
    const out = bs8110Column.shear({ ...common, vEdKn: 100, params: bsParams });
    expect(out.concreteCapacityKn).toBeCloseTo((vcAxial * 300 * 352) / 1000, 6);
    expect(v).toBeGreaterThan(0.5 * vcAxial);
    expect(v).toBeLessThanOrEqual(vcAxial + 0.4);
    expect(out.verdict).toBe("links-minimum");
    expect(out.aswPerSMmReq).toBeCloseTo((0.4 * 300) / (0.87 * 460), 6);
  });

  it("BS 8110 designs links when v exceeds v_c' + 0.4", () => {
    const bsParams = { ...params, fy: 460, fyv: 460 };
    const out = bs8110Column.shear({ ...common, vEdKn: 250, params: bsParams });
    expect(out.verdict).toBe("links-designed");
    expect(out.aswPerSMmReq).toBeGreaterThan((0.4 * 300) / (0.87 * 460));
  });

  it("takes the shear from the end moments by statics unless one is entered", () => {
    const fromMoments = calculateColumnDesign(input());
    expect(fromMoments.outputs.axes.h.shear.vEdKn).toBeCloseTo(30 / 3.5, 6);
    expect(fromMoments.outputs.axes.h.shear.source).toBe("end moments");
    // Double curvature carries the most shear.
    const double = calculateColumnDesign(input({ mTopKnm: 60, mBotKnm: -60 }));
    expect(double.outputs.axes.h.shear.vEdKn).toBeCloseTo(120 / 3.5, 6);
    const entered = calculateColumnDesign(input({ shearHKn: 50 }));
    expect(entered.outputs.axes.h.shear.vEdKn).toBe(50);
    expect(entered.outputs.axes.h.shear.source).toBe("entered");
  });

  it("a heavy shear tightens the link spacing below the detailing limit", () => {
    const r = calculateColumnDesign(input({ shearHKn: 300 }));
    expect(r.outputs.links.governedBy).toBe("shear along h");
    expect(r.outputs.links.spacingMm).toBeLessThan(300);
    expect(r.outputs.links.spacingMm % 25).toBe(0);
    const check = r.checks.find((c) => c.label === "Links resist the shear along h");
    expect(check?.status).toBe("pass");
  });

  it("a shear beyond the section limit fails the column", () => {
    const r = calculateColumnDesign(input({ shearHKn: 2000 }));
    expect(r.checks.find((c) => c.label === "Shear along h within section limit")?.status).toBe("fail");
    expect(r.outputs.adequate).toBe(false);
  });
});

describe("input parsing for the new fields", () => {
  it("a blank shear means 'from the end moments'; a negative one is rejected", () => {
    expect(parseColumnDesignInput({ ...columnDesignDefaults, shearHKn: "" }).success).toBe(true);
    expect(parseColumnDesignInput({ ...columnDesignDefaults, shearHKn: "-5" }).success).toBe(false);
    expect(parseColumnDesignInput({ ...columnDesignDefaults, shearBKn: "abc" }).success).toBe(false);
  });

  it("rejects a link steel grade that isn't on the list and a moment that is not a number", () => {
    expect(parseColumnDesignInput({ ...columnDesignDefaults, fyvMpa: "300" }).success).toBe(false);
    expect(parseColumnDesignInput({ ...columnDesignDefaults, mTopBKnm: "x" }).success).toBe(false);
  });

  it("minor-axis moments default to zero, so a first-time user gets the other axis checked for free", () => {
    expect(columnDesignDefaults.mTopBKnm).toBe("0");
    expect(columnDesignDefaults.mBotBKnm).toBe("0");
  });
});
