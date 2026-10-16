import { describe, expect, it } from "vitest";
import {
  interactionCurve,
  maxAxialCapacityKn,
  momentCapacityAtAxial,
  resistanceAtNeutralAxis,
  type SectionDefinition,
  type StressModel,
} from "./section-capacity";

/**
 * The strain-compatibility engine is checked against hand derivations that
 * do not use its code paths: closed-form equilibrium for a known neutral
 * axis, the pure-compression limit, and the N = 0 beam case solved as a
 * quadratic. Section: 300 x 500, two bars of 20 mm top and bottom
 * (628 mm² per face) at 50 mm from each face.
 */

const section: SectionDefinition = {
  bMm: 300,
  hMm: 500,
  rows: [
    { yMm: 50, areaMm2: 628 },
    { yMm: 450, areaMm2: 628 },
  ],
};

/** EC2: fck 30, alpha_cc 0.85, gamma_c 1.5, fyk 500, gamma_s 1.15. */
const FCD = (0.85 * 30) / 1.5;
const FYD = 500 / 1.15;
const ec2Model: StressModel = { blockRatio: 0.8, blockStress: FCD, steelYield: FYD };

/** BS 8110: fcu 30, fy 460. */
const bsModel: StressModel = { blockRatio: 0.9, blockStress: 0.45 * 30, steelYield: 0.87 * 460 };

describe("pure axial compression", () => {
  it("EC2: N0 = fcd b h + (sigma_s - fcd) As, steel at 0.002 strain = 400 N/mm²", () => {
    const expected = (FCD * 300 * 500 + (400 - FCD) * 1256) / 1000;
    expect(maxAxialCapacityKn(section, ec2Model)).toBeCloseTo(expected, 0);
  });

  it("BS 8110: same limit with its block stress and 0.87 fy", () => {
    const expected = (13.5 * 300 * 500 + (400 - 13.5) * 1256) / 1000;
    expect(maxAxialCapacityKn(section, bsModel)).toBeCloseTo(expected, 0);
  });

  it("steel that yields below 0.002 strain is capped at its design yield", () => {
    const soft: StressModel = { ...ec2Model, steelYield: 300 };
    const expected = (FCD * 300 * 500 + (300 - FCD) * 1256) / 1000;
    expect(maxAxialCapacityKn(section, soft)).toBeCloseTo(expected, 0);
  });
});

describe("a known neutral axis, summed by hand (EC2, x = 200 mm)", () => {
  // Top bars: strain 0.0035 × 150/200 = 0.002625, past yield, inside the block.
  // Bottom bars: strain 0.0035 × (200 - 450)/200 = -0.004375, yielded in tension.
  const block = 0.8 * 200;
  const fc = FCD * 300 * block;
  const top = (FYD - FCD) * 628;
  const bottom = -FYD * 628;
  const nHand = (fc + top + bottom) / 1000;
  const mHand = (fc * (250 - block / 2) + top * (250 - 50) + bottom * (250 - 450)) / 1e6;

  it("matches the hand sum for axial force and moment", () => {
    const p = resistanceAtNeutralAxis(section, ec2Model, 200);
    expect(p.nKn).toBeCloseTo(nHand, 3);
    expect(p.mKnm).toBeCloseTo(mHand, 3);
  });

  it("recovers that moment when asked for the capacity at that axial load", () => {
    const cap = momentCapacityAtAxial(section, ec2Model, nHand);
    expect(cap).not.toBeNull();
    expect(cap!.xMm).toBeCloseTo(200, 2);
    expect(cap!.mKnm).toBeCloseTo(mHand, 2);
  });
});

describe("zero axial load reduces to a beam with compression steel", () => {
  it("EC2: matches the closed-form quadratic for the neutral axis", () => {
    // 0.8 x b fcd + A' sigma' - A fyd = 0 with top steel elastic: sigma' = 700 (x - 50) / x.
    // The top bars sit below the stress block (0.8 x < 50 mm), so no displaced-concrete term.
    const A = 628;
    const a = 0.8 * 300 * FCD;
    const bq = A * 700 - A * FYD;
    const c = -A * 700 * 50;
    const x = (-bq + Math.sqrt(bq * bq - 4 * a * c)) / (2 * a);
    expect(0.8 * x).toBeLessThan(50);
    const sigmaTop = (700 * (x - 50)) / x;
    expect(sigmaTop).toBeLessThan(FYD);
    const fc = a * x;
    const mHand = (fc * (250 - 0.4 * x) + sigmaTop * A * 200 + FYD * A * 200) / 1e6;

    const cap = momentCapacityAtAxial(section, ec2Model, 0);
    expect(cap).not.toBeNull();
    expect(cap!.xMm).toBeCloseTo(x, 2);
    expect(cap!.mKnm).toBeCloseTo(mHand, 2);
  });
});

describe("limits and the interaction curve", () => {
  it("returns null above the axial capacity and in tension beyond the bars", () => {
    const n0 = maxAxialCapacityKn(section, ec2Model);
    expect(momentCapacityAtAxial(section, ec2Model, n0 * 1.001)).toBeNull();
    expect(momentCapacityAtAxial(section, ec2Model, -(1256 * FYD) / 1000 - 10)).toBeNull();
  });

  it("moment capacity is positive between zero load and the axial limit", () => {
    const n0 = maxAxialCapacityKn(section, ec2Model);
    for (const f of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.99]) {
      const cap = momentCapacityAtAxial(section, ec2Model, f * n0);
      expect(cap).not.toBeNull();
      expect(cap!.mKnm).toBeGreaterThan(0);
    }
  });

  it("capacity peaks at an intermediate load (the balanced region), not at either end", () => {
    const n0 = maxAxialCapacityKn(section, ec2Model);
    const m0 = momentCapacityAtAxial(section, ec2Model, 0)!.mKnm;
    const mMid = momentCapacityAtAxial(section, ec2Model, 0.35 * n0)!.mKnm;
    const mHigh = momentCapacityAtAxial(section, ec2Model, 0.99 * n0)!.mKnm;
    expect(mMid).toBeGreaterThan(m0);
    expect(mMid).toBeGreaterThan(mHigh);
  });

  it("more steel never reduces capacity", () => {
    const heavy: SectionDefinition = {
      ...section,
      rows: section.rows.map((r) => ({ ...r, areaMm2: r.areaMm2 * 2 })),
    };
    for (const n of [0, 500, 1500, 2500]) {
      expect(momentCapacityAtAxial(heavy, ec2Model, n)!.mKnm).toBeGreaterThan(
        momentCapacityAtAxial(section, ec2Model, n)!.mKnm,
      );
    }
  });

  it("the plotted curve is ordered, starts at zero load and ends at the axial capacity", () => {
    const curve = interactionCurve(section, ec2Model);
    expect(curve[0].nKn).toBe(0);
    expect(curve[curve.length - 1].nKn).toBeCloseTo(maxAxialCapacityKn(section, ec2Model), 3);
    for (let i = 1; i < curve.length; i++) {
      expect(curve[i].nKn).toBeGreaterThanOrEqual(curve[i - 1].nKn);
    }
  });
});
