import type {
  Assumption,
  CalcQuantity,
  CalcResultBase,
  CalcTable,
  CalcWarning,
  SourceReference,
  WorkingStep,
} from "../types";
import { formatNumber, formatTrimmed } from "../format";
import {
  BEAM_LENGTH_TYPICAL_MAX_M,
  COLUMN_LENGTH_TYPICAL_MAX_M,
  COVER_TYPICAL_MIN_MM,
  LINK_LABELS,
  MAIN_BAR_COUNT_TYPICAL_MIN,
  SPACING_TYPICAL_MAX_MM,
  STEEL_DENSITY_KG_M3,
} from "./constants";
import type { RebarTakeoffInput } from "./schema";

/**
 * Reinforcement (rebar) takeoff: total steel length and weight per member,
 * plus a bar bending schedule.
 *
 * Method
 * ------
 * 1. Each bar group (main bars, and links/distribution bars) gets a cut
 *    length from the member geometry.
 * 2. Bar mass per metre comes straight from the diameter and steel density:
 *    unit weight = (π/4) × (dia/1000)² × density. This is pure physics, not
 *    a code choice, and it reproduces the published BS 4449 / IS 1786
 *    nominal mass tables exactly.
 * 3. Total length × unit weight gives the weight per bar group; grouped
 *    counts multiply by the number of identical members in the schedule.
 *
 * Link/stirrup cut length uses the section's inside-face perimeter plus an
 * approximate hook allowance (not a specific national bending-schedule
 * standard's bend/hook deduction table, which varies between BS 8666,
 * IS 2502 and ACI detailing). Main bar length is the clear span/height plus
 * an optional extra length the user adds for laps or anchorage; it does not
 * model development length, which depends on the code basis (see Phase 3).
 */

/** One row of the bar bending schedule, in full precision. */
export interface BarGroupOutput {
  markLabel: string;
  shape: "Straight" | "Link";
  diameterMm: number;
  countPerMember: number;
  totalCount: number;
  lengthEachM: number;
  totalLengthM: number;
  unitWeightKgM: number;
  totalWeightKg: number;
}

export interface RebarTakeoffOutputs {
  groups: BarGroupOutput[];
  totalLengthM: number;
  totalWeightKg: number;
}

export interface RebarTakeoffResult extends CalcResultBase {
  outputs: RebarTakeoffOutputs;
}

/** Bar mass per metre, kg/m, from diameter and steel density. */
export function barUnitWeightKgM(
  diameterMm: number,
  densityKgM3: number = STEEL_DENSITY_KG_M3,
): number {
  const diameterM = diameterMm / 1000;
  return (Math.PI / 4) * diameterM * diameterM * densityKgM3;
}

/**
 * Number of bars across a span at a given spacing: one bar at each end plus
 * however many more fit between them.
 */
export function numberOfBarsFromSpacing(spanMm: number, spacingMm: number): number {
  return Math.floor(spanMm / spacingMm) + 1;
}

function makeGroup(
  markLabel: string,
  shape: "Straight" | "Link",
  diameterMm: number,
  countPerMember: number,
  numberOfMembers: number,
  lengthEachM: number,
): BarGroupOutput {
  const totalCount = countPerMember * numberOfMembers;
  const totalLengthM = totalCount * lengthEachM;
  const unitWeightKgM = barUnitWeightKgM(diameterMm);
  return {
    markLabel,
    shape,
    diameterMm,
    countPerMember,
    totalCount,
    lengthEachM,
    totalLengthM,
    unitWeightKgM,
    totalWeightKg: totalLengthM * unitWeightKgM,
  };
}

export function calculateRebarTakeoff(input: RebarTakeoffInput): RebarTakeoffResult {
  if (input.memberType === "slab") return calculateSlab(input);
  return calculateLinearMember(input);
}

// ---------------------------------------------------------------------------
// Beam / column
// ---------------------------------------------------------------------------

