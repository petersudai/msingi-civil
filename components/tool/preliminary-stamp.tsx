import { cn } from "@/lib/utils";

/**
 * The product's standing disclaimer, styled as the drawing-office stamp every
 * engineer already knows. It renders on every tool page, every results sheet,
 * and every exported PDF: it is part of the product, not fine print.
 */
export function PreliminaryStamp({
  className,
  compact = false,
}: {
  className?: string;
  /** Compact = single-line version for tight spots (results title block). */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <p
        className={cn(
          "inline-block border-2 border-stamp px-2 py-1 font-heading text-[11px] font-bold uppercase leading-tight tracking-[0.12em] text-stamp",
          className,
        )}
      >
        Preliminary - not for construction
      </p>
    );
  }

  return (
    <div
      className={cn(
        "border-2 border-stamp bg-card px-4 py-3",
        className,
      )}
      role="note"
      aria-label="Preliminary design aid notice"
    >
      <p className="font-heading text-sm font-bold uppercase tracking-[0.14em] text-stamp">
        Preliminary - not for construction
      </p>
      <p className="mt-1 text-[13px] leading-snug text-foreground/80">
        This is an estimation and preliminary design aid. Every result must be
        reviewed and signed off by a licensed engineer before use on site.
      </p>
    </div>
  );
}
