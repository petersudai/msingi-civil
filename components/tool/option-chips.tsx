"use client";

import { useId, useRef } from "react";
import { cn } from "@/lib/utils";

export interface ChipOption<T extends string> {
  value: T;
  label: string;
  /** Small secondary line, e.g. a mix ratio. */
  detail?: string;
}

/**
 * A single-choice selector rendered as large tappable chips: the standard way
 * every tool offers a short list of options (mix class, member type, design
 * code). Implements the radio group pattern: one tab stop, arrow keys move
 * and select, 56px minimum target for gloved or one-thumb use.
 */
export function OptionChips<T extends string>({
  label,
  options,
  value,
  onChange,
  columnsClassName = "grid-cols-2 sm:grid-cols-3",
  hint,
}: {
  label: string;
  options: readonly ChipOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  /** Tailwind grid-cols classes for the chip grid. */
  columnsClassName?: string;
  hint?: React.ReactNode;
}) {
  const labelId = useId();
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((o) => o.value === value);

  function move(from: number, delta: number) {
    const next = (from + delta + options.length) % options.length;
    onChange(options[next].value);
    refs.current[next]?.focus();
  }

  return (
    <div>
      <p id={labelId} className="mb-1.5 text-[13px] font-semibold">
        {label}
      </p>
      <div
        role="radiogroup"
        aria-labelledby={labelId}
        className={cn("grid gap-2", columnsClassName)}
      >
        {options.map((option, i) => {
          const selected = option.value === value;
          const tabbable = selected || (selectedIndex === -1 && i === 0);
          return (
            <button
              key={option.value}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={tabbable ? 0 : -1}
              onClick={() => onChange(option.value)}
              onKeyDown={(e) => {
                if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                  e.preventDefault();
                  move(i, 1);
                } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                  e.preventDefault();
                  move(i, -1);
                }
              }}
              className={cn(
                "flex min-h-14 flex-col justify-center rounded-md border px-3 py-2 text-left text-sm font-semibold leading-tight transition-colors",
                option.detail ? "items-start" : "items-center text-center",
                selected
                  ? "border-primary bg-accent text-accent-foreground ring-1 ring-primary"
                  : "bg-card hover:bg-muted",
              )}
            >
              <span>{option.label}</span>
              {option.detail ? (
                <span className="nums text-[12px] font-normal text-muted-foreground">
                  {option.detail}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      {hint ? (
        <p className="mt-2 text-[12.5px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