function calculateLinearMember(input: RebarTakeoffInput): RebarTakeoffResult {
  const {
    memberType,
    numberOfMembers,
    coverMm,
    memberLengthM,
    widthMm,
    depthMm,
    mainBarDiameterMm,
    mainBarCount,
    linkDiameterMm,
    linkSpacingMm,
    hookAllowanceMm,
    extraLengthMm,
  } = input;

  // The schema guarantees these for memberType beam/column; the checks keep
  // the engine safe if called directly with an incomplete object.
  if (
    memberLengthM === undefined ||
    widthMm === undefined ||
    depthMm === undefined ||
    mainBarDiameterMm === undefined ||
    mainBarCount === undefined ||
    linkDiameterMm === undefined ||
    linkSpacingMm === undefined
  ) {
    throw new Error(`${memberType} takeoff is missing required fields.`);
  }

  const linkLabel = LINK_LABELS[memberType as "beam" | "column"];

  const mainLengthEachM = memberLengthM + extraLengthMm / 1000;
  const mainGroup = makeGroup(
    "Main bars",
    "Straight",
    mainBarDiameterMm,
    mainBarCount,
    numberOfMembers,
    mainLengthEachM,
  );

  const linkCountPerMember = numberOfBarsFromSpacing(memberLengthM * 1000, linkSpacingMm);
  const linkCutLengthMm =
    2 * (widthMm - 2 * coverMm + (depthMm - 2 * coverMm)) + hookAllowanceMm;
  const linkGroup = makeGroup(
    linkLabel,
    "Link",
    linkDiameterMm,
    linkCountPerMember,
    numberOfMembers,
    linkCutLengthMm / 1000,
  );

  const groups = [mainGroup, linkGroup];
  const outputs: RebarTakeoffOutputs = {
    groups,
    totalLengthM: groups.reduce((sum, g) => sum + g.totalLengthM, 0),
    totalWeightKg: groups.reduce((sum, g) => sum + g.totalWeightKg, 0),
  };

  const memberLabel = memberType === "beam" ? "Beam" : "Column";

  return {
    methodology: `Reinforcement takeoff for a ${memberLabel.toLowerCase()}, from section geometry and bar schedule`,
    outputs,
    quantities: buildQuantities(memberLabel, linkLabel, outputs),
    steps: buildLinearSteps(input, mainGroup, linkGroup, linkLabel),
    tables: [buildTable(outputs)],
    assumptions: buildLinearAssumptions(input, linkLabel),
    warnings: buildLinearWarnings(input, linkGroup),
    basis: LINEAR_BASIS,
  };
}

