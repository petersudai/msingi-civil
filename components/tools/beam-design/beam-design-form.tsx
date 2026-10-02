"use client";

import { ArrowRight, RectangleHorizontal } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import { AdvancedSection } from "@/components/tool/advanced-section";
import { CalcSheet } from "@/components/tool/calc-sheet";
import { ExportPdfButton } from "@/components/tool/export-pdf-button";
import { HowItWorks } from "@/components/tool/how-it-works";
import { NumberField } from "@/components/tool/number-field";
import { OptionChips } from "@/components/tool/option-chips";
import { SaveCalcButton } from "@/components/tool/save-calc-button";
import { SelectField } from "@/components/tool/select-field";
import { DiameterField } from "@/components/tool/diameter-field";
import { Button } from "@/components/ui/button";
import { calculateBeamDesign } from "@/lib/calculations/beam-design/calculate";
import { BEAM_CODES, getBeamCode } from "@/lib/calculations/beam-design/codes";
import {
  LINK_LEG_OPTIONS,
  LINK_STEEL_GRADES_MPA,
  MAIN_STEEL_GRADES_MPA,
  SUPPORT_LABELS,
  type CodeId,
  type LoadMode,
  type SupportCondition,
} from "@/lib/calculations/beam-design/constants";
import {
  beamDesignDefaults,
  beamDesignInputSchema,
  codeDefaultsForForm,
  parseBeamDesignInput,
  type BeamDesignFormValues,
} from "@/lib/calculations/beam-design/schema";
import { formatTrimmed } from "@/lib/calculations/format";
import { STANDARD_BAR_DIAMETERS_MM } from "@/lib/calculations/reinforcement";
import { parseResolver } from "@/lib/forms/parse-resolver";
import type { CalcSheetData } from "@/lib/pdf/types";
import { useHandoff } from "@/lib/store/handoff";
import type { ReportMeta } from "@/lib/store/report-meta";
import { useSavedCalculations } from "@/lib/store/saved-calculations";
import type { z } from "zod";

type FormOutput = z.output<typeof beamDesignInputSchema>;

const TOOL_SLUG = "beam-design";
const TOOL_NAME = "RC beam check";

const CODE_DETAIL: Record<CodeId, string> = {
  ec2: "EN 1992-1-1",
  bs8110: "BS 8110-1, withdrawn in UK",
};

