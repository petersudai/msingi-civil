import { AlertTriangle, Info } from "lucide-react";
import type { CalcResultBase } from "@/lib/calculations/types";
import { cn } from "@/lib/utils";
import { PreliminaryStamp } from "./preliminary-stamp";

/**
 * The results sheet, the signature surface of the product. It renders any
 * engine's `CalcResultBase` the way a hand calc sheet reads: title block,
 * headline quantities, numbered working, assumptions, and the standards
 * basis. The PDF export mirrors this layout.
 */
export function CalcSheet({
  result,
  toolName,
  subtitle,
  actions,
}: {
  result: CalcResultBase;
  toolName: string;
  /** e.g. "Class 20 (1:2:4) · 6 m³". */
  subtitle?: string;
  /** Export / save buttons, rendered in the sheet header. */
  actions?: React.ReactNode;
}) {
  const headline = result.quantities.filter((q) => q.emphasis);
  const detail = result.quantities.filter((q) => !q.emphasis);

  return (
    <section
      aria-label="Calculation results"
      className="overflow-hidden rounded-lg border-2 border-foreground/80 bg-card"
    >
      {/* Title block */}
      <header className="border-b-2 border-foreground/80 px-4 py-3 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Calculation sheet
            </p>
            <h2 className="mt-0.5 font-heading text-xl font-bold leading-tight">
              {toolName}
            </h2>
            {subtitle ? (
              <p className="nums mt-0.5 text-[13px] text-muted-foreground">
                {subtitle}
              </p>
            ) : null}
          </div>
          <PreliminaryStamp compact />
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Method: {result.methodology}
        </p>
        {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
      </header>

      {/* Headline quantities */}
      <div className="grid grid-cols-1 divide-y border-b sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {headline.map((q) => (
          <div key={q.label} className="px-4 py-4 md:px-5">
            <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
              {q.label}
            </p>
            <p className="nums mt-1 text-3xl font-semibold leading-none">
              {q.value}
              <span className="ml-1.5 text-sm font-normal text-muted-foreground">
                {q.unit}
              </span>
            </p>
            {q.note ? (
              <p className="mt-1.5 text-[11.5px] leading-snug text-muted-foreground">
                {q.note}
              </p>
            ) : null}
          </div>
        ))}
      </div>

      {/* Warnings */}
      {result.warnings.length > 0 ? (
        <div className="space-y-2 border-b px-4 py-3 md:px-5">
          {result.warnings.map((w) => (
            <div
              key={w.message}
              role={w.level === "caution" ? "alert" : "status"}
              className={cn(
                "flex items-start gap-2.5 rounded-md px-3 py-2.5 text-[13px] leading-snug",
                w.level === "caution"
                  ? "bg-warn-bg text-warn"
                  : "bg-notice-bg text-notice",
              )}
            >
              {w.level === "caution" ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              ) : (
                <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              )}
              {w.message}
            </div>
          ))}
        </div>
      ) : null}

      {/* Detail quantities */}
      {detail.length > 0 ? (
        <dl className="border-b px-4 py-3 md:px-5">
          {detail.map((q) => (
            <div
              key={q.label}
              className="flex items-baseline justify-between gap-4 py-1.5"
            >
              <dt className="text-[13px] text-muted-foreground">{q.label}</dt>
              <dd className="nums text-[13px] font-medium">
                {q.value} <span className="font-normal text-muted-foreground">{q.unit}</span>
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {/* Working: every number, shown in full */}
      <section aria-label="Working" className="border-b px-4 py-4 md:px-5">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Working
        </h3>
        <ol className="mt-3 space-y-3.5">
          {result.steps.map((step, i) => (
            <li key={step.title} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
              <span className="nums pt-0.5 text-[12px] text-muted-foreground">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <p className="text-[13px] font-semibold">{step.title}</p>
                <p className="nums mt-0.5 text-[12.5px] text-muted-foreground">
                  {step.formula}
                </p>
                <p className="nums text-[12.5px]">
                  {step.substitution}{" "}
                  <span className="font-semibold">= {step.result}</span>
                </p>
                {step.note ? (
                  <p className="mt-0.5 text-[12px] italic text-muted-foreground">
                    {step.note}
                  </p>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Assumptions */}
      <section aria-label="Assumptions" className="border-b px-4 py-4 md:px-5">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Assumptions
        </h3>
        <dl className="mt-2.5 space-y-2">
          {result.assumptions.map((a) => (
            <div key={a.label} className="grid grid-cols-1 gap-x-4 sm:grid-cols-[1fr_auto]">
              <div className="flex items-baseline justify-between gap-4 sm:contents">
                <dt className="text-[13px] text-muted-foreground">{a.label}</dt>
                <dd className="nums text-[13px] font-medium sm:order-2 sm:text-right">
                  {a.value}
                </dd>
              </div>
              {a.source ? (
                <p className="text-[11.5px] text-muted-foreground/80 sm:order-3 sm:col-span-2">
                  {a.source}
                </p>
              ) : null}
            </div>
          ))}
        </dl>
      </section>

      {/* Basis */}
      <section aria-label="Basis and references" className="px-4 py-4 md:px-5">
        <h3 className="text-[12px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Basis
        </h3>
        <ul className="mt-2.5 space-y-2">
          {result.basis.map((b) => (
            <li key={b.label} className="text-[13px] leading-snug">
              <span className="font-semibold">{b.label}.</span>{" "}
              {b.note ? <span className="text-muted-foreground">{b.note}</span> : null}
            </li>
          ))}
        </ul>
        <p className="mt-4 border-t pt-3 text-[11.5px] leading-snug text-muted-foreground">
          Preliminary estimation aid only, not a design document. Verify all
          results with a licensed engineer before construction.
        </p>
      </section>
    </section>
  );
}