function buildLinearSteps(
  input: RebarTakeoffInput,
  mainGroup: BarGroupOutput,
  linkGroup: BarGroupOutput,
  linkLabel: string,
): WorkingStep[] {
  const cover = input.coverMm ?? 0;
  const width = input.widthMm ?? 0;
  const depth = input.depthMm ?? 0;
  const hook = input.hookAllowanceMm;

  return [
    {
      title: "Main bar length",
      formula: "L_main = span + extra",
      substitution: `L_main = ${formatTrimmed(input.memberLengthM ?? 0, 3)} m + ${formatNumber(input.extraLengthMm, 0)} mm`,
      result: `${formatNumber(mainGroup.lengthEachM, 3)} m`,
      note: "Extra length covers laps or anchorage you add manually; 0 by default.",
    },
    {
      title: "Main bars, total length and weight",
      formula: "Total = count × members × L_main;  weight = Total × unit weight",
      substitution: `Total = ${mainGroup.countPerMember} × ${input.numberOfMembers} × ${formatNumber(mainGroup.lengthEachM, 3)} m`,
      result: `${formatNumber(mainGroup.totalLengthM, 2)} m, ${formatNumber(mainGroup.totalWeightKg, 2)} kg`,
    },
    {
      title: `${linkLabel} cut length`,
      formula: "L_link = 2 × [(b − 2c) + (D − 2c)] + hook allowance",
      substitution: `L_link = 2 × [(${formatNumber(width, 0)} − ${formatNumber(2 * cover, 0)}) + (${formatNumber(depth, 0)} − ${formatNumber(2 * cover, 0)})] + ${formatNumber(hook, 0)} mm`,
      result: `${formatNumber(linkGroup.lengthEachM * 1000, 0)} mm`,
      note: "Inside-face perimeter of the section plus an approximate hook allowance.",
    },
    {
      title: `${linkLabel}, count from spacing`,
      formula: "No. = floor(span ÷ spacing) + 1",
      substitution: `No. = floor(${formatNumber((input.memberLengthM ?? 0) * 1000, 0)} ⁄ ${formatNumber(input.linkSpacingMm ?? 0, 0)}) + 1`,
      result: `${linkGroup.countPerMember} per member`,
    },
    {
      title: `${linkLabel}, total length and weight`,
      formula: "Total = count × members × L_link;  weight = Total × unit weight",
      substitution: `Total = ${linkGroup.countPerMember} × ${input.numberOfMembers} × ${formatNumber(linkGroup.lengthEachM, 3)} m`,
      result: `${formatNumber(linkGroup.totalLengthM, 2)} m, ${formatNumber(linkGroup.totalWeightKg, 2)} kg`,
    },
  ];
}

function buildLinearAssumptions(input: RebarTakeoffInput, linkLabel: string): Assumption[] {
  return [
    {
      label: "Steel density",
      value: `${formatNumber(STEEL_DENSITY_KG_M3, 0)} kg/m³`,
      source: "Standard for reinforcing steel (BS 4449 / IS 1786 / ASTM A615)",
    },
    {
      label: "Concrete cover",
      value: `${formatNumber(input.coverMm, 0)} mm`,
    },
    {
      label: `${linkLabel} hook allowance`,
      value: `${formatNumber(input.hookAllowanceMm, 0)} mm`,
      source:
        input.hookAllowanceMm === 0
          ? "Excluded by the user"
          : "Approximate; confirm exact bend/hook deductions against your detailing standard",
    },
    {
      label: "Extra length per main bar (laps/anchorage)",
      value: `${formatNumber(input.extraLengthMm, 0)} mm`,
      source:
        input.extraLengthMm === 0
          ? "Not included; add manually if laps or anchorage extend past the clear span"
          : "User-entered allowance",
    },
    {
      label: "Number of identical members",
      value: String(input.numberOfMembers),
    },
    {
      label: `${linkLabel} count from spacing`,
      value: "floor(span ÷ spacing) + 1",
      source: "One bar at each end, standard spacing-to-count convention",
    },
  ];
}

function buildLinearWarnings(
  input: RebarTakeoffInput,
  linkGroup: BarGroupOutput,
): CalcWarning[] {
  const warnings: CalcWarning[] = [];
  const memberLength = input.memberLengthM ?? 0;
  const typicalMax =
    input.memberType === "beam" ? BEAM_LENGTH_TYPICAL_MAX_M : COLUMN_LENGTH_TYPICAL_MAX_M;

  if (memberLength > typicalMax) {
    warnings.push({
      level: "notice",
      message: `${formatTrimmed(memberLength, 2)} m is a long single ${input.memberType}. Check whether this should be split into multiple lengths or lifts.`,
    });
  }
  if ((input.mainBarCount ?? 0) < MAIN_BAR_COUNT_TYPICAL_MIN) {
    warnings.push({
      level: "caution",
      message: `Only ${input.mainBarCount} main bar entered. A single main bar is unusual for a ${input.memberType}; most sections need at least ${MAIN_BAR_COUNT_TYPICAL_MIN}.`,
    });
  }
  if ((input.coverMm ?? 0) < COVER_TYPICAL_MIN_MM) {
    warnings.push({
      level: "caution",
      message: `${formatNumber(input.coverMm, 0)} mm cover is thinner than typical (${COVER_TYPICAL_MIN_MM} mm+). Check against your exposure condition.`,
    });
  }
  if ((input.linkSpacingMm ?? 0) > SPACING_TYPICAL_MAX_MM) {
    warnings.push({
      level: "caution",
      message: `${formatNumber(input.linkSpacingMm ?? 0, 0)} mm link spacing is wider than typical. Check the shear/detailing requirement.`,
    });
  }
  if (input.hookAllowanceMm === 0) {
    warnings.push({
      level: "notice",
      message: `${LINK_LABELS[input.memberType as "beam" | "column"]} hook allowance is 0. Add an allowance under Advanced if your links need standard hooks.`,
    });
  }
  if (linkGroup.lengthEachM <= 0) {
    warnings.push({
      level: "caution",
      message:
        "The link cut length came out to zero or negative. Check the section size, cover and link diameter.",
    });
  }
  return warnings;
}

