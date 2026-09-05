"use client";

import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { Grid3x3 } from "lucide-react";
import { useSearchParams } from "next/navigation";
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
import { SaveCalcButton } from "@/components/tool/save-calc-button";
import { Button } from "@/components/ui/button";
import { calculateRebarTakeoff } from "@/lib/calculations/rebar-takeoff/calculate";
import {
  LINK_LABELS,
  MEMBER_TYPE_LABELS,
  STANDARD_BAR_DIAMETERS_MM,
} from "@/lib/calculations/rebar-takeoff/constants";
import {
  rebarTakeoffDefaults,
  rebarTakeoffInputSchema,
  type MemberTypeSelection,
} from "@/lib/calculations/rebar-takeoff/schema";
import { formatTrimmed } from "@/lib/calculations/format";
import type { CalcSheetData } from "@/lib/pdf/types";
import type { ReportMeta } from "@/lib/store/report-meta";
import { useSavedCalculations } from "@/lib/store/saved-calculations";
import { cn } from "@/lib/utils";

type FormInput = z.input<typeof rebarTakeoffInputSchema>;
type FormOutput = z.output<typeof rebarTakeoffInputSchema>;

const TOOL_SLUG = "rebar-takeoff";
const TOOL_NAME = "Rebar takeoff";
const MEMBER_TYPES: MemberTypeSelection[] = ["beam", "column", "slab"];

