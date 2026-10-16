import { describe, expect, it } from "vitest";
import { calculateColumnDesign } from "./calculate";
import { bs8110Column } from "./codes/bs8110";
import { ec2Column } from "./codes/ec2";
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
    expect(o.slenderness.effectiveLengthMm).toBeCloseTo(l0, 6);
    expect(o.slenderness.slenderness).toBeCloseTo(lambda, 6);
    expect(o.slenderness.slendernessLimit).toBeCloseTo(lim, 6);
    expect(o.slenderness.slender).toBe(false);
    expect(o.slenderness.designMomentKnm).toBeCloseTo(60, 6);
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
    expect(o.momentCapacityKnm).toBeCloseTo(cap!.mKnm, 6);
    expect(o.momentUtilisation).toBeCloseTo(60 / cap!.mKnm, 6);
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
    expect(r.charts).toHaveLength(1);
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
  const s = r.outputs.slenderness;

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
    expect(taller.outputs.slenderness.designMomentKnm).toBeGreaterThan(s.designMomentKnm);
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
    const s = r.outputs.slenderness;
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
    expect(r.outputs.slenderness.slender).toBe(false);
    expect(r.outputs.slenderness.designMomentKnm).toBeCloseTo(20, 6);
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
      params: { concreteStrength: 30, fy: 500, alphaCc: 0.85, gammaC: 1.5, gammaS: 1.15, creepRatio: 2 },
    });
    const double = ec2Column.slenderness({
      nEdKn: 1200,
      mTopKnm: 60,
      mBotKnm: -60,
      heightMm: 3500,
      beta: 0.85,
      geometry: { bMm: 300, hMm: 400, dMm: 352, asTotalMm2: 2513, steelRadiusMm: 152 },
      params: { concreteStrength: 30, fy: 500, alphaCc: 0.85, gammaC: 1.5, gammaS: 1.15, creepRatio: 2 },
    });
    // C = 0.7 for equal single-curvature moments, 2.7 for equal and opposite ones.
    expect(double.slendernessLimit / single.slendernessLimit).toBeCloseTo(2.7 / 0.7, 6);
  });

  it("BS 8110 reports the moment shape through M1 being negative in double curvature", () => {
    const params = { concreteStrength: 30, fy: 460, alphaCc: 0.85, gammaC: 1.5, gammaS: 1.15, creepRatio: 2 };
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
    expect(r.outputs.momentCapacityKnm).toBeNull();
    expect(r.checks.find((c) => c.label.startsWith("Axial"))?.status).toBe("fail");
    expect(r.outputs.strengthSteelMm2).toBeNull();
  });

  it("too large a moment fails and needs more steel than provided", () => {
    const r = calculateColumnDesign(input({ mTopKnm: 400, mBotKnm: 300 }));
    const check = r.checks.find((c) => c.label.startsWith("Design moment"));
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

  it("matches the capacity: steel needed for strength carries the design moment exactly", () => {
    // Rebuild a section whose steel is scaled to the answer; its capacity must equal the demand.
    const base = calculateColumnDesign(input({ mTopKnm: 150, mBotKnm: 75 }));
    const need = base.outputs.strengthSteelMm2!;
    const scale = need / base.outputs.bars.areaMm2;
    const section: SectionDefinition = {
      bMm: 300,
      hMm: 400,
      rows: [
        { yMm: 48, areaMm2: 3 * Math.PI * 100 * scale },
        { yMm: 200, areaMm2: 2 * Math.PI * 100 * scale },
        { yMm: 352, areaMm2: 3 * Math.PI * 100 * scale },
      ],
    };
    const cap = momentCapacityAtAxial(
      section,
      { blockRatio: 0.8, blockStress: FCD, steelYield: FYD },
      1200,
    );
    expect(cap!.mKnm).toBeCloseTo(base.outputs.slenderness.designMomentKnm, 1);
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
