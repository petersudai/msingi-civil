/**
 * Named, sourced constants for the concrete materials calculator.
 *
 * Every default here is overridable through the tool's "advanced" inputs;
 * these values are the sensible East African site defaults, not hard rules.
 */

/**
 * Dry-to-wet volume factor ("bulking factor").
 *
 * Compacted wet concrete occupies less volume than the loose dry materials
 * batched to make it, because water fills voids and the mix consolidates.
 * Standard estimating practice takes dry volume = 1.52–1.57 × wet volume;
 * 1.54 is the value used almost universally in East African and Indian
 * quantity-surveying references.
 */
export const DEFAULT_BULKING_FACTOR = 1.54;

/** Plausible hard limits for the bulking factor input. */
export const BULKING_FACTOR_MIN = 1.0;
export const BULKING_FACTOR_MAX = 2.0;
/** Outside this band the value is unusual enough to warrant a caution flag. */
export const BULKING_FACTOR_TYPICAL_MIN = 1.5;
export const BULKING_FACTOR_TYPICAL_MAX = 1.6;

/**
 * Loose bulk density of ordinary Portland cement, kg/m³.
 * The near-universal estimating value: a 50 kg bag ≈ 0.0347 m³ (≈ 34.7 L).
 */
export const DEFAULT_CEMENT_DENSITY_KG_M3 = 1440;

/**
 * Loose bulk density of fine aggregate (river sand), kg/m³.
 * Typical dry-loose river sand runs 1,500–1,700 kg/m³; 1,600 is the common
 * takeoff value in Kenyan practice.
 */
export const DEFAULT_FINE_AGG_DENSITY_KG_M3 = 1600;

/**
 * Loose bulk density of coarse aggregate (machine-crushed ballast), kg/m³.
 * Typical crushed stone runs 1,450–1,550 kg/m³ loose; 1,500 is the common
 * takeoff value.
 */
export const DEFAULT_COARSE_AGG_DENSITY_KG_M3 = 1500;

/** Plausible hard limits for any material bulk density input, kg/m³. */
export const DENSITY_MIN_KG_M3 = 500;
export const DENSITY_MAX_KG_M3 = 3000;

/** Standard cement bag mass in Kenya (Bamburi, Simba, Savannah, etc.). */
export const DEFAULT_CEMENT_BAG_KG = 50;
export const CEMENT_BAG_MIN_KG = 10;
export const CEMENT_BAG_MAX_KG = 100;

/** Hard limit for a single calculation's wet volume, m³. */
export const VOLUME_MAX_M3 = 10_000;
/** Above this, flag that ready-mix / batching plant is worth pricing. */
export const VOLUME_LARGE_POUR_M3 = 50;
/** Below this, flag that the quantities round to almost nothing. */
export const VOLUME_TINY_M3 = 0.05;

/** A volumetric mix ratio, cement : fine aggregate : coarse aggregate. */
export interface MixRatio {
  cement: number;
  fine: number;
  coarse: number;
}

export type MixClassId = "class15" | "class20" | "class25" | "class30";

export interface MixClass {
  id: MixClassId;
  /** Display name as used on Kenyan sites and drawings. */
  name: string;
  /** Characteristic cube strength implied by the class, N/mm² (informative). */
  strengthMpa: number;
  ratio: MixRatio;
  /** What this class is typically used for — shown as inline guidance. */
  typicalUse: string;
}

/**
 * Nominal volumetric mixes as used in Kenyan / East African practice
 * (Ministry of Works standard specifications; BS 8110-era nominal mixes).
 * The class number is the 28-day characteristic cube strength in N/mm².
 */
export const MIX_CLASSES: readonly MixClass[] = [
  {
    id: "class15",
    name: "Class 15",
    strengthMpa: 15,
    ratio: { cement: 1, fine: 3, coarse: 6 },
    typicalUse: "Blinding, mass fill, strip footing bases",
  },
  {
    id: "class20",
    name: "Class 20",
    strengthMpa: 20,
    ratio: { cement: 1, fine: 2, coarse: 4 },
    typicalUse: "Slabs, foundations, general RC work",
  },
  {
    id: "class25",
    name: "Class 25",
    strengthMpa: 25,
    ratio: { cement: 1, fine: 1.5, coarse: 3 },
    typicalUse: "Beams, columns, suspended slabs",
  },
  {
    id: "class30",
    name: "Class 30",
    strengthMpa: 30,
    ratio: { cement: 1, fine: 1, coarse: 2 },
    typicalUse: "Heavily loaded members, water-retaining work",
  },
] as const;

export function getMixClass(id: MixClassId): MixClass {
  const found = MIX_CLASSES.find((m) => m.id === id);
  // MIX_CLASSES covers every MixClassId, so this cannot happen at runtime.
  if (!found) throw new Error(`Unknown mix class: ${id}`);
  return found;
}