export function RebarTakeoffForm() {
  const searchParams = useSearchParams();
  const savedId = searchParams.get("saved");
  const savedItems = useSavedCalculations((s) => s.items);
  const loadedSavedId = useRef<string | null>(null);

  const form = useForm<FormInput, unknown, FormOutput>({
    resolver: standardSchemaResolver(rebarTakeoffInputSchema),
    defaultValues: rebarTakeoffDefaults,
    mode: "onTouched",
  });

  // Reopen a saved calculation: /tools/rebar-takeoff?saved=<id>
  useEffect(() => {
    if (!savedId || loadedSavedId.current === savedId) return;
    const record = savedItems.find(
      (i) => i.id === savedId && i.toolSlug === TOOL_SLUG,
    );
    if (record) {
      loadedSavedId.current = savedId;
      form.reset({ ...rebarTakeoffDefaults, ...record.inputs });
      toast.success(`Loaded “${record.title}”`);
    }
  }, [savedId, savedItems, form]);

  // Live calculation: recompute whenever the current values parse cleanly.
  const values = form.watch();
  const live = useMemo(() => {
    const parsed = rebarTakeoffInputSchema.safeParse(values);
    if (!parsed.success) return null;
    try {
      return {
        input: parsed.data,
        result: calculateRebarTakeoff(parsed.data),
      };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- watch() returns a fresh object per render; stringify keeps recompute cheap and correct
  }, [JSON.stringify(values)]);

  const memberType = form.watch("memberType") as MemberTypeSelection;
  const isLinear = memberType === "beam" || memberType === "column";
  const linkLabel = isLinear ? LINK_LABELS[memberType] : "";

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
      filename: `msingi-rebar-takeoff-${today.toISOString().slice(0, 10)}.pdf`,
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

  return (
    <FormProvider {...form}>
      <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        {/* Inputs */}
        <form
          noValidate
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4 rounded-lg border bg-card p-4 md:p-5"
          aria-label="Calculation inputs"
        >
          {/* Member type selector */}
          <fieldset>
            <legend className="mb-1.5 text-[13px] font-semibold">Member type</legend>
            <div role="radiogroup" aria-label="Member type" className="grid grid-cols-3 gap-2">
              {MEMBER_TYPES.map((type) => (
                <MemberChip
                  key={type}
                  selected={memberType === type}
                  onSelect={() =>
                    form.setValue("memberType", type, { shouldValidate: true })
                  }
                  title={MEMBER_TYPE_LABELS[type]}
                />
              ))}
            </div>
          </fieldset>

          <NumberField
            name="numberOfMembers"
            label={isLinear ? "Number of identical members" : "Number of identical panels/layers"}
            placeholder="1"
            hint={
              isLinear
                ? `How many identical ${memberType}s this schedule covers, e.g. 6.`
                : "e.g. 2 for a top-and-bottom mesh, or one per repeated panel."
            }
          />

          <NumberField
            name="coverMm"
            label="Concrete cover"
            unit="mm"
            hint="Clear distance from the surface to the reinforcement. Typical: 25 mm for beams/slabs, 40 mm for exposed columns."
          />

          {isLinear ? (
            <>
              <NumberField
                name="memberLengthM"
                label={memberType === "beam" ? "Clear span" : "Clear height"}
                unit="m"
                placeholder="e.g. 4"
              />
              <div className="grid grid-cols-2 gap-2.5">
                <NumberField name="widthMm" label="Section width, b" unit="mm" placeholder="230" />
                <NumberField name="depthMm" label="Section depth, D" unit="mm" placeholder="450" />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <DiameterField
                  name="mainBarDiameterMm"
                  label="Main bar diameter"
                  diameters={STANDARD_BAR_DIAMETERS_MM}
                />
                <NumberField
                  name="mainBarCount"
                  label="Number of main bars"
                  placeholder="4"
                />
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <DiameterField
                  name="linkDiameterMm"
                  label={`${linkLabel} diameter`}
                  diameters={STANDARD_BAR_DIAMETERS_MM}
                />
                <NumberField
                  name="linkSpacingMm"
                  label={`${linkLabel} spacing`}
                  unit="mm"
                  placeholder="150"
                />
              </div>
              <AdvancedSection subtitle="Hook allowance, extra length for laps/anchorage">
                <NumberField
                  name="hookAllowanceMm"
                  label={`${linkLabel} hook allowance`}
                  unit="mm"
                  hint="Approximate extra length for the link's two hooks. Confirm against your detailing standard."
                />
                <NumberField
                  name="extraLengthMm"
                  label="Extra length per main bar"
                  unit="mm"
                  hint="For laps or anchorage beyond the clear span. 0 by default."
                />
              </AdvancedSection>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2.5">
                <NumberField name="panelLengthM" label="Panel length" unit="m" placeholder="6" />
                <NumberField name="panelWidthM" label="Panel width" unit="m" placeholder="4" />
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="mb-2.5 text-[12.5px] text-muted-foreground">
                  Main bars run parallel to the length, spaced across the width.
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <DiameterField
                    name="mainBarDiameterMm"
                    label="Main bar diameter"
                    diameters={STANDARD_BAR_DIAMETERS_MM}
                  />
                  <NumberField
                    name="mainBarSpacingMm"
                    label="Main bar spacing"
                    unit="mm"
                    placeholder="200"
                  />
                </div>
              </div>
              <div className="rounded-md border bg-muted/40 p-3">
                <p className="mb-2.5 text-[12.5px] text-muted-foreground">
                  Distribution bars run parallel to the width, spaced across the length.
                </p>
                <div className="grid grid-cols-2 gap-2.5">
                  <DiameterField
                    name="distBarDiameterMm"
                    label="Distribution bar diameter"
                    diameters={STANDARD_BAR_DIAMETERS_MM}
                  />
                  <NumberField
                    name="distBarSpacingMm"
                    label="Distribution bar spacing"
                    unit="mm"
                    placeholder="250"
                  />
                </div>
              </div>
            </>
          )}
        </form>

        {/* Results */}
        <div className="space-y-4 lg:sticky lg:top-20" aria-live="polite">
          {live ? (
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
          ) : (
            <EmptyState
              onExample={() => {
                form.reset(rebarTakeoffDefaults);
              }}
            />
          )}
          <HowItWorks
            summary="You describe the member (or panel) and its bar schedule; it works out how much steel that takes and lays out a bar bending schedule. Bar mass comes straight from the diameter and steel density (7850 kg/m³): that's physics, the same across every code. For a beam or column, stirrup/link spacing gives the count (one bar bent around the section at each spacing along the length), and the cut length is the section's inside-face perimeter plus an allowance for the two hooks. For a slab, two bar mats are laid out: main bars spanning the length, distribution bars spanning the width, each counted from its spacing across the other dimension."
            points={[
              "Main bar length is the clear span or height plus any extra length you add for laps or anchorage; it does not include development length, which depends on the design code (not yet fixed for this toolkit).",
              "Hook allowance is an approximation, not a specific national bending-schedule standard. Confirm exact bend and hook deductions against your detailing standard for a final schedule.",
              "\"Number of identical members\" multiplies the whole schedule, matching how a real bar bending schedule covers several identical beams, columns or panels at once.",
              "Bar diameters are limited to standard commercial sizes so the mass calculation always matches a real bar you can order.",
            ]}
          />
        </div>
      </div>
    </FormProvider>
  );
}

function MemberChip({
  selected,
  onSelect,
  title,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-14 items-center justify-center rounded-md border px-3 py-2 text-center text-sm font-semibold transition-colors",
        selected
          ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary"
          : "bg-card hover:bg-muted",
      )}
    >
      {title}
    </button>
  );
}

