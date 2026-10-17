"use client";

import { ArrowRight, RectangleVertical } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { AdvancedSection } from "@/components/tool/advanced-section";
import { CalcSheet } from "@/components/tool/calc-sheet";
import { DiameterField } from "@/components/tool/diameter-field";
import { ExportPdfButton } from "@/components/tool/export-pdf-button";
import { HowItWorks } from "@/components/tool/how-it-works";
import { NumberField } from "@/components/tool/number-field";
import { OptionChips } from "@/components/tool/option-chips";
import { SaveCalcButton } from "@/components/tool/save-calc-button";
import { SelectField } from "@/components/tool/select-field";
import { Button } from "@/components/ui/button";
import {
  LINK_STEEL_GRADES_MPA,
  MAIN_STEEL_GRADES_MPA,
} from "@/lib/calculations/beam-design/constants";
import { calculateColumnDesign } from "@/lib/calculations/column-design/calculate";
import { COLUMN_CODES, getColumnCode } from "@/lib/calculations/column-design/codes";
import {
  BARS_PER_FACE_MAX,
  BARS_PER_FACE_MIN,
  END_CONDITION_FACTORS,
  END_CONDITION_LABELS,
  type CodeId,
  type EndCondition,
} from "@/lib/calculations/column-design/constants";
import {
  columnCodeDefaultsForForm,
  columnDesignDefaults,
  columnDesignInputSchema,
  parseColumnDesignInput,
  type ColumnDesignFormValues,
} from "@/lib/calculations/column-design/schema";
import { formatTrimmed } from "@/lib/calculations/format";
import { STANDARD_BAR_DIAMETERS_MM } from "@/lib/calculations/reinforcement";
import { parseResolver } from "@/lib/forms/parse-resolver";
import type { CalcSheetData } from "@/lib/pdf/types";
import { useHandoff } from "@/lib/store/handoff";
import type { ReportMeta } from "@/lib/store/report-meta";
import { useSavedCalculations } from "@/lib/store/saved-calculations";
import { ColumnSectionDiagram, type SectionDiagramInput } from "./section-diagram";

type FormOutput = z.output<typeof columnDesignInputSchema>;

const TOOL_SLUG = "column-design";
const TOOL_NAME = "RC column check";

const CODE_DETAIL: Record<CodeId, string> = {
  ec2: "EN 1992-1-1",
  bs8110: "BS 8110-1, withdrawn in UK",
};

const END_CONDITIONS: EndCondition[] = ["restrained2", "restrained1", "pinned", "custom"];

const COUNT_OPTIONS = Array.from(
  { length: BARS_PER_FACE_MAX - BARS_PER_FACE_MIN + 1 },
  (_, i) => String(BARS_PER_FACE_MIN + i),
);

/** The section as typed, if it's complete enough to draw. Lets the drawing follow every keystroke. */
function diagramInputFrom(values: Partial<ColumnDesignFormValues>): SectionDiagramInput | null {
  const n = (v: string | undefined) => (v === undefined || v.trim() === "" ? NaN : Number(v));
  const d: SectionDiagramInput = {
    bMm: n(values.bMm),
    hMm: n(values.hMm),
    coverMm: n(values.coverMm),
    mainBarDiameterMm: n(values.mainBarDiameterMm),
    linkDiameterMm: n(values.linkDiameterMm),
    barsAcrossB: n(values.barsAcrossB),
    barsAcrossH: n(values.barsAcrossH),
  };
  if (Object.values(d).some((v) => !Number.isFinite(v) || v <= 0)) return null;
  if (d.barsAcrossB < 2 || d.barsAcrossH < 2) return null;
  const dPrime = d.coverMm + d.linkDiameterMm + d.mainBarDiameterMm / 2;
  if (d.bMm - 2 * dPrime <= 0 || d.hMm - 2 * dPrime <= 0) return null;
  return d;
}

