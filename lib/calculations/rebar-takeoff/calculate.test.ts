import { describe, expect, it } from "vitest";
import { formatNumber } from "../format";
import {
  barUnitWeightKgM,
  calculateRebarTakeoff,
  numberOfBarsFromSpacing,
  type RebarTakeoffResult,
} from "./calculate";
import { rebarTakeoffInputSchema, type RebarTakeoffInput } from "./schema";

/**
 * Reference values
 * ----------------
 * Bar unit weights are checked against the published nominal mass table used
 * across BS 4449, IS 1786 and equivalent East African / Commonwealth
 * standards (all derived from density 7850 kg/m³, so the table is
 * code-agnostic physics, not a jurisdiction choice):
 *
 *   6 mm  → 0.222 kg/m   8 mm  → 0.395 kg/m   10 mm → 0.617 kg/m
 *   12 mm → 0.888 kg/m   16 mm → 1.578 kg/m   20 mm → 2.466 kg/m
 *   25 mm → 3.853 kg/m   32 mm → 6.313 kg/m   40 mm → 9.865 kg/m
 *
 * The beam and slab scenarios below are hand-derived independently in this
 * file (not by calling the engine's own helpers) so the test is a real
 * cross-check, not a tautology.
 */

function refUnitWeight(diameterMm: number): number {
  const d = diameterMm / 1000;
  return (Math.PI / 4) * d * d * 7850;
}

describe("barUnitWeightKgM: matches the published nominal mass table", () => {
  const table: Array<[number, number]> = [
    [6, 0.222],
    [8, 0.395],
    [10, 0.617],
    [12, 0.888],
    [16, 1.578],
    [20, 2.466],
    [25, 3.853],
    [32, 6.313],
    [40, 9.865],
  ];

  it.each(table)("%i mm bar ≈ %s kg/m", (dia, published) => {
    expect(barUnitWeightKgM(dia)).toBeCloseTo(published, 2);
  });
});

describe("numberOfBarsFromSpacing", () => {
  it("gives one bar at each end plus however many fit between", () => {
    expect(numberOfBarsFromSpacing(4000, 150)).toBe(27);
    expect(numberOfBarsFromSpacing(1000, 200)).toBe(6);
    expect(numberOfBarsFromSpacing(999, 200)).toBe(5);
  });
});

function beamInput(overrides: Partial<RebarTakeoffInput> = {}): RebarTakeoffInput {
  return {
    memberType: "beam",
    numberOfMembers: 1,
    coverMm: 25,
    memberLengthM: 4,
    widthMm: 230,
    depthMm: 450,
    mainBarDiameterMm: 16,
    mainBarCount: 4,
    linkDiameterMm: 8,
    linkSpacingMm: 150,
    hookAllowanceMm: 100,
    extraLengthMm: 0,
    ...overrides,
  };
}

describe("beam takeoff: hand-derived reference scenario", () => {
  it("matches an independently worked example (4 m beam, 230×450, 4T16 main, T8@150 links)", () => {
    const r = calculateRebarTakeoff(beamInput());
    const [main, links] = r.outputs.groups;

    // Main bars: 4 no. × 4.0 m
    expect(main.countPerMember).toBe(4);
    expect(main.lengthEachM).toBeCloseTo(4.0, 6);
    expect(main.totalLengthM).toBeCloseTo(16.0, 6);
    expect(main.totalWeightKg).toBeCloseTo(16.0 * refUnitWeight(16), 4);

    // Links: floor(4000/150)+1 = 27 no.; cut length 2×[(230-50)+(450-50)]+100 = 1260 mm
    expect(links.countPerMember).toBe(27);
    expect(links.lengthEachM).toBeCloseTo(1.26, 6);
    expect(links.totalLengthM).toBeCloseTo(27 * 1.26, 6);
    expect(links.totalWeightKg).toBeCloseTo(27 * 1.26 * refUnitWeight(8), 4);

    expect(r.outputs.totalWeightKg).toBeCloseTo(
      main.totalWeightKg + links.totalWeightKg,
      6,
    );
    expect(r.outputs.totalLengthM).toBeCloseTo(16.0 + 27 * 1.26, 6);
  });

  it("scales linearly with number of identical members", () => {
    const one = calculateRebarTakeoff(beamInput());
    const six = calculateRebarTakeoff(beamInput({ numberOfMembers: 6 }));
    expect(six.outputs.totalWeightKg).toBeCloseTo(one.outputs.totalWeightKg * 6, 6);
  });

  it("extra length adds directly to each main bar", () => {
    const base = calculateRebarTakeoff(beamInput());
    const withExtra = calculateRebarTakeoff(beamInput({ extraLengthMm: 500 }));
    const [mainBase] = base.outputs.groups;
    const [mainExtra] = withExtra.outputs.groups;
    expect(mainExtra.lengthEachM).toBeCloseTo(mainBase.lengthEachM + 0.5, 6);
  });

  it("hook allowance adds directly to link cut length", () => {
    const base = calculateRebarTakeoff(beamInput({ hookAllowanceMm: 0 }));
    const withHooks = calculateRebarTakeoff(beamInput({ hookAllowanceMm: 100 }));
    const [, linksBase] = base.outputs.groups;
    const [, linksHooks] = withHooks.outputs.groups;
    expect(linksHooks.lengthEachM).toBeCloseTo(linksBase.lengthEachM + 0.1, 6);
  });

  it("produces a bar bending schedule table with a totals row", () => {
    const r = calculateRebarTakeoff(beamInput());
    const table = r.tables[0];
    expect(table.title).toBe("Bar bending schedule");
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0].mark).toBe("Main bars");
    expect(table.rows[1].mark).toBe("Stirrups");
    expect(table.totalsRow?.totalWeight).toBe(formatNumber(r.outputs.totalWeightKg, 2));
  });
});

