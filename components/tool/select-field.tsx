"use client";

import { useId } from "react";
import { useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
}

/**
 * A labelled dropdown wired to the surrounding form: for fields that must
 * come from a fixed list (bar sizes, concrete grades, steel grades). Same
 * label, hint and error layout as `NumberField`, so forms read as one system.
 */
export function SelectField({
  name,
  label,
  options,
  hint,
  placeholder = "Choose one",
}: {
  name: string;
  label: string;
  options: readonly SelectOption[];
  hint?: string;
  placeholder?: string;
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
          aria-invalid={errorText ? true : undefined}
          className={cn(
            "w-full bg-card text-base data-[size=default]:h-12",
            errorText && "border-destructive",
          )}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value} className="nums min-h-11 text-base">
              {o.label}
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
