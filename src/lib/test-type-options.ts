import type { TestType } from "@/types/lab";

export interface NewTestOption {
  value: TestType;
  label: string;
  description: string;
  group: "presiometry";
}

/** Opțiuni pentru dialogul „Test nou” (fără duplicate de `value` în Select). */
export const NEW_TEST_OPTIONS: NewTestOption[] = [
  {
    value: "presiometry_program_a",
    label: "Program A — SR EN ISO 22476-5",
    description:
      "Program A: bucle multiple de descărcare/reîncărcare. Se calculează moduluri pentru prima încărcare, descărcări și reîncărcări (conform ferestrei 30%–70%).",
    group: "presiometry",
  },
  {
    value: "presiometry_program_b",
    label: "Program B — SR EN ISO 22476-5",
    description:
      "Program B: prima încărcare + bucle de descărcare–reîncărcare. Se calculează moduluri conform ferestrei 30%–70% pentru bucle.",
    group: "presiometry",
  },
  {
    value: "presiometry_program_c",
    label: "Program C — SR EN ISO 22476-5 (creep)",
    description:
      "Program C: include secvențe de menținere (creep). În această versiune: import + structură (fără calcul k încă).",
    group: "presiometry",
  },
];

/** Etichete scurte în arbore. */
export const TEST_TYPE_SHORT_LABEL: Record<TestType, string> = {
  presiometry_program_a: "PMT A",
  presiometry_program_b: "PMT B",
  presiometry_program_c: "PMT C",
};

export function newTestOptionLabel(tt: TestType): string {
  return TEST_TYPE_SHORT_LABEL[tt] ?? tt;
}