function EmptyState({ onExample }: { onExample: () => void }) {
  return (
    <div className="bg-calc-grid flex flex-col items-start rounded-lg border border-dashed bg-card px-5 py-8">
      <Grid3x3 className="size-6 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 font-heading text-lg font-bold">
        Fill in the member and bar schedule
      </h2>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
        Pick a member type, then its dimensions and bars. You&apos;ll get total
        steel weight and a bar bending schedule, ready to export.
      </p>
      <Button variant="outline" className="mt-4 h-12" onClick={onExample}>
        Try an example: 4 m beam, 4T16 main, T8 links
      </Button>
    </div>
  );
}

/** Human title for the sheet/save record, e.g. "Beam · 4.0 m · 4 members". */
function subtitleFor(input: FormOutput): string {
  if (input.memberType === "slab") {
    return `Slab panel · ${formatTrimmed(input.panelLengthM ?? 0, 2)} × ${formatTrimmed(input.panelWidthM ?? 0, 2)} m · ${input.numberOfMembers} layer(s)`;
  }
  const label = MEMBER_TYPE_LABELS[input.memberType];
  return `${label} · ${formatTrimmed(input.memberLengthM ?? 0, 2)} m · ${input.numberOfMembers} member(s)`;
}

function inputsSummaryFor(
  input: FormOutput,
): Array<{ label: string; value: string }> {
  const common = [
    { label: "Member type", value: MEMBER_TYPE_LABELS[input.memberType] },
    { label: "Number of identical members", value: String(input.numberOfMembers) },
    { label: "Concrete cover", value: `${formatTrimmed(input.coverMm, 0)} mm` },
  ];

  if (input.memberType === "slab") {
    return [
      ...common,
      { label: "Panel length", value: `${formatTrimmed(input.panelLengthM ?? 0, 3)} m` },
      { label: "Panel width", value: `${formatTrimmed(input.panelWidthM ?? 0, 3)} m` },
      {
        label: "Main bars",
        value: `Ø${input.mainBarDiameterMm} mm @ ${formatTrimmed(input.mainBarSpacingMm ?? 0, 0)} mm`,
      },
      {
        label: "Distribution bars",
        value: `Ø${input.distBarDiameterMm} mm @ ${formatTrimmed(input.distBarSpacingMm ?? 0, 0)} mm`,
      },
    ];
  }

  const linkLabel = LINK_LABELS[input.memberType as "beam" | "column"];
  return [
    ...common,
    {
      label: input.memberType === "beam" ? "Clear span" : "Clear height",
      value: `${formatTrimmed(input.memberLengthM ?? 0, 3)} m`,
    },
    {
      label: "Section (b × D)",
      value: `${formatTrimmed(input.widthMm ?? 0, 0)} × ${formatTrimmed(input.depthMm ?? 0, 0)} mm`,
    },
    {
      label: "Main bars",
      value: `${input.mainBarCount} No. Ø${input.mainBarDiameterMm} mm`,
    },
    {
      label: linkLabel,
      value: `Ø${input.linkDiameterMm} mm @ ${formatTrimmed(input.linkSpacingMm ?? 0, 0)} mm`,
    },
    { label: `${linkLabel} hook allowance`, value: `${formatTrimmed(input.hookAllowanceMm, 0)} mm` },
    { label: "Extra length per main bar", value: `${formatTrimmed(input.extraLengthMm, 0)} mm` },
  ];
}

/** Current form values as plain strings for the saved-calculation record. */
function toFormStrings(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(rebarTakeoffDefaults)) {
    const v = values[key];
    if (v !== undefined && v !== null) out[key] = String(v);
  }
  return out;
}