export function ColumnDesignForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedId = searchParams.get("saved");
  const savedItems = useSavedCalculations((s) => s.items);
  const loadedSavedId = useRef<string | null>(null);
  const setRebarHandoff = useHandoff((s) => s.setRebar);

  const form = useForm<ColumnDesignFormValues, unknown, FormOutput>({
    resolver: parseResolver(parseColumnDesignInput),
    defaultValues: columnDesignDefaults,
    mode: "onTouched",
  });

  // Reopen a saved calculation: /tools/column-design?saved=<id>
  useEffect(() => {
    if (!savedId || loadedSavedId.current === savedId) return;
    const record = savedItems.find((i) => i.id === savedId && i.toolSlug === TOOL_SLUG);
    if (record) {
      loadedSavedId.current = savedId;
      form.reset({ ...columnDesignDefaults, ...record.inputs });
      toast.success(`Loaded “${record.title}”`);
    }
  }, [savedId, savedItems, form]);

  // Live calculation: recompute whenever the current values parse cleanly.
  const values = form.watch();
  const live = useMemo(() => {
    const parsed = parseColumnDesignInput(values);
    if (!parsed.success) return null;
    try {
      return { input: parsed.data, result: calculateColumnDesign(parsed.data) };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- watch() returns a fresh object per render; stringify keeps recompute cheap and correct
  }, [JSON.stringify(values)]);

  const diagramInput = useMemo(
    () => diagramInputFrom(values),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- same reason as above
    [JSON.stringify(values)],
  );

  const codeId = (form.watch("code") || columnDesignDefaults.code) as CodeId;
  const endCondition = form.watch("endCondition") as EndCondition;
  const code = getColumnCode(codeId);
  const hLabel = Number(form.watch("hMm")) > 0 ? String(form.watch("hMm")) : "";
  const bLabel = Number(form.watch("bMm")) > 0 ? String(form.watch("bMm")) : "";

  function changeCode(next: CodeId) {
    if (next === codeId) return;
    // Grades and factors differ between codes: switch them as a set so the
    // form never holds a mixed state, and say so.
    for (const [key, value] of Object.entries(columnCodeDefaultsForForm(next))) {
      form.setValue(key as keyof ColumnDesignFormValues, value, { shouldValidate: false });
    }
    form.setValue("code", next, { shouldValidate: true });
    toast.info(
      `Switched to ${getColumnCode(next).shortName}. Material grades and factors were reset to its defaults.`,
    );
  }

  const subtitle = live ? subtitleFor(live.input) : undefined;

  const formStrings = useMemo(
    () => toFormStrings(values as Record<string, unknown>),
    [values],
  );

  function buildPdfData(meta: ReportMeta): CalcSheetData {
    if (!live) throw new Error("No result to export yet.");
    const today = new Date();
    return {
      toolName: TOOL_NAME,
      subtitle,
      filename: `msingi-column-check-${today.toISOString().slice(0, 10)}.pdf`,
      inputsSummary: inputsSummaryFor(live.input),
      result: live.result,
      projectName: meta.projectName || undefined,
      preparedBy: meta.preparedBy || undefined,
      generatedAt: today.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    };
  }

  const outputs = live?.result.outputs;

  function continueToRebar() {
    if (!live || !outputs) return;
    const { input } = live;
    setRebarHandoff({
      memberType: "column",
      numberOfMembers: "1",
      coverMm: String(input.coverMm),
      memberLengthM: String(input.heightM),
      widthMm: String(input.bMm),
      depthMm: String(input.hMm),
      mainBarDiameterMm: String(input.mainBarDiameterMm),
      mainBarCount: String(outputs.bars.totalBars),
      linkDiameterMm: String(input.linkDiameterMm),
      linkSpacingMm: String(outputs.links.spacingMm),
    });
    router.push("/tools/rebar-takeoff");
  }

  return (
    <FormProvider {...form}>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        {/* Inputs */}
        <form
          noValidate
          onSubmit={(e) => e.preventDefault()}
          className="space-y-5 rounded-lg border bg-card p-4 md:p-5"
          aria-label="Calculation inputs"
        >
          <section className="space-y-3">
            <OptionChips
              label="Design code"
              columnsClassName="grid-cols-2"
              value={codeId}
              onChange={changeCode}
              options={COLUMN_CODES.map((c) => ({
                value: c.id,
                label: c.shortName,
                detail: CODE_DETAIL[c.id],
              }))}
              hint={
                codeId === "ec2"
                  ? "Kenya has adopted the Eurocodes, but no published Kenya National Annex was found. Parameters follow the UK National Annex instead; confirm them for your project."
                  : "BS 8110 is withdrawn in the UK but still used on older projects and in some Kenyan practice. Check your project specification."
              }
            />
          </section>

          <fieldset className="min-w-0 space-y-3 border-t pt-4">
            <legend className="sr-only">Section and bars</legend>
            <h2 className="font-heading text-sm font-bold">Section and bars</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField name="bMm" label="Width, b" unit="mm" placeholder="300" />
              <NumberField
                name="hMm"
                label="Depth, h"
                unit="mm"
                placeholder="400"
              />
            </div>
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              Both axes are checked, so the order doesn&apos;t matter: h is just the side your
              first pair of moments acts along.
            </p>
            <NumberField
              name="coverMm"
              label="Cover to links"
              unit="mm"
              hint="Clear cover to the outside of the links. Check exposure class and fire rating."
            />
            <DiameterField
              name="mainBarDiameterMm"
              label="Main bar size"
              diameters={STANDARD_BAR_DIAMETERS_MM}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <SelectField
                name="barsAcrossB"
                label="Bars across the width"
                options={COUNT_OPTIONS.map((n) => ({ value: n, label: n }))}
                hint="In each outer row, corners included."
              />
              <SelectField
                name="barsAcrossH"
                label="Bar rows along the depth"
                options={COUNT_OPTIONS.map((n) => ({ value: n, label: n }))}
                hint="Outer rows included. Inner rows get 2 bars."
              />
            </div>
            <DiameterField
              name="linkDiameterMm"
              label="Link size"
              diameters={STANDARD_BAR_DIAMETERS_MM}
            />
            {diagramInput ? <ColumnSectionDiagram input={diagramInput} /> : null}
          </fieldset>

          <fieldset className="min-w-0 space-y-3 border-t pt-4">
            <legend className="sr-only">Height and restraint</legend>
            <h2 className="font-heading text-sm font-bold">Height and restraint</h2>
            <NumberField
              name="heightM"
              label="Column height"
              unit="m"
              placeholder="3.5"
              hint="Clear height between floors or restraints."
            />
            <OptionChips
              label="End conditions (braced frame)"
              value={endCondition}
              onChange={(v) => form.setValue("endCondition", v, { shouldValidate: true })}
              options={END_CONDITIONS.map((e) => ({
                value: e,
                label: END_CONDITION_LABELS[e],
                detail:
                  e === "custom"
                    ? "factor 0.5 to 1.0"
                    : `factor ${formatTrimmed(END_CONDITION_FACTORS[e], 2)}`,
              }))}
              hint="Assumes the frame is braced against sway, with the same restraint about both axes. Fixed means held rigidly by beams or foundations of at least the column's stiffness."
            />
            {endCondition === "custom" ? (
              <NumberField
                name="betaCustom"
                label="Effective length factor"
                placeholder="0.85"
                hint="Effective length = factor × height. Braced columns fall between 0.5 and 1.0."
              />
            ) : null}
          </fieldset>

          <fieldset className="min-w-0 space-y-3 border-t pt-4">
            <legend className="sr-only">Design actions</legend>
            <h2 className="font-heading text-sm font-bold">Design actions (ultimate)</h2>
            <NumberField name="nEdKn" label="Axial load, N" unit="kN" placeholder="1200" />
            <div className="space-y-2.5 rounded-md border bg-muted/40 p-3">
              <p className="text-[13px] font-semibold">
                Moments along h{hLabel ? ` (the ${hLabel} mm side)` : ""}
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <NumberField name="mTopKnm" label="At the top" unit="kNm" placeholder="60" />
                <NumberField name="mBotKnm" label="At the bottom" unit="kNm" placeholder="30" />
              </div>
            </div>
            <div className="space-y-2.5 rounded-md border bg-muted/40 p-3">
              <p className="text-[13px] font-semibold">
                Moments along b{bLabel ? ` (the ${bLabel} mm side)` : ""}, if any
              </p>
              <div className="grid grid-cols-2 gap-2.5">
                <NumberField name="mTopBKnm" label="At the top" unit="kNm" placeholder="0" />
                <NumberField name="mBotBKnm" label="At the bottom" unit="kNm" placeholder="0" />
              </div>
              <p className="text-[12.5px] leading-snug text-muted-foreground">
                Leave at 0 if the column bends about one axis only. That axis is still checked
                for slenderness and the minimum eccentricity.
              </p>
            </div>
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              Factored values from your analysis. Same sign if the column bends in a single curve,
              opposite signs for double curvature. Where both pairs are given, the combined check
              for bending about both axes is made for you.
            </p>
          </fieldset>

          <fieldset className="min-w-0 space-y-3 border-t pt-4">
            <legend className="sr-only">Materials</legend>
            <h2 className="font-heading text-sm font-bold">Materials</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <SelectField
                name="concreteStrengthMpa"
                label={`Concrete (${code.strengthSymbol})`}
                options={code.concreteGrades.map((g) => ({
                  value: String(g.value),
                  label: g.label,
                }))}
              />
              <SelectField
                name="fyMpa"
                label="Main steel, fy"
                options={MAIN_STEEL_GRADES_MPA.map((n) => ({
                  value: String(n),
                  label: `${n} N/mm²`,
                }))}
              />
            </div>
            <SelectField
              name="fyvMpa"
              label="Link steel, fyv"
              options={LINK_STEEL_GRADES_MPA.map((n) => ({
                value: String(n),
                label: `${n} N/mm²`,
              }))}
            />
          </fieldset>

          <AdvancedSection
            subtitle={
              code.usesNationalParameters
                ? "Design shear, alpha_cc, partial factors, creep ratio"
                : "Design shear"
            }
          >
            <p className="text-[12.5px] leading-snug text-muted-foreground">
              Shear is worked out from the end moments by statics. Enter your own value if the
              column also carries a transverse load or sway shear from your frame analysis.
            </p>
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField name="shearHKn" label="Shear along h" unit="kN" placeholder="auto" />
              <NumberField name="shearBKn" label="Shear along b" unit="kN" placeholder="auto" />
            </div>
            {code.usesNationalParameters ? (
              <>
                <NumberField
                  name="alphaCc"
                  label="alpha_cc (long-term strength factor)"
                  hint="EN 1992-1-1 recommends 1.0; the UK National Annex uses 0.85, which is the default here. Override if your project specifies otherwise."
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <NumberField name="gammaC" label="Concrete factor, gamma_c" />
                  <NumberField name="gammaS" label="Steel factor, gamma_s" />
                </div>
                <NumberField
                  name="creepRatio"
                  label="Effective creep ratio, phi_ef"
                  hint="Only affects slender columns. 2.0 is a typical assumption; raise it for heavily sustained load."
                />
              </>
            ) : null}
          </AdvancedSection>
        </form>

        {/* Results */}
        <div className="min-w-0 space-y-4 lg:sticky lg:top-20" aria-live="polite">
          {live ? (
            <>
              <CalcSheet
                result={live.result}
                toolName={TOOL_NAME}
                subtitle={subtitle}
                actions={
                  <>
                    <ExportPdfButton buildData={buildPdfData} />
                    <SaveCalcButton
                      toolSlug={TOOL_SLUG}
                      title={subtitleFor(live.input)}
                      inputs={formStrings}
                    />
                  </>
                }
              />
              <div className="rounded-lg border bg-card p-4">
                <p className="text-sm font-semibold">Next: weigh and schedule this steel</p>
                <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                  Opens the rebar takeoff with this column&apos;s section, bars and links already
                  filled in. The clear height is used as the bar length; add laps and starter bars
                  there if needed.
                </p>
                <Button
                  className="mt-3 h-12 w-full justify-between sm:w-auto"
                  onClick={continueToRebar}
                >
                  Continue to rebar takeoff
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Button>
              </div>
            </>
          ) : (
            <EmptyState onExample={() => form.reset(columnDesignDefaults)} />
          )}
          <HowItWorks
            summary="You give the column's section, bars, height, and the axial load and end moments from your analysis. For each axis it works out how slender the column is. A short column is designed for the larger end moment (or a minimum eccentricity); a slender one gets an extra second-order moment from its own bending. It then builds the section's interaction diagram, which is the capacity for every combination of axial load and moment, using strain compatibility, and checks your design point sits inside it. Where bending acts about both axes, a combined check applies. Shear is checked in both directions and sets the link spacing where it needs to. The steel limits, bar spacing and link rules are checked alongside, each with its clause."
            points={[
              "Eurocode 2 and BS 8110 are both built in. Switching the code resets grades and factors to that code's defaults, and the sheet states which code every number comes from.",
              "Both axes are always checked. A column with no moment about one axis still gets that axis's slenderness and minimum-eccentricity moment, because a slender column can fail on its weak side.",
              "The minimum-eccentricity moment is applied about one axis at a time, never both together, as both codes allow. The combined check uses the real moments for the other axis.",
              "Shear comes from the end moments by statics unless you enter it. Axial compression raises the concrete's shear resistance in both codes. Links resist shear with two legs in each direction, which ignores cross-ties.",
              "The diagram shows how close you are: a point well inside the curve has spare capacity, one outside fails. Utilisation is the highest of the checks, with the governing one named.",
              "Covered: braced rectangular columns, symmetric bars, bending about either or both axes, axial compression, shear. Not covered: sway (unbraced) columns, circular columns and fire. Sway belongs with a whole-frame analysis.",
              "This is a preliminary check to support a design, not a substitute for a full design by a registered engineer.",
            ]}
          />
          <Link
            href="/tools/beam-design"
            className="flex min-h-11 items-center px-1 text-[13px] font-semibold underline underline-offset-2"
          >
            Checking a beam as well? Open the RC beam check
          </Link>
        </div>
      </div>
    </FormProvider>
  );
}