const LINEAR_BASIS: SourceReference[] = [
  {
    label: "Bar mass",
    note: "Computed from diameter and steel density (7850 kg/m³); matches the published BS 4449 / IS 1786 nominal mass tables.",
  },
  {
    label: "Link/stirrup cut length",
    note: "Inside-face perimeter of the section plus an approximate hook allowance, not a specific national bending-schedule standard. Confirm exact bend and hook deductions against your detailing standard (e.g. BS 8666, IS 2502) for a final schedule.",
  },
  {
    label: "Estimation aid only",
    note: "Main bar length excludes development length, which depends on the design code basis. This is a quantity takeoff, not a structural design check.",
  },
];

// ---------------------------------------------------------------------------
// Slab
// ---------------------------------------------------------------------------

function calculateSlab(input: RebarTakeoffInput): RebarTakeoffResult {
  const {
    numberOfMembers,
    coverMm,
    panelLengthM,
    panelWidthM,
    mainBarDiameterMm,
    mainBarSpacingMm,
    distBarDiameterMm,
    distBarSpacingMm,
  } = input;

  if (
    panelLengthM === undefined ||
    panelWidthM === undefined ||
    mainBarDiameterMm === undefined ||
    mainBarSpacingMm === undefined ||
    distBarDiameterMm === undefined ||
    distBarSpacingMm === undefined
  ) {
    throw new Error("Slab takeoff is missing required fields.");
  }

  const coverM = coverMm / 1000;

  // Main bars run parallel to the length, spaced out across the width.
  const mainCountPerMember = numberOfBarsFromSpacing(panelWidthM * 1000, mainBarSpacingMm);
  const mainGroup = makeGroup(
    "Main bars",
    "Straight",
    mainBarDiameterMm,
    mainCountPerMember,
    numberOfMembers,
    panelLengthM - 2 * coverM,
  );

  // Distribution bars run parallel to the width, spaced out across the length.
  const distCountPerMember = numberOfBarsFromSpacing(panelLengthM * 1000, distBarSpacingMm);
  const distGroup = makeGroup(
    "Distribution bars",
    "Straight",
    distBarDiameterMm,
    distCountPerMember,
    numberOfMembers,
    panelWidthM - 2 * coverM,
  );

  const groups = [mainGroup, distGroup];
  const outputs: RebarTakeoffOutputs = {
    groups,
    totalLengthM: groups.reduce((sum, g) => sum + g.totalLengthM, 0),
    totalWeightKg: groups.reduce((sum, g) => sum + g.totalWeightKg, 0),
  };

  return {
    methodology: "Reinforcement takeoff for a slab panel, from panel geometry and bar spacing",
    outputs,
    quantities: buildQuantities("Slab", "Distribution bars", outputs),
    steps: buildSlabSteps(input, mainGroup, distGroup),
    tables: [buildTable(outputs)],
    assumptions: buildSlabAssumptions(input),
    warnings: buildSlabWarnings(input, mainGroup, distGroup),
    basis: SLAB_BASIS,
  };
}

