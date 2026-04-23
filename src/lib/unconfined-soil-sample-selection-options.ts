/** Metoda selecție probă (ISO 17892-7) — listă extensibilă. */
export const UNCONFINED_SOIL_SAMPLE_SELECTION_METHOD_OPTIONS = [
  "Nedisturbată",
  "Shelby",
  "Carotier dublu",
] as const;

export function isUnconfinedSoilSampleSelectionMethodOption(v: string): boolean {
  return (UNCONFINED_SOIL_SAMPLE_SELECTION_METHOD_OPTIONS as readonly string[]).includes(v);
}

