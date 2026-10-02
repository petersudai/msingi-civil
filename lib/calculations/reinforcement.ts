/**
 * Reinforcement facts shared by every tool that handles steel bars, so the
 * takeoff and the design checks always agree on what a bar is.
 */

/**
 * Standard commercial deformed bar diameters, mm. Matches the sizes stocked
 * by East African steel mills and the BS 4449 / KS range.
 */
export const STANDARD_BAR_DIAMETERS_MM = [6, 8, 10, 12, 16, 20, 25, 32, 40] as const;
export type StandardBarDiameter = (typeof STANDARD_BAR_DIAMETERS_MM)[number];

export function isStandardBarDiameter(d: number): boolean {
  return (STANDARD_BAR_DIAMETERS_MM as readonly number[]).includes(d);
}

/** Cross-sectional area of one bar, mm². */
export function barAreaMm2(diameterMm: number): number {
  return (Math.PI * diameterMm * diameterMm) / 4;
}
