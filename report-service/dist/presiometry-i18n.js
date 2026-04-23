const EN = {
    htmlLang: "en",
    h2_identification: "Sample and borehole identification",
    h2_exec: "Test execution and conditions",
    h2_measurements: "Measurements",
    h2_results: "Calculated results",
    h2_charts: "Graphs",
    h2_observations: "Notes",
    th_indicator: "Parameter",
    th_value: "Value",
    th_unit: "Unit",
    th_result: "Result",
    meta_project: "Project name",
    meta_client: "Client",
    meta_location: "Location",
    meta_borehole_code: "Borehole code",
    meta_sample: "Sample No.",
    meta_depth: "Test depth (m)",
    meta_lithology: "Lithology",
    tc_test_date: "Test date",
    tc_equipment: "Equipment",
    sig_prepared: "Prepared by",
    sig_verified: "Reviewed by",
    foot_line1: "The results apply only to the items tested",
    foot_line2: "The report may not be reproduced in part without the laboratory’s approval",
    tel_prefix: "Tel.",
    lab_auth: "Authorized laboratory — Aut. No. 3976/2023",
    hdr_project_prefix: "Project",
    chart_pR: "p–R curve",
    chart_pV: "p–V curve",
    chart_p_delta: "p–δ curve",
    chart_p_dV: "p–ΔV curve",
    axis_R_mm: "R (mm)",
    axis_V_cm3: "V (cm³)",
    axis_delta_mm: "δ (mm)",
    axis_dV_cm3: "ΔV (cm³)",
    axis_p_mpa: "p (MPa)",
    series_imported: "Imported series",
    series_axis_pr: "p–R (R in mm)",
    series_axis_pv: "p–V (V in cm³)",
    start_time_csv: "Start time (from CSV)",
    packer_diameter: "Packer diameter (NX)",
    formula_version: "Calculation engine version",
    conf_statement: "The test was performed in accordance with SR EN ISO 22476-5.",
    program_a: "Program A",
    program_b: "Program B",
    program_c: "Program C",
    report_title: "Pressuremeter test",
    page_title_suffix: "Pressuremeter (SR EN ISO 22476-5)",
    norm: "SR EN ISO 22476-5",
    h2_specimen: "Sample documentation",
    specimen_note: "Report §8.1 k: description / sketch / photo of the specimen showing the failure type (where applicable).",
    specimen_before: "Before test",
    specimen_after: "After test",
};
const RO = {
    htmlLang: "ro",
    h2_identification: "Identificare probă și foraj",
    h2_exec: "Date execuție și condiții de încercare",
    h2_measurements: "Măsurători",
    h2_results: "Rezultate calculate",
    h2_charts: "Grafice",
    h2_observations: "Observații",
    th_indicator: "Indicator",
    th_value: "Valoare",
    th_unit: "Unitate",
    th_result: "Rezultat",
    meta_project: "Nume proiect",
    meta_client: "Client",
    meta_location: "Amplasament",
    meta_borehole_code: "Cod foraj",
    meta_sample: "Număr probă",
    meta_depth: "Adâncime test (m)",
    meta_lithology: "Litologie",
    tc_test_date: "Data testului",
    tc_equipment: "Echipament",
    sig_prepared: "Întocmit",
    sig_verified: "Verificat",
    foot_line1: "Rezultatele se referă numai la obiectele încercate",
    foot_line2: "Raportul nu poate fi reprodus decât integral fără aprobarea laboratorului",
    tel_prefix: "Tel.",
    lab_auth: "Authorized laboratory - Aut. No. 3976/2023",
    hdr_project_prefix: "Proiect",
    chart_pR: "Curba p–R",
    chart_pV: "Curba p–V",
    chart_p_delta: "Curba p–δ",
    chart_p_dV: "Curba p–ΔV",
    axis_R_mm: "R (mm)",
    axis_V_cm3: "V (cm³)",
    axis_delta_mm: "δ (mm)",
    axis_dV_cm3: "ΔV (cm³)",
    axis_p_mpa: "p (MPa)",
    series_imported: "Seria importată",
    series_axis_pr: "p–R (R în mm)",
    series_axis_pv: "p–V (V în cm³)",
    start_time_csv: "Ora start (din CSV)",
    packer_diameter: "Diametru packer (NX)",
    formula_version: "Versiune formule motor calcule",
    conf_statement: "Încercarea a fost efectuată conform SR EN ISO 22476-5.",
    program_a: "Program A",
    program_b: "Program B",
    program_c: "Program C",
    report_title: "Încercare presiometrică",
    page_title_suffix: "Presiometrie (SR EN ISO 22476-5)",
    norm: "SR EN ISO 22476-5",
    h2_specimen: "Documentare probă",
    specimen_note: "Raport §8.1 k: descriere / schiță / fotografie a probei care indică tipul de rupere.",
    specimen_before: "Înainte de încercare",
    specimen_after: "După încercare",
};
export function presiometryStaticCopy(locale) {
    return locale === "en" ? { ...EN } : { ...RO };
}
export function formatTestDateForReport(raw, locale) {
    if (!raw || !String(raw).trim())
        return "—";
    const t = String(raw).trim();
    let ymd = t.slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) {
        const m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
        if (m) {
            const dd = m[1].padStart(2, "0");
            const mm = m[2].padStart(2, "0");
            ymd = `${m[3]}-${mm}-${dd}`;
        }
    }
    const d = new Date(`${ymd}T12:00:00`);
    if (Number.isNaN(d.getTime()))
        return t;
    if (locale === "en")
        return d.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
    return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}