function buildSlabSteps(
  input: RebarTakeoffInput,
  mainGroup: BarGroupOutput,
  distGroup: BarGroupOutput,
): WorkingStep[] {
  return [
    {
      title: "Main bars, count from spacing",
      formula: "No. = floor(width ÷ spacing) + 1",
      substitution: `No. = floor(${formatNumber((input.panelWidthM ?? 0) * 1000, 0)} ⁄ ${formatNumber(input.mainBarSpacingMm ?? 0, 0)}) + 1`,
      result: `${mainGroup.countPerMember} per panel`,
      note: "Main bars run parallel to the length, spaced out across the width.",
    },
    {
      title: "Main bars, length, total length and weight",
      formula: "L_main = length − 2c;  Total = count × panels × L_main",
      substitution: `L_main = ${formatTrimmed(input.panelLengthM ?? 0, 3)} m − ${formatNumber((input.coverMm ?? 0) * 2, 0)} mm`,
      result: `${formatNumber(mainGroup.lengthEachM, 3)} m each, ${formatNumber(mainGroup.totalLengthM, 2)} m total, ${formatNumber(mainGroup.totalWeightKg, 2)} kg`,
    },
    {
      title: "Distribution bars, count from spacing",
      formula: "No. = floor(length ÷ spacing) + 1",
      substitution: `No. = floor(${formatNumber((input.panelLengthM ?? 0) * 1000, 0)} ⁄ ${formatNumber(input.distBarSpacingMm ?? 0, 0)}) + 1`,
      result: `${distGroup.countPerMember} per panel`,
      note: "Distribution bars run parallel to the width, spaced out across the length.",
    },
    {
      title: "Distribution bars, length, total length and weight",
      formula: "L_dist = width − 2c;  Total = count × panels × L_dist",
      substitution: `L_dist = ${formatTrimmed(input.panelWidthM ?? 0, 3)} m − ${formatNumber((input.coverMm ?? 0) * 2, 0)} mm`,
      result: `${formatNumber(distGroup.lengthEachM, 3)} m each, ${formatNumber(distGroup.totalLengthM, 2)} m total, ${formatNumber(distGroup.totalWeightKg, 2)} kg`,
    },
  ];
}

function buildSlabAssumptions(input: RebarTakeoffInput): Assumption[] {
  return [
    {
      label: "Steel density",
      value: `${formatNumber(STEEL_DENSITY_KG_M3, 0)} kg/m³`,
      source: "Standard for reinforcing steel (BS 4449 / IS 1786 / ASTM A615)",
    },
    {
      label: "Concrete cover",
      value: `${formatNumber(input.coverMm, 0)} mm`,
    },
    {
      label: "Number of identical panels/layers",
      value: String(input.numberOfMembers),
      source: "e.g. 2 for a top-and-bottom mesh, or one per repeated panel",
    },
    {
      label: "Bar count from spacing",
      value: "floor(span ÷ spacing) + 1",
      source: "One bar at each edge, standard spacing-to-count convention",
    },
  ];
}

function buildSlabWarnings(
  input: RebarTakeoffInput,
  mainGroup: BarGroupOutput,
  distGroup: BarGroupOutput,
): CalcWarning[] {
  const warnings: CalcWarning[] = [];
  if ((input.mainBarSpacingMm ?? 0) > SPACING_TYPICAL_MAX_MM) {
    warnings.push({
      level: "caution",
      message: `${formatNumber(input.mainBarSpacingMm ?? 0, 0)} mm main bar spacing is wider than typical for a slab. Check the design requirement.`,
    });
  }
  if ((input.distBarSpacingMm ?? 0) > SPACING_TYPICAL_MAX_MM) {
    warnings.push({
      level: "caution",
      message: `${formatNumber(input.distBarSpacingMm ?? 0, 0)} mm distribution bar spacing is wider than typical for a slab. Check the design requirement.`,
    });
  }
  if (mainGroup.lengthEachM <= 0 || distGroup.lengthEachM <= 0) {
    warnings.push({
      level: "caution",
      message: "The panel is too small for the cover entered. Check the panel dimensions and cover.",
    });
  }
  return warnings;
}

