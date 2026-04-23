/** Câmpuri opționale raport SR EN ISO 17892-7 §8.1 (JSON pe `tests.unconfined_soil_report_metadata_json`). */

export interface UnconfinedSoilReportMetadata {
  /** ISO 17892-7 §8.1 a) */
  specimen_depth_in_sample_note?: string | null;
  /** ISO 17892-7 §8.1 a) */
  sample_selection_method?: string | null;
  compression_rate?: string | null;
  /** ISO 17892-7 §8.1 h) — alternativ la mm/min (text liber, ex. „1,5 %/min”). */
  compression_rate_strain_pct_per_min?: string | null;
  time_to_failure?: string | null;
  failure_mode_description?: string | null;
  sample_moisture?: string | null;
  visual_description?: string | null;
  /** ISO 17892-7 §8.1 b) — observații particule > 1/10 din diametru. */
  coarse_particle_note_1_10_d?: string | null;
  /** ISO 17892-7 §8.1 b) — notă dacă particule > 1/6 din diametru (posibil efect asupra rezultatului). */
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

export function clampUnconfinedSoilReportMetadataForStorage(
  raw: unknown,
): UnconfinedSoilReportMetadata {
  const p = parseUnconfinedSoilReportMetadata(raw);
  const out: UnconfinedSoilReportMetadata = {};
  if (p.specimen_depth_in_sample_note != null) out.specimen_depth_in_sample_note = p.specimen_depth_in_sample_note;
  if (p.sample_selection_method != null) out.sample_selection_method = p.sample_selection_method;
  if (p.compression_rate != null) out.compression_rate = p.compression_rate;
  if (p.compression_rate_strain_pct_per_min != null) {
    out.compression_rate_strain_pct_per_min = p.compression_rate_strain_pct_per_min;
  }
  if (p.time_to_failure != null) out.time_to_failure = p.time_to_failure;
  if (p.failure_mode_description != null) out.failure_mode_description = p.failure_mode_description;
  if (p.sample_moisture != null) out.sample_moisture = p.sample_moisture;
  if (p.visual_description != null) out.visual_description = p.visual_description;
  if (p.coarse_particle_note_1_10_d != null) out.coarse_particle_note_1_10_d = p.coarse_particle_note_1_10_d;
  if (p.coarse_particle_note_1_6_d != null) out.coarse_particle_note_1_6_d = p.coarse_particle_note_1_6_d;
  if (p.specimen_type_procedure != null) out.specimen_type_procedure = p.specimen_type_procedure;
  if (p.deviations != null) out.deviations = p.deviations;
  if (p.failure_documentation != null) out.failure_documentation = p.failure_documentation;
  if (p.manual_dry_unit_weight_kn_m3 != null) out.manual_dry_unit_weight_kn_m3 = p.manual_dry_unit_weight_kn_m3;
  return out;
}
