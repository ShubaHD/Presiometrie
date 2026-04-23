/** Echipamente compresiune monoaxială (ISO 17892-7) — listă extensibilă. */
export const UNCONFINED_SOIL_DEVICE_OPTIONS = [
  "UNIFRAME Series Electromechanical Universal Testers",
] as const;

export function isUnconfinedSoilDeviceOption(v: string): boolean {
  return (UNCONFINED_SOIL_DEVICE_OPTIONS as readonly string[]).includes(v);
}
