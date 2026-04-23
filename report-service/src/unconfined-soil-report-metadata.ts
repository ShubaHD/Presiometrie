/** SR EN ISO 17892-7 §8.1 — JSON pe `tests.unconfined_soil_report_metadata_json`. */

export interface UnconfinedSoilReportMetadata {
  specimen_depth_in_sample_note?: string | null;
  sample_selection_method?: string | null;
  compression_rate?: string | null;
  compression_rate_strain_pct_per_min?: string | null;
  time_to_failure?: string | null;
  failure_mode_description?: string | null;
  sample_moisture?: string | null;
  visual_description?: string | null;
  coarse_particle_note_1_10_d?: string | null;
  coarse_particle_note_1_6_d?: string | null;
  specimen_type_procedure?: string | null;
  deviations?: string | null;
  failure_documentation?: string | null;
  manual_dry_unit_weight_kn_m3?: number | null;
}

function trimStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function parseUnconfinedSoilReportMetadata(raw: unknown): UnconfinedSoilReportMetadata {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const manual = o.manual_dry_unit_weight_kn_m3;
  let manualNum: number | null = null;
  if (manual !== null && manual !== undefined && manual !== "") {
    const n = typeof manual === "number" ? manual : Number(manual);
    if (Number.isFinite(n) && n > 0) manualNum = n;
  }
  return {
    specimen_depth_in_sample_note: trimStr(o.specimen_depth_in_sample_note),
    sample_selection_method: trimStr(o.sample_selection_method),
    compression_rate: trimStr(o.compression_rate),
    compression_rate_strain_pct_per_min: trimStr(o.compression_rate_strain_pct_per_min),
    time_to_failure: trimStr(o.time_to_failure),
    failure_mode_description: trimStr(o.failure_mode_description),
    sample_moisture: trimStr(o.sample_moisture),
    visual_description: trimStr(o.visual_description),
    coarse_particle_note_1_10_d: trimStr(o.coarse_particle_note_1_10_d),
    coarse_particle_note_1_6_d: trimStr(o.coarse_particle_note_1_6_d),
    specimen_type_procedure: trimStr(o.specimen_type_procedure),
    deviations: trimStr(o.deviations),
    failure_documentation: trimStr(o.failure_documentation),
    manual_dry_unit_weight_kn_m3: manualNum,
  };
}
