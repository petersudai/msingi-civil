import { describe, expect, it } from "vitest";
import { calculateBeamDesign, sectionGeometry } from "./calculate";
import { BEAM_CODES, getBeamCode } from "./codes";
import { bs8110Vc } from "./codes/bs8110";
import { ec2LimitingK, ec2MeanTensileStrength } from "./codes/ec2";
import type { CodeParameters } from "./codes/types";
import {
  beamDesignDefaults,
  codeDefaultsForForm,
  parseBeamDesignInput,
  type BeamDesignFormValues,
  type BeamDesignInput,
} from "./schema";

/**
 * Reference values and how they were validated
 * --------------------------------------------
 * 1. Eurocode 2 bending: a published doubly reinforced worked example
 *    (FPP Engineering, b 225, h 450, d 407, d' 43, fck 30, fyk 500, M 248 kNm)
 *    gives A_s1 = 1675 mm² and A_s2 = 380 mm². It uses the UK National Annex
 *    K' of 0.168; this engine uses the EN limit x/d = 0.448 (K' = 0.1667 with
 *    alpha_cc 0.85), so agreement is checked to 1% (A_s1) and 3% (A_s2).
 * 2. BS 8110 bending: the same source's BS 8110 example (M 258.5 kNm, fcu 30,
 *    fy 460) gives a tension term of 1378.5 mm²; reproduced to 0.5%. Its
 *    printed A_s' (528.5 mm²) does NOT follow from its own formula
 *    (the formula gives 577 mm²), so A_s' is checked against the formula.
 * 3. Equilibrium back-check: for each design, the moment capacity of the
 *    provided steel is rebuilt by force equilibrium (bisection on the neutral
 *    axis, strain-compatible compression steel) and must equal the design
 *    moment. This is independent of the closed-form algebra in the engine.
 * 4. Shear: hand-worked values from the code formulas (see each test).
 * 5. Code constants: K_lim, f_ctm, v_c at known inputs.
 */

const rel = (actual: number, expected: number) => Math.abs(actual - expected) / expected;

function params(over: Partial<CodeParameters> = {}): CodeParameters {
  return {
    concreteStrength: 30,
    fy: 500,
    fyv: 500,
    alphaCc: 0.85,
    gammaC: 1.5,
    gammaS: 1.15,
    ...over,
  };
}

const geometry = (b: number, h: number, d: number, dp: number) => ({
  bMm: b,
  hMm: h,
  dMm: d,
  dPrimeMm: dp,
});

describe("code constants", () => {
  it("EC2 limiting K matches x/d = 0.448 and K' = 0.1667 with alpha_cc 0.85", () => {
    expect(ec2LimitingK()).toBeCloseTo(0.2942, 3);
    expect((0.85 / 1.5) * ec2LimitingK()).toBeCloseTo(0.1667, 3);
  });

  it("EC2 mean tensile strength follows Table 3.1", () => {
    expect(ec2MeanTensileStrength(25)).toBeCloseTo(2.6, 1);
    expect(ec2MeanTensileStrength(30)).toBeCloseTo(2.9, 1);
    expect(ec2MeanTensileStrength(40)).toBeCloseTo(3.5, 1);
  });

  it("BS 8110 vc follows the Table 3.8 formula", () => {
    // 100As/bd = 1.0, d = 400, fcu 25: 0.79 / 1.25
    expect(bs8110Vc(1200, 300, 400, 25)).toBeCloseTo(0.632, 3);
    // 0.5%
    expect(bs8110Vc(600, 300, 400, 25)).toBeCloseTo(0.5016, 3);
    // 2.0%
    expect(bs8110Vc(2400, 300, 400, 25)).toBeCloseTo(0.796, 3);
    // shallower beam raises vc by (400/200)^(1/4)
    // (As halved too, so the steel percentage stays at 0.5%)
    expect(bs8110Vc(300, 300, 200, 25)).toBeCloseTo(bs8110Vc(600, 300, 400, 25) * Math.pow(2, 0.25), 4);
    // fcu above 40 is capped at 40
    expect(bs8110Vc(1200, 300, 400, 50)).toBeCloseTo(bs8110Vc(1200, 300, 400, 40), 6);
    expect(bs8110Vc(1200, 300, 400, 40)).toBeCloseTo(0.632 * Math.cbrt(40 / 25), 3);
    // steel percentage is capped at 3.0
    expect(bs8110Vc(6000, 300, 400, 25)).toBeCloseTo(bs8110Vc(3600, 300, 400, 25), 6);
  });
});

