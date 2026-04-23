import type { TestType } from "@/types/lab";

export interface MeasurementPresetRow {
  key: string;
  label: string;
  unit: string;
  /** Explicație scurtă sub câmp (ex. Point load D5731). */
  hint?: string;
}

export const MEASUREMENT_PRESETS: Record<TestType, MeasurementPresetRow[]> = {
  presiometry_program_a: [
    { key: "pmt_probe_type", label: "Tip presiometru / sondă (opțional)", unit: "—" },
    { key: "pmt_depth_m", label: "Adâncime test (z)", unit: "m" },
    { key: "pmt_packer_diameter_mm", label: "Diametru packer (NX)", unit: "mm" },
    { key: "pmt_seating_r_mm", label: "R așezare (seating) — tub 76 mm → 38 mm", unit: "mm" },
    { key: "pmt_borehole_diameter_mm", label: "Diametru gaură foraj (opțional)", unit: "mm" },
    { key: "pmt_probe_diameter_mm", label: "Diametru sondă / cameră (opțional)", unit: "mm" },
    { key: "pmt_initial_volume_cm3", label: "Volum inițial V₀ (opțional)", unit: "cm³" },
    {
      key: "pmt_temperature_c",
      label: "Temperatura (opțional, pentru note raport)",
      unit: "°C",
    },
    {
      key: "pmt_notes_field",
      label: "Observații teren (opțional)",
      unit: "—",
    },
  ],
  presiometry_program_b: [
    { key: "pmt_probe_type", label: "Tip presiometru / sondă (opțional)", unit: "—" },
    { key: "pmt_depth_m", label: "Adâncime test (z)", unit: "m" },
    { key: "pmt_packer_diameter_mm", label: "Diametru packer (NX)", unit: "mm" },
    { key: "pmt_seating_r_mm", label: "R așezare (seating) — tub 76 mm → 38 mm", unit: "mm" },
    { key: "pmt_borehole_diameter_mm", label: "Diametru gaură foraj (opțional)", unit: "mm" },
    { key: "pmt_probe_diameter_mm", label: "Diametru sondă / cameră (opțional)", unit: "mm" },
    { key: "pmt_initial_volume_cm3", label: "Volum inițial V₀ (opțional)", unit: "cm³" },
    { key: "pmt_temperature_c", label: "Temperatura (opțional)", unit: "°C" },
    { key: "pmt_notes_field", label: "Observații teren (opțional)", unit: "—" },
  ],
  presiometry_program_c: [
    { key: "pmt_probe_type", label: "Tip presiometru / sondă (opțional)", unit: "—" },
    { key: "pmt_depth_m", label: "Adâncime test (z)", unit: "m" },
    { key: "pmt_packer_diameter_mm", label: "Diametru packer (NX)", unit: "mm" },
    { key: "pmt_seating_r_mm", label: "R așezare (seating) — tub 76 mm → 38 mm", unit: "mm" },
    { key: "pmt_borehole_diameter_mm", label: "Diametru gaură foraj (opțional)", unit: "mm" },
    { key: "pmt_probe_diameter_mm", label: "Diametru sondă / cameră (opțional)", unit: "mm" },
    { key: "pmt_initial_volume_cm3", label: "Volum inițial V₀ (opțional)", unit: "cm³" },
    { key: "pmt_temperature_c", label: "Temperatura (opțional)", unit: "°C" },
    { key: "pmt_notes_field", label: "Observații teren (opțional)", unit: "—" },
  ],
};
