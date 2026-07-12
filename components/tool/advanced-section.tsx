"use client";

import { ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

/**
 * Progressive disclosure for expert overrides (densities, factors,
 * coefficients). Defaults work without ever opening this; a senior engineer
 * can override anything inside.
 */
export function AdvancedSection({
  subtitle,
  children,
}: {
  /** What's inside, e.g. "Bag size, bulking factor, densities". */
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <Collapsible className="rounded-lg border border-dashed">
      <CollapsibleTrigger className="group flex min-h-12 w-full items-center gap-3 px-4 py-3 text-left">
        <SlidersHorizontal className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="flex-1">
          <span className="block text-sm font-semibold">Advanced assumptions</span>
          <span className="block text-[12px] text-muted-foreground">{subtitle}</span>
        </span>
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
          aria-hidden="true"
        />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-4 border-t border-dashed px-4 py-4">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
}