describe("column takeoff: shares the beam formula, labelled as links", () => {
  it("computes identically to the equivalent beam given the same geometry", () => {
    const beam = calculateRebarTakeoff(beamInput());
    const column = calculateRebarTakeoff(beamInput({ memberType: "column" }));
    expect(column.outputs.totalWeightKg).toBeCloseTo(beam.outputs.totalWeightKg, 6);
    expect(column.tables[0].rows[1].mark).toBe("Links");
  });
});

function slabInput(overrides: Partial<RebarTakeoffInput> = {}): RebarTakeoffInput {
  return {
    memberType: "slab",
    numberOfMembers: 1,
    coverMm: 25,
    hookAllowanceMm: 0,
    extraLengthMm: 0,
    panelLengthM: 6,
    panelWidthM: 4,
    mainBarDiameterMm: 12,
    mainBarSpacingMm: 200,
    distBarDiameterMm: 10,
    distBarSpacingMm: 250,
    ...overrides,
  };
}

describe("slab takeoff: hand-derived reference scenario", () => {
  it("matches an independently worked 6 m × 4 m panel (T12@200 main, T10@250 distribution)", () => {
    const r = calculateRebarTakeoff(slabInput());
    const [main, dist] = r.outputs.groups;

    // Main bars span the 6 m length, spaced across the 4 m width: floor(4000/200)+1 = 21
    expect(main.countPerMember).toBe(21);
    expect(main.lengthEachM).toBeCloseTo(6.0 - 0.05, 6);
    expect(main.totalWeightKg).toBeCloseTo(21 * (6.0 - 0.05) * refUnitWeight(12), 4);

    // Distribution bars span the 4 m width, spaced across the 6 m length: floor(6000/250)+1 = 25
    expect(dist.countPerMember).toBe(25);
    expect(dist.lengthEachM).toBeCloseTo(4.0 - 0.05, 6);
    expect(dist.totalWeightKg).toBeCloseTo(25 * (4.0 - 0.05) * refUnitWeight(10), 4);

    expect(r.outputs.totalWeightKg).toBeCloseTo(
      main.totalWeightKg + dist.totalWeightKg,
      6,
    );
  });

  it("number of members scales a two-layer (top and bottom) mesh correctly", () => {
    const oneLayer = calculateRebarTakeoff(slabInput());
    const twoLayers = calculateRebarTakeoff(slabInput({ numberOfMembers: 2 }));
    expect(twoLayers.outputs.totalWeightKg).toBeCloseTo(
      oneLayer.outputs.totalWeightKg * 2,
      6,
    );
  });

  it("larger cover shortens both bar directions", () => {
    const base = calculateRebarTakeoff(slabInput());
    const moreCover = calculateRebarTakeoff(slabInput({ coverMm: 40 }));
    const [mainBase] = base.outputs.groups;
    const [mainMore] = moreCover.outputs.groups;
    expect(mainMore.lengthEachM).toBeLessThan(mainBase.lengthEachM);
    expect(mainBase.lengthEachM - mainMore.lengthEachM).toBeCloseTo(0.03, 6);
  });
});

