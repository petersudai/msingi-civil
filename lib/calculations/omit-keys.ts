/**
 * Omit keys from a values object. Tools use this to drop inputs that belong
 * to a mode the user isn't in (e.g. the custom mix ratio while a standard mix
 * is selected), so a stale invalid value in a hidden field can never silently
 * block the result. Lives with the engines because the engines' parse
 * functions use it; it has no framework dependencies.
 */
export function omitKeys<T extends object>(values: T, keys: readonly string[]): Partial<T> {
  const copy: Partial<T> = { ...values };
  for (const key of keys) delete copy[key as keyof T];
  return copy;
}
