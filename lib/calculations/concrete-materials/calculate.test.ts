import { describe, expect, it } from "vitest";
import {
  calculateConcreteMaterials,
  type ConcreteMaterialsResult,
} from "./calculate";
import {
  concreteMaterialsInputSchema,
  type ConcreteMaterialsInput,
} from "./schema";

/**
 * Reference values
 * ----------------
 * The expected figures below are the standard dry-volume method results found
 * in quantity-surveying and estimating references used across East African /
 * Commonwealth practice (and identical in Indian practice references for
 * nominal mixes M10/M15/M20/M25):
 *
 *   For 1 m³ of compacted concrete, k = 1.54, ρ_cement = 1440 kg/m³,
 *   ρ_sand = 1600 kg/m³, ρ_ballast = 1500 kg/m³, 50 kg bags:
 *
 *   1:3:6   (Class 15) → cement 221.76 kg = 4.44 bags, sand 0.462 m³,
 *                        ballast 0.924 m³
 *   1:2:4   (Class 20) → cement 316.8 kg  = 6.34 bags, sand 0.44 m³ (704 kg),
 *                        ballast 0.88 m³ (1,320 kg)
 *   1:1.5:3 (Class 25) → cement 403.2 kg  = 8.06 bags ("8 bags per cube"),
 *                        sand 0.42 m³, ballast 0.84 m³
 *   1:1:2   (Class 30) → cement 554.4 kg  = 11.09 bags
 *
 * The widely quoted rules of thumb these produce — ~6.3 bags/m³ for 1:2:4 and
 * ~8 bags/m³ for 1:1.5:3 — are the sanity anchors for this module.
 */

function baseInput(overrides: Partial<ConcreteMaterialsInput> = {}): ConcreteMaterialsInput {
  return {
    volumeM3: 1,
    mixSelection: "class20",
    bagSizeKg: 50,
    bulkingFactor: 1.54,
    cementDensityKgM3: 1440,
    fineAggDensityKgM3: 1600,
    coarseAggDensityKgM3: 1500,
    ...overrides,
  };
}

describe("dry-volume method — reference values for 1 m³", () => {
  it("Class 20 (1:2:4) matches the standard takeoff figures", () => {
    const r = calculateConcreteMaterials(baseInput());
    expect(r.outputs.dryVolumeM3).toBeCloseTo(1.54, 10);
    expect(r.outputs.totalParts).toBe(7);
    expect(r.outputs.cement.volumeM3).toBeCloseTo(0.22, 4);
    expect(r.outputs.cement.massKg).toBeCloseTo(316.8, 2);
    expect(r.outputs.cement.bagsExact).toBeCloseTo(6.336, 3);
    expect(r.outputs.cement.bagsToBuy).toBe(7);
    expect(r.outputs.fineAggregate.volumeM3).toBeCloseTo(0.44, 4);
    expect(r.outputs.fineAggregate.massKg).toBeCloseTo(704, 1);
    expect(r.outputs.fineAggregate.tonnes).toBeCloseTo(0.704, 4);
    expect(r.outputs.coarseAggregate.volumeM3).toBeCloseTo(0.88, 4);
    expect(r.outputs.coarseAggregate.massKg).toBeCloseTo(1320, 1);
    expect(r.outputs.coarseAggregate.tonnes).toBeCloseTo(1.32, 4);
  });

  it("Class 25 (1:1.5:3) gives the classic ~8 bags per cube", () => {
    const r = calculateConcreteMaterials(baseInput({ mixSelection: "class25" }));
    expect(r.outputs.totalParts).toBeCloseTo(5.5, 10);
    expect(r.outputs.cement.volumeM3).toBeCloseTo(0.28, 4);
    expect(r.outputs.cement.massKg).toBeCloseTo(403.2, 2);
    expect(r.outputs.cement.bagsExact).toBeCloseTo(8.064, 3);
    expect(r.outputs.cement.bagsToBuy).toBe(9);
    expect(r.outputs.fineAggregate.volumeM3).toBeCloseTo(0.42, 4);
    expect(r.outputs.fineAggregate.massKg).toBeCloseTo(672, 1);
    expect(r.outputs.coarseAggregate.volumeM3).toBeCloseTo(0.84, 4);
    expect(r.outputs.coarseAggregate.massKg).toBeCloseTo(1260, 1);
  });

  it("Class 15 (1:3:6) matches reference figures", () => {
    const r = calculateConcreteMaterials(baseInput({ mixSelection: "class15" }));
    expect(r.outputs.totalParts).toBe(10);
    expect(r.outputs.cement.massKg).toBeCloseTo(221.76, 2);
    expect(r.outputs.cement.bagsExact).toBeCloseTo(4.435, 3);
    expect(r.outputs.fineAggregate.volumeM3).toBeCloseTo(0.462, 4);
    expect(r.outputs.fineAggregate.massKg).toBeCloseTo(739.2, 1);
    expect(r.outputs.coarseAggregate.volumeM3).toBeCloseTo(0.924, 4);
    expect(r.outputs.coarseAggregate.massKg).toBeCloseTo(1386, 1);
  });

  it("Class 30 (1:1:2) matches reference figures", () => {
    const r = calculateConcreteMaterials(baseInput({ mixSelection: "class30" }));
    expect(r.outputs.totalParts).toBe(4);
    expect(r.outputs.cement.massKg).toBeCloseTo(554.4, 2);
    expect(r.outputs.cement.bagsExact).toBeCloseTo(11.088, 3);
    expect(r.outputs.fineAggregate.volumeM3).toBeCloseTo(0.385, 4);
    expect(r.outputs.coarseAggregate.volumeM3).toBeCloseTo(0.77, 4);
  });

  it("total material mass per m³ lands in the plausible fresh-concrete band", () => {
    // Physical sanity: cement + sand + ballast for 1 m³ of 1:2:4 should be in
    // the region of fresh concrete density (~2,300–2,500 kg/m³ incl. water).
    const r = calculateConcreteMaterials(baseInput());
    const total =
      r.outputs.cement.massKg +
      r.outputs.fineAggregate.massKg +
      r.outputs.coarseAggregate.massKg;
    expect(total).toBeGreaterThan(2200);
    expect(total).toBeLessThan(2500);
  });
});

