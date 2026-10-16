import type { CodeId } from "../constants";
import { bs8110Column } from "./bs8110";
import { ec2Column } from "./ec2";
import type { ColumnCode } from "./types";

/**
 * Registry of column design codes. To add a family, implement `ColumnCode` in
 * its own file and add it here; nothing else in the engine or the UI changes.
 */
export const COLUMN_CODES: readonly ColumnCode[] = [ec2Column, bs8110Column];

export const DEFAULT_COLUMN_CODE_ID: CodeId = "ec2";

export function getColumnCode(id: CodeId): ColumnCode {
  const code = COLUMN_CODES.find((c) => c.id === id);
  // COLUMN_CODES covers every CodeId, so this cannot happen at runtime.
  if (!code) throw new Error(`Unknown design code: ${id}`);
  return code;
}

export type { ColumnCode } from "./types";
