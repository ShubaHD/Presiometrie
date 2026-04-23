import type { TestType } from "@/types/lab";

const TEST_TYPES: TestType[] = [
  "presiometry_program_a",
  "presiometry_program_b",
  "presiometry_program_c",
];

export function isTestType(v: string): v is TestType {
  return (TEST_TYPES as string[]).includes(v);
}

/** YYYY-MM-DD pentru RPC (zi calendaristică alocării), fără ambiguitate fus orar. */
export function parseAllocationDateIso(v: unknown): string | null {
  if (v == null || v === "") return null;
  const s = String(v).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, mo - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return s;
}