describe("scaling and configurability", () => {
  it("scales linearly with volume (6 m³ slab, Class 20)", () => {
    const r = calculateConcreteMaterials(baseInput({ volumeM3: 6 }));
    expect(r.outputs.cement.massKg).toBeCloseTo(1900.8, 1);
    expect(r.outputs.cement.bagsExact).toBeCloseTo(38.016, 3);
    expect(r.outputs.cement.bagsToBuy).toBe(39);
    expect(r.outputs.fineAggregate.tonnes).toBeCloseTo(4.224, 3);
    expect(r.outputs.coarseAggregate.tonnes).toBeCloseTo(7.92, 3);
  });

  it("custom ratio 1:2:4 reproduces Class 20 exactly", () => {
    const std = calculateConcreteMaterials(baseInput());
    const custom = calculateConcreteMaterials(
      baseInput({
        mixSelection: "custom",
        customCement: 1,
        customFine: 2,
        customCoarse: 4,
      }),
    );
    expect(custom.outputs.cement.massKg).toBeCloseTo(std.outputs.cement.massKg, 10);
    expect(custom.outputs.fineAggregate.massKg).toBeCloseTo(
      std.outputs.fineAggregate.massKg,
      10,
    );
    expect(custom.outputs.coarseAggregate.massKg).toBeCloseTo(
      std.outputs.coarseAggregate.massKg,
      10,
    );
  });

  it("halving bag mass doubles the exact bag count", () => {
    const r50 = calculateConcreteMaterials(baseInput());
    const r25 = calculateConcreteMaterials(baseInput({ bagSizeKg: 25 }));
    expect(r25.outputs.cement.bagsExact).toBeCloseTo(
      r50.outputs.cement.bagsExact * 2,
      10,
    );
  });

  it("density overrides propagate to masses but not volumes", () => {
    const r = calculateConcreteMaterials(
      baseInput({ fineAggDensityKgM3: 1700, coarseAggDensityKgM3: 1450 }),
    );
    expect(r.outputs.fineAggregate.volumeM3).toBeCloseTo(0.44, 4);
    expect(r.outputs.fineAggregate.massKg).toBeCloseTo(0.44 * 1700, 1);
    expect(r.outputs.coarseAggregate.massKg).toBeCloseTo(0.88 * 1450, 1);
  });

  it("bulking factor override propagates everywhere", () => {
    const r = calculateConcreteMaterials(baseInput({ bulkingFactor: 1.57 }));
    expect(r.outputs.dryVolumeM3).toBeCloseTo(1.57, 10);
    expect(r.outputs.cement.massKg).toBeCloseTo((1.57 / 7) * 1440, 2);
  });
});

