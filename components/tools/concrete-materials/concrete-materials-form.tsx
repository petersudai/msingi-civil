"use client";

import { PencilRuler } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { toast } from "sonner";
import type { z } from "zod";
import { AdvancedSection } from "@/components/tool/advanced-section";
import { CalcSheet } from "@/components/tool/calc-sheet";
import { ExportPdfButton } from "@/components/tool/export-pdf-button";
import { HowItWorks } from "@/components/tool/how-it-works";
import { NumberField } from "@/components/tool/number-field";
import { OptionChips } from "@/components/tool/option-chips";
import { SaveCalcButton } from "@/components/tool/save-calc-button";
import { Button } from "@/components/ui/button";
import {
  calculateConcreteMaterials,
  ratioLabel,
} from "@/lib/calculations/concrete-materials/calculate";
import {
  getMixClass,
  MIX_CLASSES,
} from "@/lib/calculations/concrete-materials/constants";
import {
  concreteMaterialsDefaults,
  type ConcreteMaterialsFormValues,
  type MixSelection,
  concreteMaterialsInputSchema,
  parseConcreteMaterialsInput,
} from "@/lib/calculations/concrete-materials/schema";
import { formatTrimmed } from "@/lib/calculations/format";
import { parseResolver } from "@/lib/forms/parse-resolver";
import type { CalcSheetData } from "@/lib/pdf/types";
import type { ReportMeta } from "@/lib/store/report-meta";
import { useSavedCalculations } from "@/lib/store/saved-calculations";

type FormValues = ConcreteMaterialsFormValues;
type FormOutput = z.output<typeof concreteMaterialsInputSchema>;

const TOOL_SLUG = "concrete-materials";
const TOOL_NAME = "Concrete materials";

