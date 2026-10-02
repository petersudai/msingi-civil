import type { CodeId } from "../constants";
import { bs8110 } from "./bs8110";
import { ec2 } from "./ec2";
import type { BeamCode } from "./types";

/**
 * Registry of design codes. To add a family, implement `BeamCode` in its own
 * file and add it here; nothing else in the engine or the UI changes.
 */
export const BEAM_CODES: readonly BeamCode[] = [ec2, bs8110];

export const DEFAULT_CODE_ID: CodeId = "ec2";

export function getBeamCode(id: CodeId): BeamCode {
  const code = BEAM_CODES.find((c) => c.id === id);
  // BEAM_CODES covers every CodeId, so this cannot happen at runtime.
  if (!code) throw new Error(`Unknown design code: ${id}`);
  return code;
}

export type { BeamCode } from "./types";