function EmptyState({ onExample }: { onExample: () => void }) {
  return (
    <div className="bg-calc-grid flex flex-col items-start rounded-lg border border-dashed bg-card px-5 py-8">
      <RectangleVertical className="size-6 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 font-heading text-lg font-bold">Complete the column details</h2>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
        Fix any highlighted fields and the interaction diagrams, checks and working appear here.
      </p>
      <Button
        variant="outline"
        className="mt-4 h-auto min-h-12 whitespace-normal py-2 text-left"
        onClick={onExample}
      >
        Reset to the example: 300 × 400 column, 8 bars, Eurocode 2
      </Button>
    </div>
  );
}

/** Human title for the sheet and save record, e.g. "Eurocode 2 · 300 × 400 mm · 8 bars". */
function subtitleFor(input: FormOutput): string {
  const bars = 2 * input.barsAcrossB + 2 * (input.barsAcrossH - 2);
  return `${getColumnCode(input.code).shortName} · ${formatTrimmed(input.bMm, 0)} × ${formatTrimmed(input.hMm, 0)} mm · ${bars} bars`;
}

function inputsSummaryFor(input: FormOutput): Array<{ label: string; value: string }> {
  const code = getColumnCode(input.code);
  const grade = code.concreteGrades.find((g) => g.value === input.concreteStrengthMpa);
  const bars = 2 * input.barsAcrossB + 2 * (input.barsAcrossH - 2);
  const beta =
    input.endCondition === "custom"
      ? (input.betaCustom ?? 1)
      : END_CONDITION_FACTORS[input.endCondition];
  return [
    { label: "Design code", value: code.name },
    { label: "Section (b × h)", value: `${formatTrimmed(input.bMm, 0)} × ${formatTrimmed(input.hMm, 0)} mm` },
    { label: "Cover to links", value: `${formatTrimmed(input.coverMm, 0)} mm` },
    {
      label: "Main bars",
      value: `${bars} No. Ø${input.mainBarDiameterMm} (${input.barsAcrossB} across, ${input.barsAcrossH} rows)`,
    },
    { label: "Links", value: `Ø${input.linkDiameterMm}` },
    { label: "Height", value: `${formatTrimmed(input.heightM, 3)} m` },
    {
      label: "End conditions",
      value: `${END_CONDITION_LABELS[input.endCondition]} (factor ${formatTrimmed(beta, 2)})`,
    },
    { label: "Axial load", value: `${formatTrimmed(input.nEdKn, 1)} kN` },
    {
      label: "End moments along h (top / bottom)",
      value: `${formatTrimmed(input.mTopKnm, 2)} / ${formatTrimmed(input.mBotKnm, 2)} kNm`,
    },
    {
      label: "End moments along b (top / bottom)",
      value: `${formatTrimmed(input.mTopBKnm, 2)} / ${formatTrimmed(input.mBotBKnm, 2)} kNm`,
    },
    {
      label: "Design shear (along h / along b)",
      value: `${input.shearHKn === undefined ? "from end moments" : `${formatTrimmed(input.shearHKn, 1)} kN`} / ${input.shearBKn === undefined ? "from end moments" : `${formatTrimmed(input.shearBKn, 1)} kN`}`,
    },
    { label: "Concrete", value: grade?.label ?? String(input.concreteStrengthMpa) },
    { label: "Steel (main / links)", value: `${input.fyMpa} / ${input.fyvMpa} N/mm²` },
  ];
}

/** Current form values as plain strings for the saved-calculation record. */
function toFormStrings(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(columnDesignDefaults)) {
    const v = values[key];
    if (v !== undefined && v !== null) out[key] = String(v);
  }
  return out;
}