describe("Eurocode 2 flexure: published doubly reinforced example", () => {
  const out = getBeamCode("ec2").designFlexure({
    momentKnm: 248,
    geometry: geometry(225, 450, 407, 43),
    params: params(),
  });

  it("is doubly reinforced with yielding compression steel", () => {
    expect(out.feasible).toBe(true);
    expect(out.reinforcement).toBe("doubly");
    expect(out.compressionSteelStressRatio).toBeCloseTo(1, 6);
  });

  it("matches A_s1 = 1675 mm² within 1% and A_s2 = 380 mm² within 3%", () => {
    expect(rel(out.asCalcMm2, 1675.2)).toBeLessThan(0.01);
    expect(rel(out.asCompMm2, 379.9)).toBeLessThan(0.03);
  });
});

describe("BS 8110 flexure: published doubly reinforced example", () => {
  const out = getBeamCode("bs8110").designFlexure({
    momentKnm: 258.5,
    geometry: geometry(225, 450, 407, 43),
    params: params({ concreteStrength: 30, fy: 460, fyv: 460 }),
  });

  it("uses K' = 0.156 and z = 316 mm", () => {
    expect(out.reinforcement).toBe("doubly");
    expect(out.kLimit).toBe(0.156);
    expect(out.kValue).toBeCloseTo(0.2312, 3);
    expect(out.leverArmMm).toBeCloseTo(316.2, 0);
  });

  it("reproduces the published tension term 1378.5 mm² and the formula value of A_s'", () => {
    // tension term = K' fcu b d² / (0.87 fy z)
    const tensionTerm = (0.156 * 30 * 225 * 407 * 407) / (0.87 * 460 * out.leverArmMm);
    expect(rel(tensionTerm, 1378.5)).toBeLessThan(0.005);
    // A_s' = (K - K') fcu b d² / (0.87 fy (d - d')), compression steel yielding
    const expectedComp = ((out.kValue - 0.156) * 30 * 225 * 407 * 407) / (0.87 * 460 * (407 - 43));
    expect(out.asCompMm2).toBeCloseTo(expectedComp, 1);
    expect(out.asCompMm2).toBeCloseTo(577, -1);
    expect(out.asCalcMm2).toBeCloseTo(tensionTerm + out.asCompMm2, 1);
  });
});

/** Rebuild the moment capacity of provided steel by force equilibrium. */
function capacityEc2(as1: number, as2: number, b: number, d: number, dp: number, p: CodeParameters) {
  const fcd = (p.alphaCc * p.concreteStrength) / p.gammaC;
  const fyd = p.fy / p.gammaS;
  const lambda = 0.8;
  const net = (x: number) => {
    const eps = 0.0035 * (1 - dp / x);
    const fsc = Math.max(-fyd, Math.min(fyd, 200000 * eps));
    return { fc: fcd * b * lambda * x, fsc: fsc * as2 };
  };
  let lo = 1e-6;
  let hi = d;
  for (let i = 0; i < 200; i++) {
    const x = (lo + hi) / 2;
    const f = net(x);
    if (f.fc + f.fsc > as1 * fyd) hi = x;
    else lo = x;
  }
  const x = (lo + hi) / 2;
  const f = net(x);
  return { x, capacityKnm: (f.fc * (d - (lambda * x) / 2) + f.fsc * (d - dp)) / 1e6 };
}

function capacityBs(as1: number, as2: number, b: number, d: number, dp: number, p: CodeParameters) {
  const fcu = p.concreteStrength;
  const fyd = 0.87 * p.fy;
  const net = (x: number) => {
    const eps = 0.0035 * (1 - dp / x);
    const fsc = Math.max(-fyd, Math.min(fyd, 200000 * eps));
    return { fc: 0.45 * fcu * b * 0.9 * x, fsc: fsc * as2 };
  };
  let lo = 1e-6;
  let hi = d;
  for (let i = 0; i < 200; i++) {
    const x = (lo + hi) / 2;
    const f = net(x);
    if (f.fc + f.fsc > as1 * fyd) hi = x;
    else lo = x;
  }
  const x = (lo + hi) / 2;
  const f = net(x);
  return { x, capacityKnm: (f.fc * (d - 0.45 * x) + f.fsc * (d - dp)) / 1e6 };
}

