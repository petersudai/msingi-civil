import { describe, expect, it } from "vitest";
import {
  concreteMaterialsDefaults,
  parseConcreteMaterialsInput,
} from "@/lib/calculations/concrete-materials/schema";
import {
  parseRebarTakeoffInput,
  rebarTakeoffDefaults,
} from "@/lib/calculations/rebar-takeoff/schema";

/**
 * A stale invalid value left in a field the user can no longer see must never
 * block the result. These guard the inactive-field stripping in each tool.
 */
describe("hidden fields never block a result", () => {
  it("concrete: junk in the custom ratio is ignored on a standard mix", () => {
    const parsed = parseConcreteMaterialsInput({
      ...concreteMaterialsDefaults,
      volumeM3: "6",
      mixSelection: "class20",
      customCement: "abc",
      customFine: "-3",
      customCoarse: "",
    });
    expect(parsed.success).toBe(true);
  });

  it("concrete: the custom ratio is still enforced when Custom is selected", () => {
    const parsed = parseConcreteMaterialsInput({
      ...concreteMaterialsDefaults,
      volumeM3: "6",
      mixSelection: "custom",
      customCement: "abc",
    });
    expect(parsed.success).toBe(false);
  });

  it("rebar: junk in slab fields is ignored for a beam", () => {
    const parsed = parseRebarTakeoffInput({
      ...rebarTakeoffDefaults,
      memberType: "beam",
      panelLengthM: "abc",
      distBarDiameterMm: "13",
    });
    expect(parsed.success).toBe(true);
  });

  it("rebar: junk in beam fields is ignored for a slab", () => {
    const parsed = parseRebarTakeoffInput({
      ...rebarTakeoffDefaults,
      memberType: "slab",
      memberLengthM: "abc",
      linkSpacingMm: "-1",
    });
    expect(parsed.success).toBe(true);
  });

  it("rebar: beam fields are still enforced for a beam", () => {
    const parsed = parseRebarTakeoffInput({
      ...rebarTakeoffDefaults,
      memberType: "beam",
      memberLengthM: "abc",
    });
    expect(parsed.success).toBe(false);
  });
});