function programEn(tt) {
    if (tt === "presiometry_program_a")
        return EN.program_a;
    if (tt === "presiometry_program_b")
        return EN.program_b;
    return EN.program_c;
}
function programRo(tt) {
    if (tt === "presiometry_program_a")
        return RO.program_a;
    if (tt === "presiometry_program_b")
        return RO.program_b;
    return RO.program_c;
}
export function presiometryReportMainTitle(testType, locale) {
    const p = locale === "en" ? programEn(testType) : programRo(testType);
    if (locale === "en")
        return `${EN.report_title} — ${p}`;
    return `${RO.report_title} — ${p}`;
}
export function presiometryPageTitle(testType, locale) {
    const p = locale === "en" ? programEn(testType) : programRo(testType);
    if (locale === "en")
        return `Pressuremeter (${p})`;
    return `Presiometrie (${p})`;
}
/**
 * Traduceri scurte pentru rânduri cu chei `pmt_*` cunoscute; altfel păstrăm eticheta din DB.
 */
export function pmtTableLabelForLocale(key, labelRo, locale) {
    if (locale === "ro")
        return labelRo;
    const k = String(key);
    const M = [
        [/^pmt_a_menard_em_gl1_mpa$/, "Em (Menard, GL1) — Menard modulus from first loading (GL1), ν=0.33 (drained)"],
        [/^pmt_b_menard_em_gl1_mpa$/, "Em (Menard, GL1) — Menard modulus from first loading (GL1), ν=0.33 (drained)"],
        [/^pmt_a_load1_r2$/, "GL1: R² — fit quality of linear regression on GL1"],
        [/^pmt_b_load1_r2$/, "GL1: R² — fit quality of linear regression on GL1"],
        [/^pmt_a_load1_n$/, "GL1: N points — number of points in GL1 regression"],
        [/^pmt_b_load1_n$/, "GL1: N points — number of points in GL1 regression"],
        [/^pmt_pmin_mpa$/, "Minimum pressure in series p_min"],
        [/^pmt_pmax_mpa$/, "Maximum pressure in series p_max"],
        [/^pmt_loops_detected$/, "Detected loops (auto)"],
        [/^pmt_depth_m$/, "Test depth z"],
        [/^pmt_p0_kpa$/, "First point: p₀"],
        [/^pmt_v0_cm3$/, "First point: V₀"],
        [/^pmt_pmax_kpa$/, "Maximum pressure p_max"],
        [/^pmt_v_at_pmax_cm3$/, "Volume at p_max"],
        [/^pmt_secant_kpa_per_cm3$/, "Initial slope Δp/ΔV (secant)"],
    ];
    for (const [re, s] of M) {
        if (re.test(k))
            return s;
    }
    if (k.startsWith("pmt_a_load1_") && k.includes("mpa")) {
        return "GL1: |Δp/Δx| — slope magnitude on first loading (for Em)";
    }
    if (k.startsWith("pmt_b_load1_") && k.includes("mpa")) {
        return "GL1: |Δp/Δx| — slope magnitude on first loading (for Em)";
    }
    if (/_unload_.*mpa/.test(k)) {
        return labelRo.replace(/^GU(\d+):/g, "GU$1:").replace("descărcare", "unloading").replace("buclei", "loop");
    }
    if (/_reload_.*mpa/.test(k)) {
        return labelRo
            .replace("reîncărcare", "reloading")
            .replace("ramura", "branch")
            .replace("buclei", "loop");
    }
    if (/_gur_/.test(k) && k.includes("mpa")) {
        return "GUR: |Δp/Δx| — loop modulus (Program B), for Em on loop";
    }
    if (/_gur_r2$/.test(k))
        return "GUR: R² — linear fit quality (loop)";
    if (/_gur_n$/.test(k))
        return "GUR: N points — points in GUR regression (loop)";
    if (/_unload_r2$/.test(k))
        return labelRo.replace(/^GU(\d+): R²/, "GU$1: R² — fit on unloading (loop $1)");
    if (/_reload_r2$/.test(k))
        return labelRo.replace(/^GR(\d+): R²/, "GR$1: R² — fit on reloading (loop $1)");
    return labelRo;
}
export function pmtMeasurementLabelForLocale(key, labelRo, locale) {
    if (locale === "ro")
        return labelRo;
    const k = String(key);
    if (k === "pmt_series_axis") {
        if (labelRo.includes("p–V") || labelRo.includes("p-V"))
            return EN.series_axis_pv;
        return EN.series_axis_pr;
    }
    if (k === "pmt_start_time")
        return EN.start_time_csv;
    if (k === "pmt_packer_diameter_mm")
        return EN.packer_diameter;
    if (k === "pmt_probe_type")
        return "Probe / pressuremeter type (optional)";
    if (k === "pmt_seating_r_mm")
        return "Seating R (mm)";
    if (k === "pmt_borehole_diameter_mm")
        return "Borehole diameter (optional)";
    if (k === "pmt_initial_volume_cm3")
        return "Initial volume V₀ (optional)";
    if (k === "pmt_temperature_c")
        return "Temperature (optional)";
    if (k === "pmt_notes_field")
        return "Field notes (optional)";
    if (k === "pmt_depth_m")
        return "Test depth z";
    return labelRo;
}
export function parseReportLocale(v) {
    if (v === "en" || v === "EN")
        return "en";
    return "ro";
}