describe("equilibrium back-check: provided steel carries the design moment", () => {
  const cases = [
    // singly reinforced, mid-range K
    { b: 300, h: 600, d: 545, dp: 55, m: 250 },
    { b: 250, h: 500, d: 452, dp: 48, m: 120 },
    // doubly reinforced
    { b: 225, h: 450, d: 407, dp: 43, m: 250 },
    { b: 300, h: 500, d: 450, dp: 50, m: 420 },
  ];

  for (const code of BEAM_CODES) {
    for (const c of cases) {
      it(`${code.shortName}: b ${c.b} d ${c.d} M ${c.m} kNm`, () => {
        const p = params({
          concreteStrength: code.id === "ec2" ? 30 : 35,
          fy: code.id === "ec2" ? 500 : 460,
        });
        const out = code.designFlexure({
          momentKnm: c.m,
          geometry: geometry(c.b, c.h, c.d, c.dp),
          params: p,
        });
        expect(out.feasible).toBe(true);
        const cap =
          code.id === "ec2"
            ? capacityEc2(out.asCalcMm2, out.asCompMm2, c.b, c.d, c.dp, p)
            : capacityBs(out.asCalcMm2, out.asCompMm2, c.b, c.d, c.dp, p);
        // Capacity must equal the demand: not short (unsafe) and not wasteful.
        expect(cap.capacityKnm).toBeGreaterThan(c.m * 0.995);
        expect(cap.capacityKnm).toBeLessThan(c.m * 1.015);
      });
    }
  }
});

describe("flexure: edge cases", () => {
  it("flags a section whose compression steel is above the neutral axis", () => {
    for (const code of BEAM_CODES) {
      const out = code.designFlexure({
        momentKnm: 300,
        geometry: geometry(200, 200, 100, 60),
        params: params({ fy: 460 }),
      });
      expect(out.feasible).toBe(false);
      expect(out.infeasibleReason).toContain("above the neutral axis");
    }
  });

  it("applies minimum steel when the moment is tiny", () => {
    for (const code of BEAM_CODES) {
      const out = code.designFlexure({
        momentKnm: 2,
        geometry: geometry(250, 500, 452, 48),
        params: params({ fy: 460 }),
      });
      expect(out.asCalcMm2).toBeLessThan(out.asMinMm2);
      expect(out.asDesignMm2).toBe(out.asMinMm2);
    }
  });

  it("caps the lever arm at 0.95 d for lightly stressed sections", () => {
    for (const code of BEAM_CODES) {
      const out = code.designFlexure({
        momentKnm: 10,
        geometry: geometry(250, 500, 452, 48),
        params: params({ fy: 460 }),
      });
      expect(out.leverArmMm).toBeCloseTo(0.95 * 452, 6);
    }
  });
});

describe("Eurocode 2 shear: hand-worked values", () => {
  const ec2 = getBeamCode("ec2");
  const g = geometry(300, 500, 450, 50);

  it("V_Rd,c for b 300, d 450, fck 30, A_s 1500 mm² is 86.9 kN", () => {
    const s = ec2.designShear({ vEdKn: 50, geometry: g, asTensionMm2: 1500, params: params() });
    expect(s.concreteCapacityKn).toBeCloseTo(86.9, 0);
    expect(s.verdict).toBe("links-minimum");
    // rho_w,min = 0.08 sqrt(30) / 500 -> x b
    expect(s.aswPerSMmReq).toBeCloseTo(((0.08 * Math.sqrt(30)) / 500) * 300, 5);
  });

  it("uses cot(theta) = 2.5 when V_Ed is small enough: A_sw/s = 0.454 mm²/mm at 200 kN", () => {
    const s = ec2.designShear({ vEdKn: 200, geometry: g, asTensionMm2: 1500, params: params() });
    expect(s.verdict).toBe("links-designed");
    expect(s.aswPerSMmReq).toBeCloseTo(0.4543, 3);
    expect(s.maxCapacityKn).toBeCloseTo(545.3, 0);
    expect(s.maxSpacingMm).toBeCloseTo(337.5, 6);
  });

  it("steepens the strut for a high shear: cot(theta) 1.896 and A_sw/s 1.348 at 450 kN", () => {
    const s = ec2.designShear({ vEdKn: 450, geometry: g, asTensionMm2: 1500, params: params() });
    expect(s.verdict).toBe("links-designed");
    expect(s.aswPerSMmReq).toBeCloseTo(1.348, 2);
  });

  it("reports the section inadequate above V_Rd,max", () => {
    const s = ec2.designShear({ vEdKn: 600, geometry: g, asTensionMm2: 1500, params: params() });
    expect(s.verdict).toBe("section-inadequate");
  });

  it("never lets the designed links fall below the minimum", () => {
    const s = ec2.designShear({ vEdKn: 90, geometry: g, asTensionMm2: 1500, params: params() });
    expect(s.aswPerSMmReq).toBeGreaterThanOrEqual(((0.08 * Math.sqrt(30)) / 500) * 300 - 1e-9);
  });
});

