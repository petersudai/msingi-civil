"use client";

import { useId } from "react";
import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * The standard numeric input for every tool: big touch target, decimal
 * keypad on phones, the unit always visible inside the field, inline help
 * text, and validation messages rendered right where the finger is.
 */
export function NumberField({
  name,
  label,
  unit,
  hint,
  placeholder,
  className,
}: {
  /** react-hook-form field name. */
  name: string;
  label: string;
  /** Unit shown pinned inside the field, e.g. "m³". */
  unit?: string;
  /** What this input means / a sensible example, shown under the field. */
  hint?: string;
  placeholder?: string;
  className?: string;
}) {
  const id = useId();
  const {
    register,
    formState: { errors },
  } = useFormContext();
  const error = errors[name]?.message;
  const errorText = typeof error === "string" ? error : undefined;
  const describedBy = errorText ? `${id}-error` : hint ? `${id}-hint` : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          placeholder={placeholder}
          aria-invalid={errorText ? true : undefined}
          aria-describedby={describedBy}
          className={cn(
            "nums h-12 bg-card text-base",
            unit ? "pr-14" : undefined,
            errorText ? "border-destructive focus-visible:ring-destructive/30" : undefined,
          )}
          {...register(name)}
        />
        {unit ? (
          <span
            aria-hidden="true"
            className="nums pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm text-muted-foreground"
          >
            {unit}
          </span>
        ) : null}
      </div>
      {errorText ? (
        <p id={`${id}-error`} className="text-[12.5px] leading-snug text-destructive">
          {errorText}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-[12.5px] leading-snug text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
