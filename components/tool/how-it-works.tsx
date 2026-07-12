"use client";

import { ChevronDown } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * The per-tool explainer: what the method is, in plain language a
 * non-software person can follow without leaving the page.
 */
export function HowItWorks({
  summary,
  points,
}: {
  /** One-paragraph plain-language description of the method. */
  summary: string;
  /** Short bullet points: what to know, what to watch out for. */
  points: string[];
}) {
  return (
    <Collapsible className="rounded-lg border bg-card">
      <CollapsibleTrigger className="group flex min-h-12 w-full items-center justify-between gap-3 px-4 py-3 text-left">
        <span className="text-sm font-semibold">How this works</span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border-t px-4 py-4">
          <p className="text-sm leading-relaxed text-foreground/85">{summary}</p>
          <ul className="mt-3 space-y-2">
            {points.map((point) => (
              <li key={point} className="flex gap-2.5 text-sm leading-relaxed text-foreground/85">
                <span
                  aria-hidden="true"
                  className="mt-[9px] block h-px w-3 shrink-0 bg-primary"
                />
                {point}
              </li>
            ))}
          </ul>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
