import type { TestType } from "@/types/lab";
import { PMT_PROBE_DIAMETER_MM, PMT_SEATING_R_MM_DEFAULT } from "@/lib/presiometry-defaults";

export interface MeasurementPresetRow {
  key: string;
  label: string;
  unit: string;
  /** Explicație scurtă sub câmp (ex. Point load D5731). */
  hint?: string;
  /** Implicit numeric; câmpuri text nu trebuie forțate la număr la salvare. */
  valueKind?: "number" | "text";
}

const pmtGeometryRows = (): MeasurementPresetRow[] => [
  { key: "pmt_depth_m", label: "Adâncime test (z)", unit: "m" },
  {
    key: "pmt_borehole_diameter_mm",
    label: "Diametru tipic al forajului",
    unit: "mm",
    hint: "Diametrul nominal / tipic al găurii de foraj (raport ISO).",
  },
  {
    key: "pmt_probe_diameter_mm",
    label: "Diametru pe coloana de încercare (sondă / cameră)",
    unit: "mm",
    hint: `Implicit Ø${PMT_PROBE_DIAMETER_MM} mm pentru tubul / sonda uzuală.`,
  },
  { key: "pmt_packer_diameter_mm", label: "Diametru packer (NX)", unit: "mm" },
  {
    key: "pmt_seating_r_mm",
    label: `R la așezare (mm) — tub Ø${PMT_PROBE_DIAMETER_MM} mm ⇒ R = ${PMT_SEATING_R_MM_DEFAULT} mm`,
    unit: "mm",
    hint: `Așezarea presiometrului cu sondă Ø${PMT_PROBE_DIAMETER_MM} mm începe la R = ${PMT_SEATING_R_MM_DEFAULT} mm (R = Ø/2). Corecție inițială a razei cavității folosită la δ = R − R₀.`,
  },
  {
    key: "pmt_pl_mpa",
    label: "Presiune limită pₗ",
    unit: "MPa",
    hint: "Opțional — din interpretarea curbei / aparat; nu se calculează automat încă.",
  },
  {
    key: "pmt_pf_mpa",
    label: "Presiune de curgere p_f",
    unit: "MPa",
    hint: "Opțional — din interpretarea curbei / aparat; nu se calculează automat încă.",
  },
];

const pmtOptionalRows = (): MeasurementPresetRow[] => [
  { key: "pmt_probe_type", label: "Tip presiometru / sondă (opțional)", unit: "—", valueKind: "text" },
  { key: "pmt_initial_volume_cm3", label: "Volum inițial V₀ (opțional)", unit: "cm³" },
  { key: "pmt_temperature_c", label: "Temperatura (opțional)", unit: "°C" },
  { key: "pmt_notes_field", label: "Observații teren (opțional)", unit: "—", valueKind: "text" },
];

export const MEASUREMENT_PRESETS: Record<TestType, MeasurementPresetRow[]> = {
  presiometry_program_a: [...pmtGeometryRows(), ...pmtOptionalRows()],
  presiometry_program_b: [...pmtGeometryRows(), ...pmtOptionalRows()],
  presiometry_program_c: [...pmtGeometryRows(), ...pmtOptionalRows()],
};