export function ConcreteMaterialsForm() {
  const searchParams = useSearchParams();
  const savedId = searchParams.get("saved");
  const savedItems = useSavedCalculations((s) => s.items);
  const loadedSavedId = useRef<string | null>(null);

  const form = useForm<FormValues, unknown, FormOutput>({
    resolver: parseResolver(parseConcreteMaterialsInput),
    defaultValues: concreteMaterialsDefaults,
    mode: "onTouched",
  });

  // Reopen a saved calculation: /tools/concrete-materials?saved=<id>
  useEffect(() => {
    if (!savedId || loadedSavedId.current === savedId) return;
    const record = savedItems.find(
      (i) => i.id === savedId && i.toolSlug === TOOL_SLUG,
    );
    if (record) {
      loadedSavedId.current = savedId;
      form.reset({ ...concreteMaterialsDefaults, ...record.inputs });
      toast.success(`Loaded “${record.title}”`);
    }
  }, [savedId, savedItems, form]);

  // Live calculation: recompute whenever the current values parse cleanly.
  const values = form.watch();
  const live = useMemo(() => {
    const parsed = parseConcreteMaterialsInput(values);
    if (!parsed.success) return null;
    try {
      return {
        input: parsed.data,
        result: calculateConcreteMaterials(parsed.data),
      };
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- watch() returns a fresh object per render; stringify keeps recompute cheap and correct
  }, [JSON.stringify(values)]);

  const mixSelection = form.watch("mixSelection") as string;
  const selectedClass =
    mixSelection !== "custom" && mixSelection
      ? MIX_CLASSES.find((m) => m.id === mixSelection)
      : undefined;

  const subtitle = live
    ? `${mixLabel(live.input)} · ${formatTrimmed(live.input.volumeM3, 2)} m³ wet volume`
    : undefined;

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
      filename: `msingi-concrete-materials-${today.toISOString().slice(0, 10)}.pdf`,
      inputsSummary: [
        {
          label: "Wet concrete volume",
          value: `${formatTrimmed(live.input.volumeM3, 3)} m³`,
        },
        { label: "Mix", value: mixLabel(live.input) },
        { label: "Cement bag", value: `${formatTrimmed(live.input.bagSizeKg, 1)} kg` },
        {
          label: "Bulking factor",
          value: formatTrimmed(live.input.bulkingFactor, 3),
        },
        {
          label: "Densities (cement / sand / ballast)",
          value: `${live.input.cementDensityKgM3} / ${live.input.fineAggDensityKgM3} / ${live.input.coarseAggDensityKgM3} kg/m³`,
        },
      ],
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
      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-start">
        {/* Inputs */}
        <form
          noValidate
          onSubmit={(e) => e.preventDefault()}
          className="space-y-4 rounded-lg border bg-card p-4 md:p-5"
          aria-label="Calculation inputs"
        >
          <NumberField
            name="volumeM3"
            label="Concrete volume required"
            unit="m³"
            placeholder="e.g. 6"
            hint="Wet, compacted volume: length × width × thickness. A 6 m × 5 m slab at 150 mm is 4.5 m³."
          />

          <OptionChips
            label="Mix class"
            value={mixSelection as MixSelection}
            onChange={(v) => form.setValue("mixSelection", v, { shouldValidate: true })}
            options={[
              ...MIX_CLASSES.map((mix) => ({
                value: mix.id as MixSelection,
                label: mix.name,
                detail: ratioLabel(mix.ratio),
              })),
              { value: "custom" as MixSelection, label: "Custom", detail: "own ratio" },
            ]}
            hint={
              selectedClass
                ? `${selectedClass.name} ≈ ${selectedClass.strengthMpa} N/mm² cube strength. Typical use: ${selectedClass.typicalUse.toLowerCase()}.`
                : undefined
            }
          />

          {mixSelection === "custom" ? (
            <div className="rounded-md border bg-muted/40 p-3">
              <p className="mb-2.5 text-[12.5px] text-muted-foreground">
                Parts by volume, in cement : sand : ballast order, like the
                &ldquo;1&rdquo;, &ldquo;2&rdquo; and &ldquo;4&rdquo; in 1:2:4.
              </p>
              <div className="grid grid-cols-3 gap-2.5">
                <NumberField name="customCement" label="Cement" placeholder="1" />
                <NumberField name="customFine" label="Sand" placeholder="2" />
                <NumberField name="customCoarse" label="Ballast" placeholder="4" />
              </div>
            </div>
          ) : null}

          <AdvancedSection subtitle="Bag size, bulking factor, material densities">
            <NumberField
              name="bagSizeKg"
              label="Cement bag mass"
              unit="kg"
              hint="Standard Kenyan bag is 50 kg."
            />
            <NumberField
              name="bulkingFactor"
              label="Bulking factor (dry ÷ wet volume)"
              hint="Loose materials shrink when mixed and compacted. Standard practice: 1.52–1.57."
            />
            <NumberField
              name="cementDensityKgM3"
              label="Cement bulk density"
              unit="kg/m³"
              hint="Loose OPC ≈ 1,440 kg/m³."
            />
            <NumberField
              name="fineAggDensityKgM3"
              label="Sand bulk density"
              unit="kg/m³"
              hint="Dry-loose river sand ≈ 1,500–1,700 kg/m³."
            />
            <NumberField
              name="coarseAggDensityKgM3"
              label="Ballast bulk density"
              unit="kg/m³"
              hint="Loose crushed stone ≈ 1,450–1,550 kg/m³."
            />
          </AdvancedSection>
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
                    title={`${mixLabel(live.input)} · ${formatTrimmed(live.input.volumeM3, 2)} m³`}
                    inputs={formStrings}
                  />
                </>
              }
            />
          ) : (
            <EmptyState
              onExample={() => {
                form.reset({ ...concreteMaterialsDefaults, volumeM3: "6" });
              }}
            />
          )}
          <HowItWorks
            summary="You say how much compacted concrete you need; it works out the loose materials to order. Loose cement, sand and ballast lose roughly a third of their volume once mixed and compacted, so the tool multiplies your volume by a bulking factor (1.54 by default) to get the dry material volume, splits that between the three materials in your mix ratio, then converts each volume to mass, and cement to bags, using loose bulk densities."
            points={[
              "Mix classes follow Kenyan site practice: Class 20 = 1:2:4, Class 25 = 1:1.5:3, and so on. The class number is the 28-day cube strength in N/mm².",
              "Cement is rounded up to whole bags for purchasing; the exact figure stays on the sheet so you can see the margin.",
              "Quantities exclude wastage, so add 3–5% when ordering.",
              "Every default (densities, bulking factor, bag size) can be overridden under Advanced assumptions, and whatever you use is printed on the sheet.",
            ]}
          />
        </div>
      </div>
    </FormProvider>
  );
}

function EmptyState({ onExample }: { onExample: () => void }) {
  return (
    <div className="bg-calc-grid flex flex-col items-start rounded-lg border border-dashed bg-card px-5 py-8">
      <PencilRuler className="size-6 text-muted-foreground" aria-hidden="true" />
      <h2 className="mt-3 font-heading text-lg font-bold">
        Enter the volume to get quantities
      </h2>
      <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
        Everything else is pre-filled with standard site values. You&apos;ll get
        cement bags, sand and ballast tonnage, with the full working shown, ready
        to export as a calculation sheet.
      </p>
      <Button variant="outline" className="mt-4 h-auto min-h-12 whitespace-normal py-2 text-left" onClick={onExample}>
        Try an example: 6 m³ slab, Class 20
      </Button>
    </div>
  );
}

/** Human mix label, e.g. "Class 20 (1 : 2 : 4)" or "Custom (1 : 2 : 4)". */
function mixLabel(input: FormOutput): string {
  if (input.mixSelection === "custom") {
    return `Custom (${input.customCement} : ${input.customFine} : ${input.customCoarse})`;
  }
  const mix = getMixClass(input.mixSelection);
  return `${mix.name} (${ratioLabel(mix.ratio)})`;
}

/** Current form values as plain strings for the saved-calculation record. */
function toFormStrings(values: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of Object.keys(concreteMaterialsDefaults)) {
    const v = values[key];
    if (v !== undefined && v !== null) out[key] = String(v);
  }
  return out;
}

// Re-exported so the page can type-check saved-record hydration.
export type { ConcreteMaterialsFormValues };