describe("sanity warnings", () => {
  function warningMessages(r: ConcreteMaterialsResult): string {
    return r.warnings.map((w) => w.message).join(" | ");
  }

  it("flags large pours", () => {
    const r = calculateConcreteMaterials(baseInput({ volumeM3: 80 }));
    expect(warningMessages(r)).toContain("large pour");
  });

  it("flags very small volumes", () => {
    const r = calculateConcreteMaterials(baseInput({ volumeM3: 0.01 }));
    expect(warningMessages(r)).toContain("very small volume");
  });

  it("flags unusual bulking factors as caution", () => {
    const r = calculateConcreteMaterials(baseInput({ bulkingFactor: 1.2 }));
    const w = r.warnings.find((x) => x.message.includes("Bulking factor"));
    expect(w).toBeDefined();
    expect(w?.level).toBe("caution");
  });

  it("flags sand-heavier-than-ballast custom mixes", () => {
    const r = calculateConcreteMaterials(
      baseInput({
        mixSelection: "custom",
        customCement: 1,
        customFine: 4,
        customCoarse: 2,
      }),
    );
    expect(warningMessages(r)).toContain("more sand than ballast");
  });

  it("normalises and notes ratios where cement part ≠ 1", () => {
    const r = calculateConcreteMaterials(
      baseInput({
        mixSelection: "custom",
        customCement: 2,
        customFine: 4,
        customCoarse: 8,
      }),
    );
    // 2:4:8 must compute identically to 1:2:4 …
    expect(r.outputs.cement.massKg).toBeCloseTo(316.8, 2);
    // … and tell the user how it was read.
    expect(warningMessages(r)).toContain("1 : 2 : 4");
  });

  it("produces no warnings for a typical everyday input", () => {
    const r = calculateConcreteMaterials(baseInput({ volumeM3: 6 }));
    expect(r.warnings).toEqual([]);
  });
});

describe("engine guards (defence in depth below the schema)", () => {
  it("rejects zero and negative volumes", () => {
    expect(() => calculateConcreteMaterials(baseInput({ volumeM3: 0 }))).toThrow();
    expect(() => calculateConcreteMaterials(baseInput({ volumeM3: -3 }))).toThrow();
  });

  it("rejects bulking factors below 1", () => {
    expect(() =>
      calculateConcreteMaterials(baseInput({ bulkingFactor: 0.9 })),
    ).toThrow();
  });

  it("rejects custom selection with missing parts", () => {
    expect(() =>
      calculateConcreteMaterials(baseInput({ mixSelection: "custom" })),
    ).toThrow();
  });
});

describe("input schema — form-string coercion and human messages", () => {
  it("parses raw form strings into numbers", () => {
    const parsed = concreteMaterialsInputSchema.parse({
      volumeM3: "6",
      mixSelection: "class20",
      bagSizeKg: "50",
      bulkingFactor: "1.54",
      cementDensityKgM3: "1440",
      fineAggDensityKgM3: "1600",
      coarseAggDensityKgM3: "1500",
    });
    expect(parsed.volumeM3).toBe(6);
    expect(parsed.bulkingFactor).toBe(1.54);
  });

  it("rejects an empty volume with a message that says what to do", () => {
    const res = concreteMaterialsInputSchema.safeParse({
      volumeM3: "",
      mixSelection: "class20",
      bagSizeKg: "50",
      bulkingFactor: "1.54",
      cementDensityKgM3: "1440",
      fineAggDensityKgM3: "1600",
      coarseAggDensityKgM3: "1500",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const msg = res.error.issues.map((i) => i.message).join(" | ");
      expect(msg).toContain("concrete volume");
      expect(msg).toContain("greater than zero");
    }
  });

  it("rejects non-numeric text with a human message, not 'invalid input'", () => {
    const res = concreteMaterialsInputSchema.safeParse({
      volumeM3: "about six",
      mixSelection: "class20",
      bagSizeKg: "50",
      bulkingFactor: "1.54",
      cementDensityKgM3: "1440",
      fineAggDensityKgM3: "1600",
      coarseAggDensityKgM3: "1500",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toContain("digits and a decimal point");
    }
  });

  it("requires custom ratio parts when Custom is selected", () => {
    const res = concreteMaterialsInputSchema.safeParse({
      volumeM3: "6",
      mixSelection: "custom",
      bagSizeKg: "50",
      bulkingFactor: "1.54",
      cementDensityKgM3: "1440",
      fineAggDensityKgM3: "1600",
      coarseAggDensityKgM3: "1500",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const paths = res.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("customCement");
      expect(paths).toContain("customFine");
      expect(paths).toContain("customCoarse");
    }
  });

  it("rejects implausible densities with a units hint", () => {
    const res = concreteMaterialsInputSchema.safeParse({
      volumeM3: "6",
      mixSelection: "class20",
      bagSizeKg: "50",
      bulkingFactor: "1.54",
      cementDensityKgM3: "1.44", // classic t/m³ vs kg/m³ slip
      fineAggDensityKgM3: "1600",
      coarseAggDensityKgM3: "1500",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0]?.message).toContain("kg/m³, not t/m³");
    }
  });

  it("applies defaults when advanced fields are omitted", () => {
    const parsed = concreteMaterialsInputSchema.parse({
      volumeM3: "6",
      mixSelection: "class20",
    });
    expect(parsed.bagSizeKg).toBe(50);
    expect(parsed.bulkingFactor).toBe(1.54);
    expect(parsed.cementDensityKgM3).toBe(1440);
  });
});