export function BeamDesignForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedId = searchParams.get("saved");
  const savedItems = useSavedCalculations((s) => s.items);
  const loadedSavedId = useRef<string | null>(null);
  const setRebarHandoff = useHandoff((s) => s.setRebar);

  const form = useForm<BeamDesignFormValues, unknown, FormOutput>({
    resolver: parseResolver(parseBeamDesignInput),
    defaultValues: beamDesignDefaults,
    mode: "onTouched",
  });

  // Reopen a saved calculation: /tools/beam-design?saved=<id>
  useEffect(() => {
    if (!savedId || loadedSavedId.current === savedId) return;
    const record = savedItems.find((i) => i.id === savedId && i.toolSlug === TOOL_SLUG);
    if (record) {
      loadedSavedId.current = savedId;
      form.reset({ ...beamDesignDefaults, ...record.inputs });
      toast.success(`Loaded “${record.title}”`);
    }
  }, [savedId, savedItems, form]);

  // Live calculation: recompute whenever the current values parse cleanly.
  const values = form.watch();
  const live = useMemo(() => {
    const parsed = parseBeamDesignInput(values);
    if (!parsed.success) return null;
    try {
      return { input: parsed.data, result: calculateBeamDesign(parsed.data) };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- watch() returns a fresh object per render; stringify keeps recompute cheap and correct
  }, [JSON.stringify(values)]);

  const codeId = (form.watch("code") || beamDesignDefaults.code) as CodeId;
  const loadMode = form.watch("loadMode") as LoadMode;
  const selfWeight = form.watch("selfWeight");
  const support = form.watch("support") as SupportCondition | undefined;
  const code = getBeamCode(codeId);

  function changeCode(next: CodeId) {
    if (next === codeId) return;
    // Grades, factors and densities differ between codes: switch them as a
    // set so the form never holds a mixed state, and say so.
    const defaults = codeDefaultsForForm(next);
    for (const [key, value] of Object.entries(defaults)) {
      form.setValue(key as keyof BeamDesignFormValues, value, { shouldValidate: false });
    }
    form.setValue("code", next, { shouldValidate: true });
    toast.info(
      `Switched to ${getBeamCode(next).shortName}. Material grades and load factors were reset to its defaults.`,
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
      filename: `msingi-beam-check-${today.toISOString().slice(0, 10)}.pdf`,
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
  const canHandOff = Boolean(outputs?.tension && outputs.links);

  function continueToRebar() {
    if (!live || !outputs?.tension || !outputs.links) return;
    const { input } = live;
    setRebarHandoff({
      memberType: "beam",
      numberOfMembers: "1",
      coverMm: String(input.coverMm),
      memberLengthM: String(input.spanM),
      widthMm: String(input.bMm),
      depthMm: String(input.hMm),
      mainBarDiameterMm: String(input.mainBarDiameterMm),
      // Compression bars are the same size as the tension bars in this tool,
      // and both run the full length, so they all belong in the schedule.
      mainBarCount: String(outputs.tension.count + (outputs.compression?.count ?? 0)),
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
              options={BEAM_CODES.map((c) => ({
                value: c.id,
                label: c.shortName,
                detail: CODE_DETAIL[c.id],
              }))}
              hint={
                codeId === "ec2"
                  ? "Kenya has adopted the Eurocodes. The Kenya National Annex values are not applied here, so confirm the parameters for your project."
                  : "BS 8110 is withdrawn in the UK but still used on older projects and in some Kenyan practice. Check your project specification."
              }
            />
          </section>

          <fieldset className="min-w-0 space-y-3 border-t pt-4">
            <legend className="sr-only">Loading</legend>
            <h2 className="font-heading text-sm font-bold">Span and loading</h2>
            <OptionChips
              label="How are the loads given?"
              columnsClassName="grid-cols-2"
              value={loadMode}
              onChange={(v) => form.setValue("loadMode", v, { shouldValidate: true })}
              options={[
                { value: "udl" as LoadMode, label: "Span and UDL", detail: "I'll work out M and V" },
                { value: "direct" as LoadMode, label: "M and V known", detail: "from my analysis" },
              ]}
            />
            <NumberField
              name="spanM"
              label={loadMode === "udl" ? "Span" : "Beam span (for the report)"}
              unit="m"
              placeholder="e.g. 5"
              hint={
                loadMode === "udl"
                  ? "Effective span. Shear is taken at the support centreline."
                  : "Used for the span to depth warning and the rebar hand-off; M and V are entered below."
              }
            />
            {loadMode === "udl" ? (
              <>
                <OptionChips
                  label="Support condition"
                  columnsClassName="grid-cols-2"
                  value={support}
                  onChange={(v) => form.setValue("support", v, { shouldValidate: true })}
                  options={(Object.keys(SUPPORT_LABELS) as SupportCondition[]).map((s) => ({
                    value: s,
                    label: SUPPORT_LABELS[s],
                    detail: s === "simple" ? "M = wL²/8" : "M = wL²/2",
                  }))}
                />
                <OptionChips
                  label="Beam self-weight"
                  columnsClassName="grid-cols-2"
                  value={selfWeight}
                  onChange={(v) => form.setValue("selfWeight", v, { shouldValidate: true })}
                  options={[
                    { value: "yes", label: "Add it", detail: "from b × h" },
                    { value: "no", label: "Already included" },
                  ]}
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <NumberField name="deadKnm" label="Dead load" unit="kN/m" placeholder="12" />
                  <NumberField name="liveKnm" label="Imposed load" unit="kN/m" placeholder="8" />
                </div>
                <p className="text-[12.5px] leading-snug text-muted-foreground">
                  Characteristic (unfactored) line loads on the beam, excluding self-weight if you
                  chose to add it. Factors are applied for you: {code.loadCombinationLabel}.
                </p>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2.5">
                <NumberField name="momentKnm" label="Design moment, M" unit="kNm" placeholder="150" />
                <NumberField name="shearKn" label="Design shear, V" unit="kN" placeholder="100" />
              </div>
            )}
            {loadMode === "direct" ? (
              <p className="text-[12.5px] leading-snug text-muted-foreground">
                Enter ultimate (factored) values at the critical sections.
              </p>
            ) : null}
          </fieldset>

          <fieldset className="min-w-0 space-y-3 border-t pt-4">
            <legend className="sr-only">Section</legend>
            <h2 className="font-heading text-sm font-bold">Section and bars</h2>
            <div className="grid grid-cols-2 gap-2.5">
              <NumberField name="bMm" label="Width, b" unit="mm" placeholder="250" />
              <NumberField name="hMm" label="Overall depth, h" unit="mm" placeholder="500" />
            </div>
            <NumberField
              name="coverMm"
              label="Cover to links"
              unit="mm"
              hint="Clear cover to the outside of the links. Check exposure class and fire rating."
            />
            <div className="grid grid-cols-2 gap-2.5">
              <DiameterField
                name="mainBarDiameterMm"
                label="Main bar size"
                diameters={STANDARD_BAR_DIAMETERS_MM}
              />
              <DiameterField
                name="linkDiameterMm"
                label="Link size"
                diameters={STANDARD_BAR_DIAMETERS_MM}
              />
            </div>
            <SelectField
              name="linkLegs"
              label="Link legs"
              options={LINK_LEG_OPTIONS.map((n) => ({
                value: String(n),
                label: `${n} legs${n === 2 ? " (standard link)" : ""}`,
              }))}
            />
          </fieldset>

          <fieldset className="min-w-0 space-y-3 border-t pt-4">
            <legend className="sr-only">Materials</legend>
            <h2 className="font-heading text-sm font-bold">Materials</h2>
            <SelectField
              name="concreteStrengthMpa"
              label={`Concrete grade (${code.strengthSymbol})`}
              options={code.concreteGrades.map((g) => ({
                value: String(g.value),
                label: g.label,
              }))}
            />
            <div className="grid grid-cols-2 gap-2.5">
              <SelectField
                name="fyMpa"
                label="Main steel, fy"
                options={MAIN_STEEL_GRADES_MPA.map((n) => ({
                  value: String(n),
                  label: `${n} N/mm²`,
                }))}
              />
              <SelectField
                name="fyvMpa"
                label="Link steel, fyv"
                options={LINK_STEEL_GRADES_MPA.map((n) => ({
                  value: String(n),
                  label: `${n} N/mm²`,
                }))}
              />
            </div>
          </fieldset>

          <AdvancedSection
            subtitle={
              code.usesNationalParameters
                ? "Load factors, unit weight, alpha_cc, partial factors"
                : "Load factors and concrete unit weight"
            }
          >
            {loadMode === "udl" ? (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <NumberField name="gammaG" label="Permanent load factor" />
                  <NumberField name="gammaQ" label="Imposed load factor" />
                </div>
                <NumberField name="densityKnM3" label="Concrete unit weight" unit="kN/m³" />
              </>
            ) : (
              <p className="text-[12.5px] text-muted-foreground">
                Load factors and unit weight apply when loads are worked out from span and UDL.
              </p>
            )}
            {code.usesNationalParameters ? (
              <>
                <NumberField
                  name="alphaCc"
                  label="alpha_cc (long-term strength factor)"
                  hint="EN 1992-1-1 recommends 1.0; many national annexes use 0.85. Defaulted to 0.85 here, so confirm against the annex for your project."
                />
                <div className="grid grid-cols-2 gap-2.5">
                  <NumberField name="gammaC" label="Concrete factor, gamma_c" />
                  <NumberField name="gammaS" label="Steel factor, gamma_s" />
                </div>
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
              {canHandOff ? (
                <div className="rounded-lg border bg-card p-4">
                  <p className="text-sm font-semibold">Next: weigh and schedule this steel</p>
                  <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
                    Opens the rebar takeoff with this beam&apos;s section, bars and links already
                    filled in. The clear span is taken as the beam span; adjust it there if needed.
                  </p>
                  <Button
                    className="mt-3 h-12 w-full justify-between sm:w-auto"
                    onClick={continueToRebar}
                  >
                    Continue to rebar takeoff
                    <ArrowRight className="size-4" aria-hidden="true" />
                  </Button>
                </div>
              ) : null}
            </>
          ) : (
            <EmptyState onExample={() => form.reset(beamDesignDefaults)} />
          )}
          <HowItWorks
            summary="You give the beam's span and loads (or the design moment and shear you already have) and its section. It factors the loads, finds the bending moment and shear, then works out the tension steel the section needs. If the concrete alone can't resist that moment with a single layer of tension steel, it adds compression steel and says so. It then checks shear against the concrete's own capacity and the section's upper limit, and designs links where the concrete isn't enough. Every step is shown with the code clause it comes from."
            points={[
              "Eurocode 2 and BS 8110 are both built in. Switching the code resets grades and factors to that code's defaults, and the sheet states which code every number comes from.",
              "Checks are demand against capacity. A section that fails the shear limit or needs more than 4% steel is flagged as not adequate: make it bigger, don't add steel.",
              "Bars are chosen from the size you pick, in a single layer, at least two per face. Link spacing is rounded down to a buildable 25 mm step and capped at the code maximum.",
              "Covered: rectangular sections, flexure (singly and doubly reinforced) and shear. Not covered: deflection, crack width, anchorage and curtailment, torsion, flanged beams and moment redistribution.",
              "This is a preliminary check to support a design, not a substitute for a full design by a registered engineer.",
            ]}
          />
          <Link
            href="/tools/rebar-takeoff"
            className="flex min-h-11 items-center px-1 text-[13px] font-semibold underline underline-offset-2"
          >
            Already have the bar schedule? Go straight to rebar takeoff
          </Link>
        </div>
      </div>
    </FormProvider>
  );
}

function EmptyState({ onExample }: { onExample: () => void }) {
  return (
    <div className="bg-calc-grid flex flex-col items-start rounded-lg border border-dashed bg-card px-5 py-8">
      <RectangleHorizontal className="size-6 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 font-heading text-lg font-bold">Complete the beam details</h2>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
        Fix any highlighted fields and the steel, shear links and checks appear here with the full
        working.
      </p>
      <Button
        variant="outline"
        className="mt-4 h-auto min-h-12 whitespace-normal py-2 text-left"
        onClick={onExample}
      >
        Reset to the example: 5 m beam, 250 × 500, Eurocode 2
      </Button>
    </div>
  );
}

/** Human title for the sheet and save record, e.g. "EC2 · 250 × 500 · 5 m". */
function subtitleFor(input: FormOutput): string {
  return `${getBeamCode(input.code).shortName} · ${formatTrimmed(input.bMm, 0)} × ${formatTrimmed(input.hMm, 0)} mm · ${formatTrimmed(input.spanM, 2)} m`;
}

function inputsSummaryFor(input: FormOutput): Array<{ label: string; value: string }> {
  const code = getBeamCode(input.code);
  const grade = code.concreteGrades.find((g) => g.value === input.concreteStrengthMpa);
  const rows = [
    { label: "Design code", value: code.name },
    { label: "Span", value: `${formatTrimmed(input.spanM, 3)} m` },
  ];
  if (input.loadMode === "udl") {
    rows.push(
      { label: "Support", value: SUPPORT_LABELS[input.support ?? "simple"] },
      { label: "Dead load (characteristic)", value: `${formatTrimmed(input.deadKnm ?? 0, 2)} kN/m` },
      { label: "Imposed load (characteristic)", value: `${formatTrimmed(input.liveKnm ?? 0, 2)} kN/m` },
      { label: "Self-weight", value: input.selfWeight === "yes" ? "Added from section" : "Already included" },
    );
  } else {
    rows.push(
      { label: "Design moment", value: `${formatTrimmed(input.momentKnm ?? 0, 2)} kNm` },
      { label: "Design shear", value: `${formatTrimmed(input.shearKn ?? 0, 2)} kN` },
    );
  }
  rows.push(
    { label: "Section (b × h)", value: `${formatTrimmed(input.bMm, 0)} × ${formatTrimmed(input.hMm, 0)} mm` },
    { label: "Cover to links", value: `${formatTrimmed(input.coverMm, 0)} mm` },
    { label: "Main bars / links", value: `Ø${input.mainBarDiameterMm} / Ø${input.linkDiameterMm}, ${input.linkLegs} legs` },
    { label: "Concrete", value: grade?.label ?? String(input.concreteStrengthMpa) },
    { label: "Steel (main / links)", value: `${input.fyMpa} / ${input.fyvMpa} N/mm²` },
  );
  return rows;
}

/** Current form values as plain strings for the saved-calculation record. */
function toFormStrings(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(beamDesignDefaults)) {
    const v = values[key];
    if (v !== undefined && v !== null) out[key] = String(v);
  }
  return out;
}