describe("sanity warnings", () => {
  function messages(r: RebarTakeoffResult): string {
    return r.warnings.map((w) => w.message).join(" | ");
  }

  it("flags a single main bar as unusual", () => {
    const r = calculateRebarTakeoff(beamInput({ mainBarCount: 1 }));
    const w = r.warnings.find((x) => x.message.includes("unusual"));
    expect(w).toBeDefined();
    expect(w?.level).toBe("caution");
  });

  it("flags an unusually long single beam", () => {
    const r = calculateRebarTakeoff(beamInput({ memberLengthM: 15 }));
    expect(messages(r)).toContain("long single beam");
  });

  it("flags zero hook allowance as a notice", () => {
    const r = calculateRebarTakeoff(beamInput({ hookAllowanceMm: 0 }));
    const w = r.warnings.find((x) => x.message.includes("hook allowance is 0"));
    expect(w?.level).toBe("notice");
  });

  it("flags thin cover as a caution", () => {
    const r = calculateRebarTakeoff(beamInput({ coverMm: 12 }));
    expect(messages(r)).toContain("thinner than typical");
  });

  it("flags wide slab bar spacing", () => {
    const r = calculateRebarTakeoff(slabInput({ mainBarSpacingMm: 450 }));
    expect(messages(r)).toContain("wider than typical for a slab");
  });

  it("produces no warnings for a typical everyday beam", () => {
    const r = calculateRebarTakeoff(beamInput());
    expect(r.warnings).toEqual([]);
  });
});

describe("engine guards (defence in depth below the schema)", () => {
  it("throws if a beam is missing required fields", () => {
    expect(() =>
      calculateRebarTakeoff({
        memberType: "beam",
        numberOfMembers: 1,
        coverMm: 25,
      } as RebarTakeoffInput),
    ).toThrow();
  });

  it("throws if a slab is missing required fields", () => {
    expect(() =>
      calculateRebarTakeoff({
        memberType: "slab",
        numberOfMembers: 1,
        coverMm: 25,
      } as RebarTakeoffInput),
    ).toThrow();
  });
});

describe("input schema: form-string coercion, standard sizes, and human messages", () => {
  it("parses raw beam form strings into numbers", () => {
    const parsed = rebarTakeoffInputSchema.parse({
      memberType: "beam",
      numberOfMembers: "1",
      coverMm: "25",
      memberLengthM: "4",
      widthMm: "230",
      depthMm: "450",
      mainBarDiameterMm: "16",
      mainBarCount: "4",
      linkDiameterMm: "8",
      linkSpacingMm: "150",
    });
    expect(parsed.memberLengthM).toBe(4);
    expect(parsed.mainBarCount).toBe(4);
    expect(parsed.hookAllowanceMm).toBe(100);
  });

  it("rejects a non-standard bar diameter with a human message", () => {
    const res = rebarTakeoffInputSchema.safeParse({
      memberType: "beam",
      numberOfMembers: "1",
      coverMm: "25",
      memberLengthM: "4",
      widthMm: "230",
      depthMm: "450",
      mainBarDiameterMm: "17",
      mainBarCount: "4",
      linkDiameterMm: "8",
      linkSpacingMm: "150",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toContain("standard bar size");
    }
  });

  it("requires beam fields when memberType is beam", () => {
    const res = rebarTakeoffInputSchema.safeParse({
      memberType: "beam",
      numberOfMembers: "1",
      coverMm: "25",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("memberLengthM");
      expect(paths).toContain("mainBarDiameterMm");
      expect(paths).toContain("linkSpacingMm");
    }
  });

  it("requires slab fields when memberType is slab", () => {
    const res = rebarTakeoffInputSchema.safeParse({
      memberType: "slab",
      numberOfMembers: "1",
      coverMm: "25",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("panelLengthM");
      expect(paths).toContain("distBarSpacingMm");
    }
  });

  it("rejects a section too small for its cover and link diameter", () => {
    const res = rebarTakeoffInputSchema.safeParse({
      memberType: "beam",
      numberOfMembers: "1",
      coverMm: "40",
      memberLengthM: "4",
      widthMm: "75",
      depthMm: "450",
      mainBarDiameterMm: "16",
      mainBarCount: "4",
      linkDiameterMm: "8",
      linkSpacingMm: "150",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toContain("no room inside the section");
    }
  });

  it("rejects a non-numeric field with a human message, not 'invalid input'", () => {
    const res = rebarTakeoffInputSchema.safeParse({
      memberType: "beam",
      numberOfMembers: "1",
      coverMm: "25",
      memberLengthM: "four",
      widthMm: "230",
      depthMm: "450",
      mainBarDiameterMm: "16",
      mainBarCount: "4",
      linkDiameterMm: "8",
      linkSpacingMm: "150",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toContain("digits and a decimal point");
    }
  });
});
