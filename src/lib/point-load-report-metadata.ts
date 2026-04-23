/** Date opționale pentru raportul PDF point load (`tests.point_load_report_metadata_json`). */

export interface PointLoadReportMetadata {
  sample_source?: string | null;
  sampling_method?: string | null;
  storage_conditions?: string | null;
  structural_features?: string | null;
  discontinuity_orientation?: string | null;
  equipment_type?: string | null;
  equipment_model?: string | null;
  equipment_calibration?: string | null;
  moisture_condition_detail?: string | null;
  water_content_percent?: number | null;
  loading_vs_weakness_note?: string | null;
  rock_strength_class?: string | null;
  n_specimens_tested?: number | null;
  specimen_preparation?: string | null;
  statistics_note?: string | null;
  ia50_anisotropy?: string | null;
  anisotropy_directions_detail?: string | null;
  failure_type?: string | null;
  crack_location?: string | null;
  test_validity?: string | null;
  supplementary_notes?: string | null;
  charts_nomograms_note?: string | null;
}

function trimStr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

export function parsePointLoadReportMetadata(raw: unknown): PointLoadReportMetadata {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const w = o.water_content_percent;
  let wNum: number | null = null;
  if (w !== null && w !== undefined && w !== "") {
    const n = typeof w === "number" ? w : Number(w);
    if (Number.isFinite(n) && n >= 0) wNum = n;
  }
  const nSpec = o.n_specimens_tested;
  let nSpecNum: number | null = null;
  if (nSpec !== null && nSpec !== undefined && nSpec !== "") {
    const n = typeof nSpec === "number" ? nSpec : Number(nSpec);
    if (Number.isFinite(n) && n >= 1) nSpecNum = Math.floor(n);
  }
  return {
    sample_source: trimStr(o.sample_source),
    sampling_method: trimStr(o.sampling_method),
    storage_conditions: trimStr(o.storage_conditions),
    structural_features: trimStr(o.structural_features),
    discontinuity_orientation: trimStr(o.discontinuity_orientation),
    equipment_type: trimStr(o.equipment_type),
    equipment_model: trimStr(o.equipment_model),
    equipment_calibration: trimStr(o.equipment_calibration),
    moisture_condition_detail: trimStr(o.moisture_condition_detail),
    water_content_percent: wNum,
    loading_vs_weakness_note: trimStr(o.loading_vs_weakness_note),
    rock_strength_class: trimStr(o.rock_strength_class),
    n_specimens_tested: nSpecNum,
    specimen_preparation: trimStr(o.specimen_preparation),
    statistics_note: trimStr(o.statistics_note),
    ia50_anisotropy: trimStr(o.ia50_anisotropy),
    anisotropy_directions_detail: trimStr(o.anisotropy_directions_detail),
    failure_type: trimStr(o.failure_type),
    crack_location: trimStr(o.crack_location),
    test_validity: trimStr(o.test_validity),
    supplementary_notes: trimStr(o.supplementary_notes),
    charts_nomograms_note: trimStr(o.charts_nomograms_note),
  };
}

export function clampPointLoadReportMetadataForStorage(raw: unknown): PointLoadReportMetadata {
  const p = parsePointLoadReportMetadata(raw);
  const out: PointLoadReportMetadata = {};
  const copy = <K extends keyof PointLoadReportMetadata>(k: K) => {
    const v = p[k];
    if (v != null && v !== "") (out as Record<string, unknown>)[k] = v;
  };
  copy("sample_source");
  copy("sampling_method");
  copy("storage_conditions");
  copy("structural_features");
  copy("discontinuity_orientation");
  copy("equipment_type");
  copy("equipment_model");
  copy("equipment_calibration");
  copy("moisture_condition_detail");
  if (p.water_content_percent != null) out.water_content_percent = p.water_content_percent;
  copy("loading_vs_weakness_note");
  copy("rock_strength_class");
  if (p.n_specimens_tested != null) out.n_specimens_tested = p.n_specimens_tested;
  copy("specimen_preparation");
  copy("statistics_note");
  copy("ia50_anisotropy");
  copy("anisotropy_directions_detail");
  copy("failure_type");
  copy("crack_location");
  copy("test_validity");
  copy("supplementary_notes");
  copy("charts_nomograms_note");
  return out;
}
