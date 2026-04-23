import type { TestType } from "@/types/lab";
import { z } from "zod";

function optionalNumber(label: string, opts?: { min?: number; max?: number }) {
  return z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    const n = typeof v === "number" ? v : Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : undefined;
  }, z.number({ message: `${label}: număr invalid` }).min(opts?.min ?? -Infinity).max(opts?.max ?? Infinity).optional());
}

const presiometrySchema = z.object({
  pmt_probe_type: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    return String(v);
  }, z.string().max(120).optional()),
  pmt_depth_m: optionalNumber("Adâncime", { min: 0 }),
  pmt_packer_diameter_mm: optionalNumber("Diametru packer", { min: 0 }),
  pmt_seating_r_mm: optionalNumber("R așezare", { min: 0 }),
  pmt_borehole_diameter_mm: optionalNumber("Diametru gaură", { min: 0 }),
  pmt_probe_diameter_mm: optionalNumber("Diametru sondă", { min: 0 }),
  pmt_initial_volume_cm3: optionalNumber("Volum inițial", { min: 0 }),
  pmt_temperature_c: optionalNumber("Temperatura", { min: -50, max: 80 }),
  pmt_notes_field: z.preprocess((v) => {
    if (v === "" || v === undefined || v === null) return undefined;
    return String(v);
  }, z.string().max(1000).optional()),
});

export function validateMeasurementsForTestType(
  _testType: TestType,
  values: Record<string, unknown>,
): { ok: true } | { ok: false; message: string } {
  const parsed = presiometrySchema.safeParse(values);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Date invalide" };
  }
  return { ok: true };
}

