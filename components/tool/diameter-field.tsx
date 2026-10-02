"use client";

import { SelectField } from "./select-field";

/**
 * A bar diameter picker constrained to standard commercial sizes. Real bars
 * only come in fixed diameters, so this is a dropdown, not free text.
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
  return (
    <SelectField
      name={name}
      label={label}
      hint={hint}
      placeholder="Choose a size"
      options={diameters.map((d) => ({ value: String(d), label: `Ø${d} mm` }))}
    />
  );
}
