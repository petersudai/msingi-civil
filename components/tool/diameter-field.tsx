"use client";

import { useId } from "react";
import { useFormContext } from "react-hook-form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";

/**
 * A bar diameter picker constrained to standard commercial sizes (real bars
 * only come in fixed diameters, so this is a dropdown, not free text) — used
 * anywhere a tool needs a reinforcement bar size.
 */
export function DiameterField({
  name,
  label,
  diameters,
  hint,
}: {
  name: string;
  label: string;
  /** Standard sizes to offer, mm. */
  diameters: readonly number[];
  hint?: string;
}) {
  const id = useId();
  const {
    setValue,
    watch,
    formState: { errors },
  } = useFormContext();
  const value = watch(name) as string | undefined;
  const error = errors[name]?.message;
  const errorText = typeof error === "string" ? error : undefined;

  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-[13px] font-semibold">
        {label}
      </Label>
      <Select
        value={value ?? ""}
        onValueChange={(v) => setValue(name, v, { shouldValidate: true, shouldDirty: true })}
      >
        <SelectTrigger
          id={id}
          className={
            "w-full bg-card text-base data-[size=default]:h-12 " +
            (errorText ? "border-destructive" : "")
          }
        >
          <SelectValue placeholder="Choose a size" />
        </SelectTrigger>
        <SelectContent>
          {diameters.map((d) => (
            <SelectItem key={d} value={String(d)} className="nums text-base">
              Ø{d} mm
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {errorText ? (
        <p className="text-[12.5px] leading-snug text-destructive">{errorText}</p>
      ) : hint ? (
        <p className="text-[12.5px] leading-snug text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
