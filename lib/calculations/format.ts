/**
 * Number formatting shared by all calculation engines.
 *
 * Engines produce display-ready strings for working steps and quantities, so
 * formatting must live with the engines (framework-free), not in the UI.
 * Locale is deliberately fixed: calculation sheets use "1,234.56" style
 * regardless of device locale, so a printed sheet reads the same everywhere.
 */

/**
 * Format a number with thousands separators and a fixed number of decimals.
 * `formatNumber(1234.5, 2)` → "1,234.50"
 */
export function formatNumber(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(decimals);
  const [whole, frac] = fixed.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac !== undefined ? `${sign}${grouped}.${frac}` : `${sign}${grouped}`;
}

/**
 * Format a number trimming pointless trailing zeros, up to `maxDecimals`.
 * `formatTrimmed(1.5, 3)` → "1.5", `formatTrimmed(2, 3)` → "2"
 */
export function formatTrimmed(value: number, maxDecimals: number): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(maxDecimals);
  const trimmed = fixed.includes(".")
    ? fixed.replace(/0+$/, "").replace(/\.$/, "")
    : fixed;
  const [whole, frac] = trimmed.split(".");
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return frac !== undefined ? `${sign}${grouped}.${frac}` : `${sign}${grouped}`;
}