const SLAB_BASIS: SourceReference[] = [
  {
    label: "Bar mass",
    note: "Computed from diameter and steel density (7850 kg/m³); matches the published BS 4449 / IS 1786 nominal mass tables.",
  },
  {
    label: "Bar length",
    note: "Each bar spans the panel dimension it crosses, less cover at both ends. No lap allowance for panels wider than one bar length; add extra bars manually for large panels.",
  },
  {
    label: "Estimation aid only",
    note: "This is a quantity takeoff, not a structural design check. Bar spacing and diameter must still be confirmed by design.",
  },
];

// ---------------------------------------------------------------------------
// Shared: quantities and the bar bending schedule table
// ---------------------------------------------------------------------------

function buildQuantities(
  primaryLabel: string,
  secondaryLabel: string,
  outputs: RebarTakeoffOutputs,
): CalcQuantity[] {
  const [first, second] = outputs.groups;
  return [
    {
      label: "Total steel weight",
      value: formatNumber(outputs.totalWeightKg, 2),
      unit: "kg",
      emphasis: true,
      note: `${formatNumber(outputs.totalLengthM, 1)} m of bar in total`,
    },
    {
      label: first.markLabel,
      value: formatNumber(first.totalWeightKg, 2),
      unit: "kg",
      emphasis: true,
      note: `${first.totalCount} bars × ${formatNumber(first.lengthEachM, 3)} m`,
    },
    {
      label: second.markLabel,
      value: formatNumber(second.totalWeightKg, 2),
      unit: "kg",
      emphasis: true,
      note: `${second.totalCount} bars × ${formatNumber(second.lengthEachM, 3)} m`,
    },
    {
      label: `${primaryLabel} total length`,
      value: formatNumber(outputs.totalLengthM, 1),
      unit: "m",
    },
    {
      label: `${secondaryLabel} unit weight`,
      value: formatTrimmed(second.unitWeightKgM, 3),
      unit: "kg/m",
    },
    {
      label: `${first.markLabel} unit weight`,
      value: formatTrimmed(first.unitWeightKgM, 3),
      unit: "kg/m",
    },
  ];
}

function buildTable(outputs: RebarTakeoffOutputs): CalcTable {
  return {
    title: "Bar bending schedule",
    columns: [
      { key: "mark", label: "Mark", align: "left" },
      { key: "dia", label: "Dia (mm)", align: "right" },
      { key: "shape", label: "Shape", align: "left" },
      { key: "no", label: "No.", align: "right" },
      { key: "lengthEach", label: "Length each (m)", align: "right" },
      { key: "totalLength", label: "Total length (m)", align: "right" },
      { key: "unitWeight", label: "Unit wt (kg/m)", align: "right" },
      { key: "totalWeight", label: "Total wt (kg)", align: "right" },
    ],
    rows: outputs.groups.map((g) => ({
      mark: g.markLabel,
      dia: formatNumber(g.diameterMm, 0),
      shape: g.shape,
      no: String(g.totalCount),
      lengthEach: formatNumber(g.lengthEachM, 3),
      totalLength: formatNumber(g.totalLengthM, 2),
      unitWeight: formatTrimmed(g.unitWeightKgM, 3),
      totalWeight: formatNumber(g.totalWeightKg, 2),
    })),
    totalsRow: {
      mark: "Total",
      dia: "",
      shape: "",
      no: "",
      lengthEach: "",
      totalLength: formatNumber(outputs.totalLengthM, 2),
      unitWeight: "",
      totalWeight: formatNumber(outputs.totalWeightKg, 2),
    },
  };
}
