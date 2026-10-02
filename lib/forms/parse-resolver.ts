import type { FieldErrors, FieldValues, Resolver } from "react-hook-form";

/** The slice of Zod's `safeParse` result that the resolver needs. */
export type ParseResult<T> =
  | { success: true; data: T }
  | {
      success: false;
      error: { issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }> };
    };

/**
 * Builds a react-hook-form resolver from a plain parse function. Same
 * validation the engine uses, but the tool decides which fields are in play,
 * so errors only ever surface for inputs the user can actually see.
 */
export function parseResolver<TIn extends FieldValues, TOut>(
  parse: (values: Partial<TIn>) => ParseResult<TOut>,
): Resolver<TIn, unknown, TOut> {
  return (values) => {
    const result = parse(values);
    if (result.success) return { values: result.data, errors: {} };

    const errors: Record<string, { type: string; message: string }> = {};
    for (const issue of result.error.issues) {
      const key = String(issue.path[0] ?? "root");
      if (!(key in errors)) errors[key] = { type: "validation", message: issue.message };
    }
    return { values: {}, errors: errors as FieldErrors<TIn> };
  };
}