describe("BS 8110 shear: hand-worked values", () => {
  const bs = getBeamCode("bs8110");
  const g = geometry(300, 500, 450, 50);
  const p = params({ concreteStrength: 30, fy: 460, fyv: 460 });

  it("nominal links when v <= v_c + 0.4: 0.300 mm²/mm at 100 kN", () => {
    const s = bs.designShear({ vEdKn: 100, geometry: g, asTensionMm2: 1500, params: p });
    expect(s.verdict).toBe("links-minimum");
    expect(s.aswPerSMmReq).toBeCloseTo((0.4 * 300) / (0.87 * 460), 4);
  });

  it("designed links when v > v_c + 0.4: 0.589 mm²/mm at 200 kN", () => {
    const s = bs.designShear({ vEdKn: 200, geometry: g, asTensionMm2: 1500, params: p });
    expect(s.verdict).toBe("links-designed");
    // v = 1.4815, v_c = 0.6956
    expect(s.aswPerSMmReq).toBeCloseTo(0.589, 2);
  });

  it("v_max = min(0.8 sqrt(fcu), 5): section inadequate above it", () => {
    const vmax = 0.8 * Math.sqrt(30);
    const limit = (vmax * 300 * 450) / 1000;
    const ok = bs.designShear({ vEdKn: limit * 0.98, geometry: g, asTensionMm2: 1500, params: p });
    const bad = bs.designShear({ vEdKn: limit * 1.02, geometry: g, asTensionMm2: 1500, params: p });
    expect(ok.verdict).not.toBe("section-inadequate");
    expect(bad.verdict).toBe("section-inadequate");
    expect(ok.maxCapacityKn).toBeCloseTo(limit, 6);
  });
});

type Overrides = Partial<Record<keyof BeamDesignFormValues, string | number>>;

/** Build a validated input from the defaults plus overrides, the way the form does. */
function input(over: Overrides = {}): BeamDesignInput {
  const values: Record<string, string> = { ...beamDesignDefaults };
  for (const [k, v] of Object.entries(over)) values[k] = String(v);
  const parsed = parseBeamDesignInput(values);
  if (!parsed.success) throw new Error(parsed.error.issues.map((i) => i.message).join("; "));
  return parsed.data;
}

const bsOverrides = (): Overrides => ({ code: "bs8110", ...codeDefaultsForForm("bs8110") });

