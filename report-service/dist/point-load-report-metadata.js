/** Parse `tests.point_load_report_metadata_json` (oglindă web `point-load-report-metadata.ts`). */
function trimStr(v) {
    if (v === null || v === undefined)
        return null;
    const s = String(v).trim();
    return s.length ? s : null;
}
export function parsePointLoadReportMetadata(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const o = raw;
    const w = o.water_content_percent;
    let wNum = null;
    if (w !== null && w !== undefined && w !== "") {
        const n = typeof w === "number" ? w : Number(w);
        if (Number.isFinite(n) && n >= 0)
            wNum = n;
    }
    const nSpec = o.n_specimens_tested;
    let nSpecNum = null;
    if (nSpec !== null && nSpec !== undefined && nSpec !== "") {
        const n = typeof nSpec === "number" ? nSpec : Number(nSpec);
        if (Number.isFinite(n) && n >= 1)
            nSpecNum = Math.floor(n);
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
