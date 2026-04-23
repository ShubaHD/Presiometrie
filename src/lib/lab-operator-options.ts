/** Operatori laborator — listă extensibilă (aceleași valori ca la PLT). */
export const LAB_OPERATOR_SELECT_OPTIONS = [
  "Blaguiescu Elena",
  "Vaideanu Denisa",
  "Gapsa Loredana-Sorina",
] as const;

export function isLabOperatorSelectOption(v: string): boolean {
  return (LAB_OPERATOR_SELECT_OPTIONS as readonly string[]).includes(v);
}