describe("beam design: Eurocode 2 default scenario, worked independently", () => {
  // 250 x 500, cover 30, link 8, main 20 -> d = 452, d' = 48
  // self-weight 25 x 0.25 x 0.5 = 3.125 kN/m; gk 15.125; w = 1.35 x 15.125 + 1.5 x 8 = 32.419
  const r = calculateBeamDesign(input());
  const o = r.outputs;

  it("derives the geometry and actions", () => {
    expect(o.geometry.dMm).toBeCloseTo(452, 6);
    expect(o.geometry.dPrimeMm).toBeCloseTo(48, 6);
    expect(o.loads?.selfWeightKnm).toBeCloseTo(3.125, 6);
    expect(o.loads?.designLoadKnm).toBeCloseTo(32.419, 2);
    expect(o.momentKnm).toBeCloseTo(101.31, 1);
    expect(o.shearKn).toBeCloseTo(81.05, 1);
  });

  it("is singly reinforced: A_s about 558 mm², two bars Ø20", () => {
    expect(o.flexure.reinforcement).toBe("singly");
    expect(o.flexure.asCalcMm2).toBeCloseTo(557.7, 0);
    expect(o.flexure.asDesignMm2).toBeCloseTo(557.7, 0);
    expect(o.tension?.count).toBe(2);
    expect(o.tension?.areaProvidedMm2).toBeCloseTo(628.3, 1);
    expect(o.compression).toBeNull();
  });

  it("links: minimum steel governs, Ø8 two-leg at 325 mm", () => {
    expect(o.shear.verdict).toBe("links-designed");
    expect(o.shear.aswPerSMmReq).toBeCloseTo(0.2, 3);
    expect(o.links?.spacingMm).toBe(325);
  });

  it("passes every check and reports adequate", () => {
    expect(o.adequate).toBe(true);
    expect(r.checks.every((c) => c.status === "pass")).toBe(true);
    expect(r.checks.map((c) => c.label)).toContain("Shear within section limit");
  });

  it("returns the full sheet: three headline cards, a summary table, assumptions and basis", () => {
    expect(r.quantities.filter((q) => q.emphasis)).toHaveLength(3);
    expect(r.tables[0].title).toBe("Reinforcement summary");
    expect(r.tables[0].rows).toHaveLength(2);
    expect(r.assumptions.length).toBeGreaterThan(5);
    expect(r.basis.map((b) => b.label)).toContain("Not covered");
    expect(r.steps.length).toBeGreaterThan(6);
  });
});

describe("beam design: load cases", () => {
  it("cantilever uses wL²/2 and wL", () => {
    const simple = calculateBeamDesign(input({ support: "simple" })).outputs;
    const cant = calculateBeamDesign(input({ support: "cantilever" })).outputs;
    expect(cant.momentKnm).toBeCloseTo(simple.momentKnm * 4, 6);
    expect(cant.shearKn).toBeCloseTo(simple.shearKn * 2, 6);
  });

  it("excluding self-weight lowers the load by exactly the self-weight x factor", () => {
    const withSw = calculateBeamDesign(input()).outputs.loads!;
    const without = calculateBeamDesign(input({ selfWeight: "no" })).outputs.loads!;
    expect(withSw.designLoadKnm - without.designLoadKnm).toBeCloseTo(1.35 * 3.125, 6);
  });

  it("direct mode uses the entered M and V unchanged and skips load working", () => {
    const r = calculateBeamDesign(input({ loadMode: "direct", momentKnm: 200, shearKn: 150 }));
    expect(r.outputs.momentKnm).toBe(200);
    expect(r.outputs.shearKn).toBe(150);
    expect(r.outputs.loads).toBeNull();
    expect(r.steps[0].title).toBe("Design actions");
  });

  it("BS 8110 uses 1.4 / 1.6 and 24 kN/m³", () => {
    const r = calculateBeamDesign(
      input(bsOverrides()),
    );
    // self-weight 24 x 0.25 x 0.5 = 3.0; w = 1.4 x (12 + 3) + 1.6 x 8 = 33.8
    expect(r.outputs.loads?.selfWeightKnm).toBeCloseTo(3.0, 6);
    expect(r.outputs.loads?.designLoadKnm).toBeCloseTo(33.8, 6);
  });
});

describe("beam design: both codes through the same engine", () => {
  const bs = calculateBeamDesign(
    input(bsOverrides()),
  );
  const ec = calculateBeamDesign(input());

  it("agree to within 25% on tension steel for the same beam", () => {
    const ratio = bs.outputs.flexure.asCalcMm2 / ec.outputs.flexure.asCalcMm2;
    expect(ratio).toBeGreaterThan(0.8);
    expect(ratio).toBeLessThan(1.25);
  });

  it("name their own code on the sheet", () => {
    expect(ec.methodology).toContain("Eurocode 2");
    expect(bs.methodology).toContain("BS 8110");
    expect(bs.assumptions.map((a) => a.value).join(" ")).toContain("K' = 0.156");
  });
});

describe("beam design: doubly reinforced and failing sections", () => {
  it("designs compression steel and checks the neutral axis", () => {
    const r = calculateBeamDesign(
      input({ loadMode: "direct", momentKnm: 330, shearKn: 150, bMm: 250, hMm: 500 }),
    );
    expect(r.outputs.flexure.reinforcement).toBe("doubly");
    expect(r.outputs.compression).not.toBeNull();
    expect(r.checks.map((c) => c.label)).toContain("Compression steel below the neutral axis");
    expect(r.quantities.find((q) => q.label === "Compression steel")?.value).not.toBe("None");
    expect(r.warnings.map((w) => w.message).join(" ")).toContain("deeper beam");
  });

  it("flags a section that fails on shear and withholds links", () => {
    const r = calculateBeamDesign(
      input({ loadMode: "direct", momentKnm: 120, shearKn: 900, bMm: 250, hMm: 500 }),
    );
    expect(r.outputs.shear.verdict).toBe("section-inadequate");
    expect(r.outputs.adequate).toBe(false);
    expect(r.outputs.links).toBeNull();
    expect(r.checks.find((c) => c.label === "Shear within section limit")?.status).toBe("fail");
    expect(r.quantities.find((q) => q.label === "Shear links")?.value).toBe("Not possible");
  });

  it("flags bars that cannot fit in one layer", () => {
    const r = calculateBeamDesign(
      input({ loadMode: "direct", momentKnm: 330, shearKn: 150, bMm: 200, hMm: 600 }),
    );
    expect(r.warnings.some((w) => w.message.includes("one layer"))).toBe(true);
  });

  it("warns that deflection probably governs on a slender span", () => {
    const r = calculateBeamDesign(input({ spanM: 12 }));
    expect(r.warnings.some((w) => w.message.includes("Deflection probably governs"))).toBe(true);
  });
});

describe("section geometry", () => {
  it("d = h - cover - link - bar/2", () => {
    const g = sectionGeometry(input({ hMm: 600, coverMm: 40, linkDiameterMm: 10, mainBarDiameterMm: 25 }));
    expect(g.dMm).toBeCloseTo(600 - 40 - 10 - 12.5, 6);
    expect(g.dPrimeMm).toBeCloseTo(62.5, 6);
  });
});

describe("input schema", () => {
  it("accepts the defaults for both codes", () => {
    expect(parseBeamDesignInput(beamDesignDefaults).success).toBe(true);
    expect(
      parseBeamDesignInput({ ...beamDesignDefaults, code: "bs8110", ...codeDefaultsForForm("bs8110") }).success,
    ).toBe(true);
  });

  it("ignores stale invalid values in fields the mode does not use", () => {
    expect(parseBeamDesignInput({ ...beamDesignDefaults, momentKnm: "abc", shearKn: "" }).success).toBe(true);
    expect(
      parseBeamDesignInput({ ...beamDesignDefaults, loadMode: "direct", deadKnm: "abc", liveKnm: "-5" }).success,
    ).toBe(true);
    expect(
      parseBeamDesignInput({
        ...beamDesignDefaults,
        code: "bs8110",
        ...codeDefaultsForForm("bs8110"),
        alphaCc: "abc",
      }).success,
    ).toBe(true);
  });

  it("still validates the fields that matter", () => {
    const r = parseBeamDesignInput({ ...beamDesignDefaults, spanM: "five" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("digits and a decimal point");
    const r2 = parseBeamDesignInput({ ...beamDesignDefaults, loadMode: "direct", momentKnm: "abc" });
    expect(r2.success).toBe(false);
  });

  it("rejects a concrete grade that belongs to the other code", () => {
    const r = parseBeamDesignInput({ ...beamDesignDefaults, concreteStrengthMpa: "45" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("Eurocode 2 list");
  });

  it("rejects a section with no usable depth", () => {
    const r = parseBeamDesignInput({ ...beamDesignDefaults, hMm: "160", coverMm: "50" });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toContain("no usable depth");
  });

  it("rejects a non-standard bar size and a zero total load", () => {
    expect(parseBeamDesignInput({ ...beamDesignDefaults, mainBarDiameterMm: "18" }).success).toBe(false);
    const zero = parseBeamDesignInput({
      ...beamDesignDefaults,
      deadKnm: "0",
      liveKnm: "0",
      selfWeight: "no",
    });
    expect(zero.success).toBe(false);
  });
});
