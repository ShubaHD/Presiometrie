import fs from "node:fs/promises";
import path from "node:path";
import { loadStrainSvg, loadStrainChannelsSvg, soilEpsilonDispTimeDualSvg, soilMohrQuCuSvg, triaxialMohrMultiSvg, soilStressStrainSvg, stressMpaToLoadKn, stressTimeSvg, timeLoadSvg, } from "./chart-svgs.js";
import { buildPointLoadPdfSections } from "./point-load-pdf-sections.js";
import { parsePointLoadReportMetadata } from "./point-load-report-metadata.js";
import { parseUnconfinedSoilCurvePayload, stressStrainSeriesKpa } from "./unconfined-soil-curve.js";
import { parseUnconfinedSoilReportMetadata } from "./unconfined-soil-report-metadata.js";
import { parseUcsReportMetadata } from "./ucs-report-metadata.js";
import { buildPresiometryPdfOverlays, detectLoopsByPressure, extractPvPointsPdf, } from "./presiometry-pdf-overlays.js";
import { formatTestDateForReport, pmtMeasurementLabelForLocale, pmtTableLabelForLocale, presiometryPageTitle, presiometryReportMainTitle, presiometryStaticCopy, } from "./presiometry-i18n.js";
/** Aliniat la `server.ts` — enum Postgres / copieri pot varia ca string. */
function normalizeTestTypeForPayload(raw) {
    if (raw == null)
        return "";
    return String(raw)
        .trim()
        .toLowerCase()
        .replace(/[\u200b-\u200d\ufeff]/g, "");
}
/** Rânduri măsurători ascunse în raportul PDF presiometrie (ISO 22476-5). */
const PRESIOMETRY_OMIT_MEASUREMENT_KEYS = new Set([
    "pmt_probe_type",
    "pmt_initial_volume_cm3",
    "pmt_temperature_c",
    "pmt_notes_field",
    "pmt_depth_m",
]);
const PRESIOMETRY_OMIT_RESULT_KEYS = new Set([
    "pmt_pmin_mpa",
    "pmt_loops_detected",
    "pmt_depth_m",
    "pmt_a_load1_n",
    "pmt_b_load1_n",
]);
function fmtNum(v, decimals = 3) {
    if (v === null || v === undefined)
        return "—";
    const n = typeof v === "number" ? v : Number(v);
    if (!Number.isFinite(n))
        return "—";
    return n.toFixed(decimals);
}
function escXml(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function svgLineChart(opts) {
    const width = opts.width ?? 820;
    const height = opts.height ?? 260;
    const pts = opts.points.filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y));
    if (pts.length < 2)
        return null;
    let minX = Math.min(...pts.map((p) => p.x));
    let maxX = Math.max(...pts.map((p) => p.x));
    let minY = Math.min(...pts.map((p) => p.y));
    let maxY = Math.max(...pts.map((p) => p.y));
    for (const b of opts.bands ?? []) {
        if (!Number.isFinite(b.x1) || !Number.isFinite(b.x2))
            continue;
        minX = Math.min(minX, b.x1, b.x2);
        maxX = Math.max(maxX, b.x1, b.x2);
    }
    for (const s of opts.segmentLines ?? []) {
        if (![s.x1, s.x2, s.y1, s.y2].every((v) => Number.isFinite(v)))
            continue;
        minX = Math.min(minX, s.x1, s.x2);
        maxX = Math.max(maxX, s.x1, s.x2);
        minY = Math.min(minY, s.y1, s.y2);
        maxY = Math.max(maxY, s.y1, s.y2);
    }
    for (const m of opts.markers ?? []) {
        if (!Number.isFinite(m.x) || !Number.isFinite(m.y))
            continue;
        minX = Math.min(minX, m.x);
        maxX = Math.max(maxX, m.x);
        minY = Math.min(minY, m.y);
        maxY = Math.max(maxY, m.y);
    }
    let dx = maxX - minX;
    let dy = maxY - minY;
    if (!(dx > 0) || !(dy > 0))
        return null;
    const pr = opts.padAxesRatio ?? 0;
    if (pr > 0) {
        minX -= dx * pr;
        maxX += dx * pr;
        minY -= dy * pr;
        maxY += dy * pr;
        dx = maxX - minX;
        dy = maxY - minY;
    }
    const padL = 58;
    const padR = 12;
    const padT = 26;
    const padB = 46;
    const innerW = width - padL - padR;
    const innerH = height - padT - padB;
    const sx = (x) => padL + ((x - minX) / dx) * innerW;
    const sy = (y) => padT + (1 - (y - minY) / dy) * innerH;
    const linearTicks = (lo, hi, n) => {
        if (!(hi > lo) || n < 2)
            return [lo, hi];
        const out = [];
        for (let i = 0; i < n; i++)
            out.push(lo + ((hi - lo) * i) / (n - 1));
        return out;
    };
    const fmtTick = (v) => {
        const a = Math.abs(v);
        if (a >= 100)
            return v.toFixed(0);
        if (a >= 10)
            return v.toFixed(1);
        return v.toFixed(2);
    };
    const xticks = linearTicks(minX, maxX, 6);
    const yticks = linearTicks(minY, maxY, 5);
    const gridTicksSvg = [
        ...xticks.map((xv) => {
            const gx = sx(xv);
            return `<line x1="${gx.toFixed(2)}" y1="${padT}" x2="${gx.toFixed(2)}" y2="${padT + innerH}" stroke="#e8e8e8" stroke-width="1"/>
<text class="m" x="${gx.toFixed(2)}" y="${padT + innerH + 14}" text-anchor="middle">${escXml(fmtTick(xv))}</text>`;
        }),
        ...yticks.map((yv) => {
            const gy = sy(yv);
            return `<line x1="${padL}" y1="${gy.toFixed(2)}" x2="${padL + innerW}" y2="${gy.toFixed(2)}" stroke="#e8e8e8" stroke-width="1"/>
<text class="m" x="${(padL - 5).toFixed(1)}" y="${(gy + 4).toFixed(1)}" text-anchor="end">${escXml(fmtTick(yv))}</text>`;
        }),
    ].join("\n");
    const path = pts
        .map((p, i) => `${i === 0 ? "M" : "L"} ${sx(p.x).toFixed(2)} ${sy(p.y).toFixed(2)}`)
        .join(" ");
    const bandsSvg = (opts.bands ?? [])
        .map((b) => {
        const x1 = Math.min(b.x1, b.x2);
        const x2 = Math.max(b.x1, b.x2);
        const rx = sx(x1);
        const rw = Math.max(0.5, sx(x2) - sx(x1));
        const op = b.opacity ?? 0.28;
        return `<rect x="${rx.toFixed(2)}" y="${padT}" width="${rw.toFixed(2)}" height="${innerH}" fill="${escXml(b.fill)}" opacity="${op}"/>`;
    })
        .join("\n");
    const segSvg = (opts.segmentLines ?? [])
        .map((s) => {
        const dash = s.dash ? ` stroke-dasharray="${escXml(s.dash)}"` : "";
        return `<line x1="${sx(s.x1).toFixed(2)}" y1="${sy(s.y1).toFixed(2)}" x2="${sx(s.x2).toFixed(2)}" y2="${sy(s.y2).toFixed(2)}" stroke="${escXml(s.stroke)}" stroke-width="2"${dash} />`;
    })
        .join("\n");
    const markSvg = (opts.markers ?? [])
        .filter((m) => Number.isFinite(m.x) && Number.isFinite(m.y))
        .map((m) => {
        const cx = sx(m.x);
        const cy = sy(m.y);
        const fill = escXml(m.fill ?? "#c0392b");
        const circle = `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="4" fill="${fill}" stroke="#fff" stroke-width="1.2"/>`;
        const lab = (m.label ?? "").trim();
        const text = lab.length > 0
            ? `<text class="m" x="${(cx + 6).toFixed(1)}" y="${(cy - 5).toFixed(1)}">${escXml(lab)}</text>`
            : "";
        return `${circle}${text}`;
    })
        .join("\n");
    const axis = `
    <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${padT + innerH}" stroke="#888" stroke-width="1" />
    <line x1="${padL}" y1="${padT + innerH}" x2="${padL + innerW}" y2="${padT + innerH}" stroke="#888" stroke-width="1" />
  `;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <style>
    .t { font: 12px Arial, sans-serif; fill: #222; }
    .m { font: 10px Arial, sans-serif; fill: #444; }
  </style>
  <text class="t" x="${padL}" y="16">${escXml(opts.title)}</text>
  ${gridTicksSvg}
  ${axis}
  ${bandsSvg}
  <path d="${path}" fill="none" stroke="#2a6fdb" stroke-width="1.5" />
  ${segSvg}
  ${markSvg}
  <text class="m" x="${padL + innerW / 2}" y="${height - 10}" text-anchor="middle">${escXml(opts.xLabel)}</text>
  <text class="m" x="14" y="${padT + innerH / 2}" transform="rotate(-90 14 ${padT + innerH / 2})" text-anchor="middle">${escXml(opts.yLabel)}</text>
</svg>`;
}
function normalizePdfLabel(raw) {
    if (raw === null || raw === undefined)
        return "";
    const s = String(raw);
    // Puppeteer/print can render Unicode subscripts too small/light, and font fallback can
    // make σ₁ look like σl. Prefer plain digits for indices.
    return s
        // common OCR-ish confusions
        .replace(/σl/g, "σ1")
        .replace(/σI/g, "σ1")
        .replace(/σɩ/g, "σ1")
        // unicode subscripts → plain digits
        .replace(/₀/g, "0")
        .replace(/₁/g, "1")
        .replace(/₂/g, "2")
        .replace(/₃/g, "3")
        .replace(/₄/g, "4")
        .replace(/₅/g, "5")
        .replace(/₆/g, "6")
        .replace(/₇/g, "7")
        .replace(/₈/g, "8")
        .replace(/₉/g, "9")
        // explicit fallbacks
        .replace(/m\u2080/g, "m0")
        .replace(/m\u2081/g, "m1")
        .replace(/m\u2082/g, "m2");
}
function resultNumber(results, key) {
    const row = (results ?? []).find((r) => r.key === key);
    if (!row || row.value === null || row.value === undefined)
        return NaN;
    return Number(row.value);
}
/** Puncte Young: doar t_s + stress_mpa (fără a exige strain_axial). */
function parseYoungCurveStressTimeSeries(raw) {
    if (!raw || typeof raw !== "object")
        return [];
    const pts = raw.points;
    if (!Array.isArray(pts))
        return [];
    const out = [];
    for (const p of pts) {
        if (!p || typeof p !== "object")
            continue;
        const r = p;
        const stress = Number(r.stress_mpa);
        const tRaw = r.t_s;
        const tr = tRaw === null || tRaw === undefined ? NaN : Number(tRaw);
        if (!Number.isFinite(stress) || !Number.isFinite(tr))
            continue;
        out.push({ t: tr, stress });
    }
    return out;
}
function parseYoungGaugeChannelsSeries(raw) {
    if (!raw || typeof raw !== "object")
        return [];
    const pts = raw.points;
    if (!Array.isArray(pts))
        return [];
    const out = [];
    for (const p of pts) {
        if (!p || typeof p !== "object")
            continue;
        const r = p;
        const load = Number(r.load_kn);
        if (!Number.isFinite(load))
            continue;
        const c6 = r.strain_ch6 == null || r.strain_ch6 === "" ? null : Number(r.strain_ch6);
        const c7 = r.strain_ch7 == null || r.strain_ch7 === "" ? null : Number(r.strain_ch7);
        const c8 = r.strain_ch8 == null || r.strain_ch8 === "" ? null : Number(r.strain_ch8);
        out.push({
            load,
            ch6: c6 != null && Number.isFinite(c6) ? c6 : null,
            ch7: c7 != null && Number.isFinite(c7) ? c7 : null,
            ch8: c8 != null && Number.isFinite(c8) ? c8 : null,
        });
    }
    return out;
}
function parseUcsCurvePoints(raw) {
    if (!raw || typeof raw !== "object")
        return [];
    const pts = raw.points;
    if (!Array.isArray(pts))
        return [];
    const out = [];
    for (const p of pts) {
        if (!p || typeof p !== "object")
            continue;
        const r = p;
        const stress = Number(r.stress_mpa);
        const strain = Number(r.strain_axial);
        if (!Number.isFinite(stress) || !Number.isFinite(strain))
            continue;
        const tRaw = r.t_s;
        const tr = tRaw === null || tRaw === undefined ? NaN : Number(tRaw);
        const lkRaw = r.load_kn;
        const lk = lkRaw === null || lkRaw === undefined || lkRaw === "" ? NaN : Number(lkRaw);
        out.push({
            t_s: Number.isFinite(tr) ? tr : null,
            stress_mpa: stress,
            strain_axial: strain,
            load_kn: Number.isFinite(lk) ? lk : null,
        });
    }
    return out;
}
function parseReportChartOptions(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const ucs = raw.ucs_charts;
    if (!ucs || typeof ucs !== "object")
        return {};
    const u = ucs;
    const o = {};
    if ("stress_time" in u)
        o.stress_time = Boolean(u.stress_time);
    if ("time_load" in u)
        o.time_load = Boolean(u.time_load);
    if ("sarcina_axial" in u)
        o.sarcina_axial = Boolean(u.sarcina_axial);
    if ("stress_strain" in u)
        o.stress_strain = Boolean(u.stress_strain);
    return o;
}
function effectiveInclude(stored, defaultOn) {
    if (stored === false)
        return false;
    if (stored === true)
        return true;
    return defaultOn;
}
function parseUnconfinedSoilChartOptions(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const us = raw.unconfined_soil_charts;
    if (!us || typeof us !== "object")
        return {};
    const u = us;
    if (!("stress_strain" in u))
        return {};
    return { stress_strain: Boolean(u.stress_strain) };
}
function parseUnconfinedSoilResultsOptions(raw) {
    if (!raw || typeof raw !== "object")
        return {};
    const us = raw.unconfined_soil_results;
    if (!us || typeof us !== "object")
        return {};
    const u = us;
    if (!("include_cu_kpa" in u))
        return {};
    return { include_cu_kpa: Boolean(u.include_cu_kpa) };
}
/** Etichete rezultate PDF — aliniate la UI (indiferent de snapshot vechi în `calculation_results`). */
function unconfinedSoilPdfResultLabel(key, fallback) {
    switch (key) {
        case "qu_kpa":
            return "Rezistenta la compresiune monoaxiala R_c";
        case "strain_at_failure_percent":
            return "Deformația specifică axială la momentul ruperii probei ε_v";
        case "cu_kpa":
            return "Rezistența la forfecare nedrenată c_u (0,5·q_u)";
        default:
            return fallback;
    }
}
/** Etichete măsurători PDF — aceleași denumiri ca în UI. */
function unconfinedSoilPdfMeasurementLabel(key, fallback) {
    switch (key) {
        case "strain_at_failure_percent":
            return "Deformația specifică axială la momentul ruperii probei ε_v (mod basic), %";
        default:
            // curățăm sufixe „opționale” în PDF
            return fallback.replace(/\s*\(opțional, raport\)\s*/gi, "").trim();
    }
}
const LAB_FILES_BUCKET = "lab-files";
function specimenPhotosIncludedInReport(raw) {
    if (!raw || typeof raw !== "object")
        return true;
    const sp = raw.specimen_photos;
    if (!sp || typeof sp !== "object")
        return true;
    return sp.include !== false;
}
function pltAstmFiguresIncludedInReport(raw) {
    if (!raw || typeof raw !== "object")
        return true;
    const x = raw.plt_astm_figures;
    if (!x || typeof x !== "object")
        return true;
    return x.include !== false;
}
async function loadPltAstmFigureDataUrls(templatesRoot) {
    const dir = path.join(templatesRoot, "shared", "assets", "plt");
    const specs = [
        {
            file: "astm-d5731-fig3-geometries.png",
            caption: "Fig. 3 ASTM D5731 — D, W, L și probă echivalentă (diametral, axial, bloc, neregulat)",
        },
    ];
    const out = [];
    for (const s of specs) {
        try {
            const buf = await fs.readFile(path.join(dir, s.file));
            if (buf.length > 10 * 1024 * 1024)
                continue;
            out.push({
                dataUrl: `data:image/png;base64,${buf.toString("base64")}`,
                caption: s.caption,
            });
        }
        catch {
            /* fișier lipsă în deployment */
        }
    }
    return out;
}
const POINT_LOAD_REPORT_SECTIONS = [
    "header",
    "pointLoadStructured",
    "pltAstmFigures",
    "specimenPhotos",
    "signatures",
    "footer",
];
function mimeFromFileType(ext) {
    const e = (ext ?? "").toLowerCase();
    if (e === "png")
        return "image/png";
    if (e === "webp")
        return "image/webp";
    if (e === "gif")
        return "image/gif";
    if (e === "svg")
        return "image/svg+xml";
    return "image/jpeg";
}
function extensionFromStoragePath(filePath) {
    const m = filePath.match(/\.([a-z0-9]+)$/i);
    return m ? m[1].toLowerCase() : null;
}
function isImageTestFileRow(r) {
    const t = (r.file_type ?? "").toLowerCase();
    if (["jpeg", "jpg", "png", "gif", "webp", "bmp", "heic", "heif"].includes(t))
        return true;
    const name = typeof r.file_name === "string" ? r.file_name : "";
    return (/\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(name) ||
        /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(r.file_path));
}
async function loadLabForReport(supabase) {
    const empty = {
        companyName: null,
        address: null,
        phone: null,
        website: null,
        logoSrc: null,
    };
    const { data, error } = await supabase.from("lab_profile").select("*").eq("id", 1).maybeSingle();
    if (error)
        throw error;
    if (!data)
        return empty;
    const row = data;
    const str = (v) => (typeof v === "string" && v.trim() ? v.trim() : null);
    let logoSrc = null;
    const lp = row.logo_path;
    if (typeof lp === "string" && lp.length > 0) {
        logoSrc = await downloadImageDataUrl(supabase, lp, extensionFromStoragePath(lp));
    }
    return {
        companyName: str(row.company_name),
        address: str(row.address),
        phone: str(row.phone),
        website: str(row.website),
        logoSrc,
    };
}
async function downloadImageDataUrl(supabase, filePath, fileType) {
    const { data, error } = await supabase.storage.from(LAB_FILES_BUCKET).download(filePath);
    if (error || !data)
        return null;
    const ab = await data.arrayBuffer();
    const buf = Buffer.from(ab);
    if (buf.length > 10 * 1024 * 1024)
        return null;
    const mime = mimeFromFileType(fileType);
    return `data:${mime};base64,${buf.toString("base64")}`;
}
function displayTextField(s) {
    const t = (s ?? "").trim();
    return t.length ? t : "—";
}
function preparedByDisplay(preparedByRaw, operatorNameRaw) {
    const p = (preparedByRaw ?? "").trim();
    if (p)
        return p;
    const op = (operatorNameRaw ?? "").trim();
    return op ? `Laborant ${op}` : "—";
}
function loadingRateMpaPerSecond(raw) {
    const t = (raw ?? "").trim();
    if (!t)
        return "—";
    // If user already typed units, keep as-is.
    if (/[a-zA-Z]/.test(t))
        return t;
    const n = Number(t.replace(",", "."));
    if (!Number.isFinite(n))
        return t;
    // Always show with unit MPa/s for Young/UCS-type reports.
    const s = Math.abs(n) >= 10 ? n.toFixed(2) : Math.abs(n) >= 1 ? n.toFixed(3) : n.toFixed(4);
    return `${s} MPa/s`;
}
function operatorEquipmentLine(op, dev) {
    const o = (op ?? "").trim();
    const d = (dev ?? "").trim();
    if (!o && !d)
        return "—";
    if (o && d)
        return `${o} · ${d}`;
    return o || d;
}
function formatTestDateRo(raw) {
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
    return d.toLocaleDateString("ro-RO", { day: "numeric", month: "long", year: "numeric" });
}
function youngModulusMethodRo(ucsMode, raw) {
    if (ucsMode !== "instrumented")
        return "";
    if (!raw || typeof raw !== "object")
        return "";
    const m = String(raw.method ?? "");
    const map = {
        tangent: "Tangentă",
        secant: "Secantă",
        loading_linear: "Regresie liniară (zonă de încărcare)",
        unloading: "Segment descărcare",
    };
    return map[m] || (m ? m : "");
}
/** Metoda E pentru test Young (ASTM D7012) din `young_settings_json.e_method`. */
function youngD7012MethodLabel(raw) {
    if (!raw || typeof raw !== "object")
        return "—";
    const m = String(raw.e_method ?? "").trim();
    const map = {
        eb: "Eb (SR EN 14580, ciclu 3)",
        loading: "Regresie liniară (zonă de încărcare)",
        unloading: "Segment descărcare",
        delta: "Metodă diferențială (Δε)",
        isrm: "ISRM (Etan / Esec / Eavg)",
    };
    return map[m] || (m.length ? m : "—");
}
function measurementNumber(measurements, key) {
    const row = (measurements ?? []).find((m) => m.key === key);
    if (!row || row.value === null || row.value === undefined)
        return NaN;
    return Number(row.value);
}
function measurementText(measurements, key, decimals = 3) {
    const row = (measurements ?? []).find((m) => m.key === key);
    if (!row)
        return "—";
    const v = fmtNum(row.value, decimals);
    if (v === "—")
        return "—";
    const u = String(row.unit ?? "").trim();
    return u ? `${v} ${u}` : v;
}
function fmtSig2(n, unit) {
    if (!Number.isFinite(n))
        return "—";
    const s = n.toPrecision(2);
    return unit ? `${s} ${unit}` : s;
}
function unconfinedInitialAreaMm2(measurements) {
    const isSq = measurementNumber(measurements, "unconfined_is_square");
    const isSquare = isSq === 1;
    if (isSquare) {
        const side = measurementNumber(measurements, "side_mm");
        if (Number.isFinite(side) && side > 0)
            return side * side;
        return NaN;
    }
    const d = measurementNumber(measurements, "diameter_mm");
    if (Number.isFinite(d) && d > 0)
        return Math.PI * (d / 2) ** 2;
    return NaN;
}
function unconfinedBaselineKn(points, measurements) {
    const manual = measurementNumber(measurements, "unconfined_seating_load_kn");
    if (Number.isFinite(manual) && manual > 0)
        return manual;
    if (measurementNumber(measurements, "unconfined_subtract_initial_seating") === 0)
        return 0;
    if (points.length === 0)
        return 0;
    const p0 = points[0];
    if (Number.isFinite(p0.load_kn) && p0.load_kn >= 0)
        return p0.load_kn;
    return 0;
}
/** Aceeași regulă ca în web `ucs.ts`: manual kN, apoi 0 = brut, altfel primul punct. */
function timeLoadBaselineKnFromCurve(curvePoints, measurements, diamMm) {
    const manual = measurementNumber(measurements, "ucs_seating_load_kn");
    if (Number.isFinite(manual) && manual > 0)
        return manual;
    if (measurementNumber(measurements, "ucs_subtract_initial_seating") === 0)
        return 0;
    if (curvePoints.length === 0)
        return 0;
    const p0 = curvePoints[0];
    if (p0.load_kn != null && Number.isFinite(p0.load_kn) && p0.load_kn >= 0) {
        return p0.load_kn;
    }
    if (Number.isFinite(diamMm) && diamMm > 0) {
        return stressMpaToLoadKn(p0.stress_mpa, diamMm);
    }
    return 0;
}
/** σ de referință pentru așezare (aceeași logică ca F netă / UI). */
function stressBaselineMpaForReport(curvePoints, measurements, diamMm) {
    const manualKn = measurementNumber(measurements, "ucs_seating_load_kn");
    if (Number.isFinite(manualKn) && manualKn > 0 && Number.isFinite(diamMm) && diamMm > 0) {
        const a = Math.PI * (diamMm / 2) ** 2;
        return (manualKn * 1000) / a;
    }
    if (measurementNumber(measurements, "ucs_subtract_initial_seating") === 0)
        return 0;
    if (curvePoints.length === 0)
        return 0;
    const p0 = curvePoints[0];
    if (Number.isFinite(diamMm) && diamMm > 0) {
        let blKn = 0;
        if (p0.load_kn != null && Number.isFinite(p0.load_kn) && p0.load_kn >= 0) {
            blKn = p0.load_kn;
        }
        else {
            blKn = stressMpaToLoadKn(p0.stress_mpa, diamMm);
        }
        const a = Math.PI * (diamMm / 2) ** 2;
        return (blKn * 1000) / a;
    }
    return p0.stress_mpa;
}
export async function buildTriaxialRockPayload(supabase, testId, templateCode, templateVersion, sections) {
    const { data: test, error: tErr } = await supabase
        .from("tests")
        .select(`
      id, test_type, status, operator_name, device_name, prepared_by, verified_by, test_date, formula_version, notes,
      created_at, updated_at, created_by, updated_by,
      report_options_json, ucs_report_metadata_json,
      sample:samples (
        id, code, depth_from, depth_to, lithology, notes,
        borehole:boreholes (
          id, code, name, depth_total, elevation, notes,
          project:projects ( id, code, name, client_name, location, notes )
        )
      )
    `)
        .eq("id", testId)
        .single();
    if (tErr)
        throw tErr;
    if (!test || test.test_type !== "triaxial_rock") {
        throw new Error("Doar testele Triaxial (rocă) sunt suportate de acest raport.");
    }
    const rawSample = test.sample;
    if (!rawSample || Array.isArray(rawSample)) {
        throw new Error("Date probă lipsă sau invalide.");
    }
    const sample = rawSample;
    if (!sample.borehole?.project) {
        throw new Error("Ierarhie incompletă (probă / foraj / proiect).");
    }
    const lab = await loadLabForReport(supabase);
    const [{ data: measurements }, { data: results }, taggedPhotos] = await Promise.all([
        supabase.from("test_measurements").select("*").eq("test_id", testId).order("display_order"),
        supabase.from("test_results").select("*").eq("test_id", testId).order("display_order"),
        supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .in("file_role", ["specimen_before", "specimen_after"]),
    ]);
    if (taggedPhotos.error)
        throw taggedPhotos.error;
    let photoRows = taggedPhotos.data;
    if (!photoRows || photoRows.length === 0) {
        const { data: allFiles, error: allErr } = await supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .order("uploaded_at", { ascending: true });
        if (allErr)
            throw allErr;
        const imgs = (allFiles ?? []).filter((r) => isImageTestFileRow(r));
        if (imgs.length > 0) {
            photoRows = imgs.slice(0, 2).map((r, i) => ({
                ...r,
                file_role: i === 0 ? "specimen_before" : "specimen_after",
            }));
        }
    }
    const show = {};
    for (const s of sections) {
        show[s] = true;
    }
    // Triaxial rock: include Mohr circles + Mohr–Coulomb envelope when enough imported runs exist.
    const charts = {};
    show.chartStressTime = false;
    show.chartYoungGauges = false;
    show.chartLoadStrain = false;
    show.chartTimeLoad = false;
    show.chartSoilStressStrain = false;
    show.chartSoilEpsilonDispTime = false;
    show.chartSoilMohr = false;
    show.ucsChartsSection = false;
    try {
        const { data: runs, error: runsErr } = await supabase
            .from("triaxial_rock_runs")
            .select("id, file_name, sigma1_mpa, sigma3_mpa, created_at")
            .eq("test_id", testId)
            .order("created_at", { ascending: false })
            .limit(12);
        if (runsErr)
            throw runsErr;
        const circles = (runs ?? [])
            .map((r) => ({
            id: String(r.id ?? ""),
            label: String(r.file_name ?? ""),
            sigma1Mpa: Number(r.sigma1_mpa),
            sigma3Mpa: Number(r.sigma3_mpa),
        }))
            .filter((c) => c.id && c.label && Number.isFinite(c.sigma1Mpa) && Number.isFinite(c.sigma3Mpa));
        const cMpa = resultNumber(results ?? [], "mohr_c_mpa");
        const phiDeg = resultNumber(results ?? [], "mohr_phi_deg");
        const env = Number.isFinite(cMpa) && Number.isFinite(phiDeg) ? { cMpa, phiDeg } : null;
        const svg = triaxialMohrMultiSvg(circles, env, "Cercuri Mohr (τ–σ) + Envelopă Mohr–Coulomb");
        if (svg) {
            // Reuse existing "soilMohrQuCuSvg" slot rendered by the shared partial.
            charts.soilMohrQuCuSvg = svg;
            show.chartSoilMohr = true;
            show.ucsChartsSection = true;
        }
    }
    catch {
        // Best-effort: charts are optional.
    }
    const wantSpecimenPhotos = specimenPhotosIncludedInReport(test.report_options_json);
    let beforeSrc = null;
    let afterSrc = null;
    if (wantSpecimenPhotos && photoRows && photoRows.length > 0) {
        for (const row of photoRows) {
            const r = row;
            const src = await downloadImageDataUrl(supabase, r.file_path, r.file_type);
            if (r.file_role === "specimen_before")
                beforeSrc = src;
            if (r.file_role === "specimen_after")
                afterSrc = src;
        }
    }
    const sectionWantsPhotos = sections.includes("specimenPhotos");
    show.specimenPhotos = sectionWantsPhotos && wantSpecimenPhotos && (beforeSrc != null || afterSrc != null);
    const meta = parseUcsReportMetadata(test.ucs_report_metadata_json);
    const testConditions = {
        testDateDisplay: formatTestDateRo(test.test_date ?? null),
        operatorEquipment: "",
        loadingRate: displayTextField(meta.loading_rate ?? undefined),
        timeToFailure: displayTextField(meta.time_to_failure ?? undefined),
        failureMode: displayTextField(meta.failure_mode_description ?? undefined),
        sampleMoisture: displayTextField(meta.sample_moisture ?? undefined),
        directionVsStructure: displayTextField(meta.direction_vs_structure ?? undefined),
        dimensionalCompliance: displayTextField(meta.dimensional_compliance ?? undefined),
        youngModulusMethod: "",
        unitWeightReported: "—",
        unitWeightReportedLine: "—",
        unitWeightSourceNote: "",
        unitWeightMeanFromTab: "—",
        unitWeightMeanFromTabLine: "—",
        unitWeightPerSpecimen: [],
        operatorDisplay: displayTextField(test.operator_name ?? null),
        deviceDisplay: displayTextField(test.device_name ?? null),
        sampleMoistureDisplay: displayTextField(meta.sample_moisture ?? undefined),
    };
    show.testConditions = sections.includes("testConditions");
    const signatures = {
        preparedBy: test.prepared_by ?? "",
        verifiedBy: test.verified_by ?? "",
    };
    show.signatures = true;
    const resultsForReport = (results ?? []);
    return {
        generatedAt: new Date().toISOString(),
        templateCode,
        templateVersion,
        project: {
            code: sample.borehole.project.code,
            name: sample.borehole.project.name,
            client_name: sample.borehole.project.client_name,
            location: sample.borehole.project.location,
        },
        borehole: {
            code: sample.borehole.code,
            name: sample.borehole.name,
            depth_total: sample.borehole.depth_total,
            elevation: sample.borehole.elevation,
        },
        sample: {
            code: sample.code,
            depth_from: sample.depth_from,
            depth_to: sample.depth_to,
            lithology: sample.lithology,
        },
        test: {
            id: test.id,
            test_type: String(test.test_type),
            status: String(test.status ?? ""),
            conclusion: null,
            operator_name: test.operator_name,
            device_name: test.device_name,
            test_date: test.test_date,
            formula_version: test.formula_version,
            notes: test.notes,
            created_at: test.created_at ?? null,
            updated_at: test.updated_at ?? null,
            created_by: test.created_by ?? null,
            updated_by: test.updated_by ?? null,
        },
        measurements: (measurements ?? []).map((m) => ({
            label: normalizePdfLabel(m.label),
            key: m.key,
            value: fmtNum(m.value, 4),
            unit: m.unit ?? "",
        })),
        results: resultsForReport.map((r) => ({
            label: normalizePdfLabel(r.label),
            key: r.key,
            value: fmtNum(r.value, r.decimals ?? 3),
            unit: r.unit ?? "",
        })),
        show,
        charts,
        photos: { beforeSrc, afterSrc },
        lab,
        footer: { formCode: "F-PL-ANCFD-3.01" },
        reportMainTitle: "Încercare triaxială (rocă)",
        reportNormRef: "ASTM D7012 (Triaxial — aplicație ROCA)",
        reportPageTitle: "Triaxial rock report",
        conformanceStatement: undefined,
        testConditions,
        signatures,
    };
}
export async function buildUcsPayload(supabase, testId, templateCode, templateVersion, sections) {
    const { data: test, error: tErr } = await supabase
        .from("tests")
        .select(`
      id, test_type, status, operator_name, device_name, prepared_by, verified_by, test_date, formula_version, notes,
      created_at, updated_at, created_by, updated_by,
      ucs_mode, ucs_curve_json, ucs_modulus_settings_json, ucs_report_metadata_json, report_options_json,
      sample:samples (
        id, code, depth_from, depth_to, lithology, notes,
        borehole:boreholes (
          id, code, name, depth_total, elevation, notes,
          project:projects ( id, code, name, client_name, location, notes )
        )
      )
    `)
        .eq("id", testId)
        .single();
    if (tErr)
        throw tErr;
    if (!test || test.test_type !== "ucs") {
        throw new Error("Doar testele UCS sunt suportate de acest șablon.");
    }
    const rawSample = test.sample;
    if (!rawSample || Array.isArray(rawSample)) {
        throw new Error("Date probă lipsă sau invalide.");
    }
    const sample = rawSample;
    if (!sample.borehole?.project) {
        throw new Error("Ierarhie incompletă (probă / foraj / proiect).");
    }
    const lab = await loadLabForReport(supabase);
    const [{ data: measurements }, { data: results }, taggedPhotos] = await Promise.all([
        supabase.from("test_measurements").select("*").eq("test_id", testId).order("display_order"),
        supabase.from("test_results").select("*").eq("test_id", testId).order("display_order"),
        supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .in("file_role", ["specimen_before", "specimen_after"]),
    ]);
    if (taggedPhotos.error)
        throw taggedPhotos.error;
    let photoRows = taggedPhotos.data;
    if (!photoRows || photoRows.length === 0) {
        const { data: allFiles, error: allErr } = await supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .order("uploaded_at", { ascending: true });
        if (allErr)
            throw allErr;
        const imgs = (allFiles ?? []).filter((r) => isImageTestFileRow(r));
        if (imgs.length > 0) {
            photoRows = imgs.slice(0, 2).map((r, i) => ({
                ...r,
                file_role: i === 0 ? "specimen_before" : "specimen_after",
            }));
        }
    }
    const show = {};
    for (const s of sections) {
        show[s] = true;
    }
    const curvePoints = parseUcsCurvePoints(test.ucs_curve_json);
    const chartOpts = parseReportChartOptions(test.report_options_json);
    const ucsMode = test.ucs_mode === "instrumented" ? "instrumented" : "basic";
    const diamRow = (measurements ?? []).find((m) => m.key === "diameter_mm");
    const diamMm = diamRow ? Number(diamRow.value) : NaN;
    const tlBaselineKn = timeLoadBaselineKnFromCurve(curvePoints, measurements ?? [], diamMm);
    const stressBlMpa = Number.isFinite(diamMm) && diamMm > 0
        ? stressBaselineMpaForReport(curvePoints, measurements ?? [], diamMm)
        : 0;
    const stressTimeSeries = [];
    for (const p of curvePoints) {
        if (p.t_s == null || !Number.isFinite(p.t_s) || !Number.isFinite(p.stress_mpa))
            continue;
        const stressPlot = stressBlMpa > 0 ? p.stress_mpa - stressBlMpa : p.stress_mpa;
        stressTimeSeries.push({ t: p.t_s, stress: stressPlot });
    }
    const availStressTime = stressTimeSeries.length >= 2;
    const loadStrainSeries = [];
    for (const p of curvePoints) {
        if (!Number.isFinite(p.strain_axial))
            continue;
        let load = p.load_kn;
        if (load == null || !Number.isFinite(load)) {
            if (!Number.isFinite(diamMm) || diamMm <= 0)
                continue;
            load = stressMpaToLoadKn(p.stress_mpa, diamMm);
        }
        const loadPlot = tlBaselineKn > 0 ? load - tlBaselineKn : load;
        loadStrainSeries.push({ strain: p.strain_axial, load: loadPlot });
    }
    const availLoadStrain = ucsMode === "instrumented" && loadStrainSeries.length >= 2;
    const timeLoadSeries = [];
    for (const p of curvePoints) {
        if (p.t_s == null || !Number.isFinite(p.t_s))
            continue;
        let load = p.load_kn;
        if (load == null || !Number.isFinite(load)) {
            if (!Number.isFinite(diamMm) || diamMm <= 0)
                continue;
            load = stressMpaToLoadKn(p.stress_mpa, diamMm);
        }
        const loadPlot = tlBaselineKn > 0 ? load - tlBaselineKn : load;
        timeLoadSeries.push({ t: p.t_s, load: loadPlot });
    }
    const availTimeLoad = timeLoadSeries.length >= 2;
    /** Mod basic: doar σ–t. Mod instrumentat: σ–t + F–ε_axial. */
    const sarcinaStored = chartOpts.sarcina_axial !== undefined ? chartOpts.sarcina_axial : chartOpts.stress_strain;
    const incStressTime = effectiveInclude(chartOpts.stress_time, true) && availStressTime;
    const incTimeLoad = effectiveInclude(chartOpts.time_load, true) && availTimeLoad;
    const incLoadStrain = ucsMode === "instrumented" &&
        effectiveInclude(sarcinaStored, true) &&
        availLoadStrain;
    const nu = resultNumber(results ?? [], "poisson_ratio");
    const conclusion = Number.isFinite(nu) && nu < 0.05
        ? "Coeficient Poisson ν < 0.05 este Neconcludent"
        : null;
    const charts = {};
    if (incStressTime) {
        const stTitle = stressBlMpa > 0 ? "Efort net – timp (σ netă)" : "Efort – timp";
        const stY = stressBlMpa > 0 ? "σ netă (MPa)" : "σ (MPa)";
        const svg = stressTimeSvg(stressTimeSeries, stTitle, stY);
        if (svg)
            charts.stressTimeSvg = svg;
    }
    if (incLoadStrain) {
        const yL = tlBaselineKn > 0 ? "F netă (kN)" : "F (kN)";
        const svg = loadStrainSvg(loadStrainSeries, "Sarcină – ε_axial", yL);
        if (svg)
            charts.loadStrainSvg = svg;
    }
    if (incTimeLoad) {
        const yL = tlBaselineKn > 0 ? "F netă (kN)" : "F (kN)";
        const title = tlBaselineKn > 0 ? "Timp – sarcină netă (față de așezare)" : "Timp – sarcină";
        const svg = timeLoadSvg(timeLoadSeries, title, yL);
        if (svg)
            charts.timeLoadSvg = svg;
    }
    show.chartStressTime = Boolean(charts.stressTimeSvg);
    show.chartLoadStrain = Boolean(charts.loadStrainSvg);
    show.chartTimeLoad = Boolean(charts.timeLoadSvg);
    show.ucsChartsSection = show.chartStressTime || show.chartLoadStrain || show.chartTimeLoad;
    const wantSpecimenPhotos = specimenPhotosIncludedInReport(test.report_options_json);
    let beforeSrc = null;
    let afterSrc = null;
    if (wantSpecimenPhotos && photoRows && photoRows.length > 0) {
        for (const row of photoRows) {
            const r = row;
            const src = await downloadImageDataUrl(supabase, r.file_path, r.file_type);
            if (r.file_role === "specimen_before")
                beforeSrc = src;
            if (r.file_role === "specimen_after")
                afterSrc = src;
        }
    }
    const sectionWantsPhotos = sections.includes("specimenPhotos");
    show.specimenPhotos =
        sectionWantsPhotos && wantSpecimenPhotos && (beforeSrc != null || afterSrc != null);
    const rawRes = (results ?? []);
    const meta = parseUcsReportMetadata(test.ucs_report_metadata_json);
    const gammaRows = rawRes
        .filter((r) => /^uw_subm_\d+_gamma_knm3$/.test(r.key))
        .sort((a, b) => {
        const ma = a.key.match(/^uw_subm_(\d+)_/);
        const mb = b.key.match(/^uw_subm_(\d+)_/);
        return (parseInt(ma?.[1] ?? "0", 10) || 0) - (parseInt(mb?.[1] ?? "0", 10) || 0);
    });
    const dryGammaSub = rawRes.find((r) => r.key === "gamma_dry_from_submerged_kn_m3");
    const calcGammaDry = dryGammaSub && dryGammaSub.value != null ? Number(dryGammaSub.value) : NaN;
    const dryRow = rawRes.find((r) => r.key === "dry_unit_weight_kn_m3");
    const calcGammaBulk = dryRow && dryRow.value != null ? Number(dryRow.value) : NaN;
    const gammaDecimals = (Number.isFinite(calcGammaDry) ? dryGammaSub?.decimals : dryRow?.decimals) ?? 2;
    const manualG = meta.manual_dry_unit_weight_kn_m3;
    let unitWeightReported;
    let unitWeightSourceNote;
    if (manualG != null && Number.isFinite(manualG)) {
        unitWeightReported = manualG.toFixed(2);
        unitWeightSourceNote = "Valoare manuală pentru raport.";
    }
    else if (Number.isFinite(calcGammaDry)) {
        unitWeightReported = calcGammaDry.toFixed(gammaDecimals);
        unitWeightSourceNote = "γ_d din γ aparentă (submersă) și umiditatea gravimetrică.";
    }
    else if (Number.isFinite(calcGammaBulk)) {
        unitWeightReported = calcGammaBulk.toFixed(gammaDecimals);
        unitWeightSourceNote =
            "γ aparentă (submersă); pentru γ_d completați umiditatea gravimetrică în tabul „Greutate volumică”.";
    }
    else {
        unitWeightReported = "—";
        unitWeightSourceNote = "";
    }
    const unitWeightMeanFromTab = Number.isFinite(calcGammaDry)
        ? calcGammaDry.toFixed(gammaDecimals)
        : Number.isFinite(calcGammaBulk)
            ? calcGammaBulk.toFixed(gammaDecimals)
            : "—";
    const unitWeightReportedLine = unitWeightReported === "—" ? "—" : `${unitWeightReported} kN/m³`;
    const unitWeightMeanFromTabLine = unitWeightMeanFromTab === "—" ? "—" : `${unitWeightMeanFromTab} kN/m³`;
    const unitWeightPerSpecimen = gammaRows.map((r) => ({
        label: normalizePdfLabel(r.label),
        value: fmtNum(r.value, r.decimals ?? 2),
    }));
    const metaMoistText = displayTextField(meta.sample_moisture ?? undefined);
    const wGrav = resultNumber(rawRes, "gravimetric_moisture_percent");
    let sampleMoistureDisplay;
    if (metaMoistText !== "—")
        sampleMoistureDisplay = metaMoistText;
    else if (Number.isFinite(wGrav))
        sampleMoistureDisplay = `${wGrav.toFixed(2)} % (gravimetric)`;
    else
        sampleMoistureDisplay = "—";
    const testConditions = {
        testDateDisplay: formatTestDateRo(test.test_date),
        operatorEquipment: operatorEquipmentLine(test.operator_name, test.device_name),
        operatorDisplay: displayTextField(test.operator_name),
        deviceDisplay: displayTextField(test.device_name),
        loadingRate: loadingRateMpaPerSecond(meta.loading_rate ?? undefined),
        timeToFailure: displayTextField(meta.time_to_failure ?? undefined),
        failureMode: displayTextField(meta.failure_mode_description ?? undefined),
        sampleMoisture: metaMoistText,
        sampleMoistureDisplay,
        directionVsStructure: displayTextField(meta.direction_vs_structure ?? undefined),
        dimensionalCompliance: displayTextField(meta.dimensional_compliance ?? undefined),
        youngModulusMethod: youngModulusMethodRo(ucsMode, test.ucs_modulus_settings_json),
        unitWeightReported,
        unitWeightReportedLine,
        unitWeightSourceNote,
        unitWeightMeanFromTab,
        unitWeightMeanFromTabLine,
        unitWeightPerSpecimen,
    };
    show.testConditions = sections.includes("testConditions");
    const signatures = {
        preparedBy: preparedByDisplay(test.prepared_by, test.operator_name),
        verifiedBy: displayTextField(test.verified_by),
    };
    const OMIT_RESULT_KEYS_REPORT = new Set([
        "dry_unit_weight_kn_m3",
        "gamma_dry_from_submerged_kn_m3",
        "dry_density_kg_m3",
        "ucs_seating_load_used_kn",
        "ucs_peak_stress_gross_mpa",
        "peak_load_kn",
    ]);
    const resultsForReport = rawRes.filter((r) => {
        if (OMIT_RESULT_KEYS_REPORT.has(r.key))
            return false;
        if (r.key.startsWith("uw_subm_"))
            return false;
        return true;
    });
    return {
        generatedAt: new Date().toISOString(),
        templateCode,
        templateVersion,
        project: {
            code: sample.borehole.project.code,
            name: sample.borehole.project.name,
            client_name: sample.borehole.project.client_name,
            location: sample.borehole.project.location,
        },
        borehole: {
            code: sample.borehole.code,
            name: sample.borehole.name,
            depth_total: sample.borehole.depth_total,
            elevation: sample.borehole.elevation,
        },
        sample: {
            code: sample.code,
            depth_from: sample.depth_from,
            depth_to: sample.depth_to,
            lithology: sample.lithology,
        },
        test: {
            id: test.id,
            test_type: test.test_type,
            status: test.status,
            conclusion,
            operator_name: test.operator_name,
            device_name: test.device_name,
            test_date: test.test_date,
            formula_version: test.formula_version,
            notes: test.notes,
            created_at: test.created_at ?? null,
            updated_at: test.updated_at ?? null,
            created_by: test.created_by ?? null,
            updated_by: test.updated_by ?? null,
        },
        measurements: (measurements ?? []).map((m) => ({
            label: normalizePdfLabel(m.label),
            key: m.key,
            value: fmtNum(m.value, 4),
            unit: m.unit ?? "",
        })),
        results: resultsForReport.map((r) => ({
            label: normalizePdfLabel(r.label),
            key: r.key,
            value: fmtNum(r.value, r.decimals ?? 3),
            unit: r.unit ?? "",
        })),
        show,
        charts,
        photos: {
            beforeSrc,
            afterSrc,
        },
        lab,
        footer: {
            formCode: "F-PL-ANCFD-3.01",
        },
        testConditions,
        signatures,
    };
}
export async function buildYoungPayload(supabase, testId, templateCode, templateVersion, sections) {
    const { data: test, error: tErr } = await supabase
        .from("tests")
        .select(`
      id, test_type, status, operator_name, device_name, prepared_by, verified_by, test_date, formula_version, notes,
      created_at, updated_at, created_by, updated_by,
      young_settings_json, young_curve_json, report_options_json, ucs_report_metadata_json,
      sample:samples (
        id, code, depth_from, depth_to, lithology, notes,
        borehole:boreholes (
          id, code, name, depth_total, elevation, notes,
          project:projects ( id, code, name, client_name, location, notes )
        )
      )
    `)
        .eq("id", testId)
        .single();
    if (tErr)
        throw tErr;
    if (!test || test.test_type !== "young") {
        throw new Error("Doar testele Young (ASTM D7012) sunt suportate de acest raport.");
    }
    const rawSample = test.sample;
    if (!rawSample || Array.isArray(rawSample)) {
        throw new Error("Date probă lipsă sau invalide.");
    }
    const sample = rawSample;
    if (!sample.borehole?.project) {
        throw new Error("Ierarhie incompletă (probă / foraj / proiect).");
    }
    const lab = await loadLabForReport(supabase);
    const [{ data: measurements }, { data: results }, taggedPhotos] = await Promise.all([
        supabase.from("test_measurements").select("*").eq("test_id", testId).order("display_order"),
        supabase.from("test_results").select("*").eq("test_id", testId).order("display_order"),
        supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .in("file_role", ["specimen_before", "specimen_after"]),
    ]);
    if (taggedPhotos.error)
        throw taggedPhotos.error;
    let photoRows = taggedPhotos.data;
    if (!photoRows || photoRows.length === 0) {
        const { data: allFiles, error: allErr } = await supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .order("uploaded_at", { ascending: true });
        if (allErr)
            throw allErr;
        const imgs = (allFiles ?? []).filter((r) => isImageTestFileRow(r));
        if (imgs.length > 0) {
            photoRows = imgs.slice(0, 2).map((r, i) => ({
                ...r,
                file_role: i === 0 ? "specimen_before" : "specimen_after",
            }));
        }
    }
    const show = {};
    for (const s of sections) {
        show[s] = true;
    }
    const youngCurveRaw = test.young_curve_json;
    const stressTimeSeriesYoung = parseYoungCurveStressTimeSeries(youngCurveRaw);
    const availYoungStressTime = stressTimeSeriesYoung.length >= 2;
    const gaugesSeriesYoung = parseYoungGaugeChannelsSeries(youngCurveRaw);
    const availYoungGauges = gaugesSeriesYoung.length >= 2;
    const chartOptsYoung = parseReportChartOptions(test.report_options_json);
    const incYoungStressTime = effectiveInclude(chartOptsYoung.stress_time, true) && availYoungStressTime;
    const charts = {};
    if (incYoungStressTime) {
        const svg = stressTimeSvg(stressTimeSeriesYoung, "Efort – timp", "σ (MPa)");
        if (svg)
            charts.stressTimeSvg = svg;
    }
    if (availYoungGauges) {
        const svg = loadStrainChannelsSvg(gaugesSeriesYoung, "Sarcină – mărci tensiometrice (Ch6/Ch7/Ch8)");
        if (svg)
            charts.youngGaugesSvg = svg;
    }
    show.chartStressTime = Boolean(charts.stressTimeSvg);
    show.chartYoungGauges = Boolean(charts.youngGaugesSvg);
    show.chartLoadStrain = false;
    show.chartTimeLoad = false;
    show.ucsChartsSection = show.chartStressTime || show.chartYoungGauges;
    const wantSpecimenPhotos = specimenPhotosIncludedInReport(test.report_options_json);
    let beforeSrc = null;
    let afterSrc = null;
    if (wantSpecimenPhotos && photoRows && photoRows.length > 0) {
        for (const row of photoRows) {
            const r = row;
            const src = await downloadImageDataUrl(supabase, r.file_path, r.file_type);
            if (r.file_role === "specimen_before")
                beforeSrc = src;
            if (r.file_role === "specimen_after")
                afterSrc = src;
        }
    }
    const sectionWantsPhotos = sections.includes("specimenPhotos");
    show.specimenPhotos =
        sectionWantsPhotos && wantSpecimenPhotos && (beforeSrc != null || afterSrc != null);
    const rawRes = (results ?? []);
    const meta = parseUcsReportMetadata(test.ucs_report_metadata_json);
    const gammaRows = rawRes
        .filter((r) => /^uw_subm_\d+_gamma_knm3$/.test(r.key))
        .sort((a, b) => {
        const ma = a.key.match(/^uw_subm_(\d+)_/);
        const mb = b.key.match(/^uw_subm_(\d+)_/);
        return (parseInt(ma?.[1] ?? "0", 10) || 0) - (parseInt(mb?.[1] ?? "0", 10) || 0);
    });
    const dryGammaSubY = rawRes.find((r) => r.key === "gamma_dry_from_submerged_kn_m3");
    const calcGammaDryY = dryGammaSubY && dryGammaSubY.value != null ? Number(dryGammaSubY.value) : NaN;
    const dryRow = rawRes.find((r) => r.key === "dry_unit_weight_kn_m3");
    const calcGammaBulkY = dryRow && dryRow.value != null ? Number(dryRow.value) : NaN;
    const gammaDecimals = (Number.isFinite(calcGammaDryY) ? dryGammaSubY?.decimals : dryRow?.decimals) ?? 2;
    const manualG = meta.manual_dry_unit_weight_kn_m3;
    let unitWeightReported;
    let unitWeightSourceNote;
    if (manualG != null && Number.isFinite(manualG)) {
        unitWeightReported = manualG.toFixed(2);
        unitWeightSourceNote = "Valoare manuală pentru raport.";
    }
    else if (Number.isFinite(calcGammaDryY)) {
        unitWeightReported = calcGammaDryY.toFixed(gammaDecimals);
        unitWeightSourceNote = "γ_d din γ aparentă (submersă) și umiditatea gravimetrică.";
    }
    else if (Number.isFinite(calcGammaBulkY)) {
        unitWeightReported = calcGammaBulkY.toFixed(gammaDecimals);
        unitWeightSourceNote =
            "γ aparentă (submersă); pentru γ_d completați umiditatea gravimetrică în tabul „Greutate volumică”.";
    }
    else {
        unitWeightReported = "—";
        unitWeightSourceNote = "";
    }
    const unitWeightMeanFromTab = Number.isFinite(calcGammaDryY)
        ? calcGammaDryY.toFixed(gammaDecimals)
        : Number.isFinite(calcGammaBulkY)
            ? calcGammaBulkY.toFixed(gammaDecimals)
            : "—";
    const unitWeightReportedLine = unitWeightReported === "—" ? "—" : `${unitWeightReported} kN/m³`;
    const unitWeightMeanFromTabLine = unitWeightMeanFromTab === "—" ? "—" : `${unitWeightMeanFromTab} kN/m³`;
    const unitWeightPerSpecimen = gammaRows.map((r) => ({
        label: r.label,
        value: fmtNum(r.value, r.decimals ?? 2),
    }));
    const metaMoistText = displayTextField(meta.sample_moisture ?? undefined);
    const wGrav = resultNumber(rawRes, "gravimetric_moisture_percent");
    let sampleMoistureDisplay;
    if (metaMoistText !== "—")
        sampleMoistureDisplay = metaMoistText;
    else if (Number.isFinite(wGrav))
        sampleMoistureDisplay = `${wGrav.toFixed(2)} % (gravimetric)`;
    else
        sampleMoistureDisplay = "—";
    const youngSettings = test.young_settings_json;
    const testConditions = {
        testDateDisplay: formatTestDateRo(test.test_date),
        operatorEquipment: operatorEquipmentLine(test.operator_name, test.device_name),
        operatorDisplay: displayTextField(test.operator_name),
        deviceDisplay: displayTextField(test.device_name),
        loadingRate: loadingRateMpaPerSecond(meta.loading_rate ?? undefined),
        timeToFailure: displayTextField(meta.time_to_failure ?? undefined),
        failureMode: displayTextField(meta.failure_mode_description ?? undefined),
        sampleMoisture: metaMoistText,
        sampleMoistureDisplay,
        directionVsStructure: displayTextField(meta.direction_vs_structure ?? undefined),
        dimensionalCompliance: displayTextField(meta.dimensional_compliance ?? undefined),
        youngModulusMethod: youngD7012MethodLabel(youngSettings),
        unitWeightReported,
        unitWeightReportedLine,
        unitWeightSourceNote,
        unitWeightMeanFromTab,
        unitWeightMeanFromTabLine,
        unitWeightPerSpecimen,
    };
    show.testConditions = sections.includes("testConditions");
    /** Măsurători Δσ/Δε: folosite la calcule / UI, dar omise din PDF Young (metodă ISRM / curbă). */
    const OMIT_YOUNG_MEASUREMENT_KEYS = new Set([
        "delta_sigma_mpa",
        "delta_epsilon_axial",
        "delta_epsilon_lateral",
    ]);
    const OMIT_YOUNG_REPORT = new Set([
        "dry_unit_weight_kn_m3",
        "gamma_dry_from_submerged_kn_m3",
        "dry_density_kg_m3",
        "ucs_seating_load_used_kn",
        "ucs_peak_stress_gross_mpa",
        "peak_load_kn",
        "isrm_sigma_star_mpa",
        "young_modulus_isrm_etan_mpa",
        "young_modulus_isrm_esec_mpa",
        "young_modulus_isrm_eavg_mpa",
        "young_modulus_isrm_etan_gpa",
        "young_modulus_isrm_esec_gpa",
        "young_modulus_isrm_eavg_gpa",
    ]);
    const diamMmYoung = measurementNumber(measurements ?? [], "diameter_mm");
    const hasSpecimenArea = rawRes.some((r) => r.key === "specimen_area_mm2");
    /** PDF: ca la UCS — „Arie secțiune”; pentru teste vechi fără recalcul, o derivăm din diametru. */
    const syntheticSpecimenArea = !hasSpecimenArea && Number.isFinite(diamMmYoung) && diamMmYoung > 0
        ? {
            key: "specimen_area_mm2",
            label: "Arie secțiune",
            value: Math.PI * (diamMmYoung / 2) ** 2,
            unit: "mm²",
            decimals: 2,
        }
        : null;
    const resultsForReport = [
        ...(syntheticSpecimenArea ? [syntheticSpecimenArea] : []),
        ...rawRes.filter((r) => {
            if (OMIT_YOUNG_REPORT.has(r.key))
                return false;
            if (r.key.startsWith("uw_subm_"))
                return false;
            return true;
        }),
    ];
    /** ν lipsă, 0 sau ν ≥ 0,5 → G și K nu se raportează (PDF: „—”). */
    const nuPdf = resultNumber(resultsForReport, "poisson_ratio");
    const reportShearBulkFromNu = Number.isFinite(nuPdf) && nuPdf > 0 && nuPdf < 0.5;
    return {
        generatedAt: new Date().toISOString(),
        templateCode,
        templateVersion,
        reportMainTitle: "Determinarea modulului Young (E, ν)",
        reportNormRef: "ASTM D7012; metoda E (setări test — SR EN 14580 / ISRM după caz)",
        reportPageTitle: "Modul Young (E, ν) — ASTM D7012",
        project: {
            code: sample.borehole.project.code,
            name: sample.borehole.project.name,
            client_name: sample.borehole.project.client_name,
            location: sample.borehole.project.location,
        },
        borehole: {
            code: sample.borehole.code,
            name: sample.borehole.name,
            depth_total: sample.borehole.depth_total,
            elevation: sample.borehole.elevation,
        },
        sample: {
            code: sample.code,
            depth_from: sample.depth_from,
            depth_to: sample.depth_to,
            lithology: sample.lithology,
        },
        test: {
            id: test.id,
            test_type: test.test_type,
            status: test.status,
            conclusion: null,
            operator_name: test.operator_name,
            device_name: test.device_name,
            test_date: test.test_date,
            formula_version: test.formula_version,
            notes: test.notes,
            created_at: test.created_at ?? null,
            updated_at: test.updated_at ?? null,
            created_by: test.created_by ?? null,
            updated_by: test.updated_by ?? null,
        },
        measurements: (measurements ?? [])
            .filter((m) => !OMIT_YOUNG_MEASUREMENT_KEYS.has(m.key))
            .map((m) => ({
            label: normalizePdfLabel(m.label),
            key: m.key,
            value: fmtNum(m.value, 4),
            unit: m.unit ?? "",
        })),
        results: resultsForReport.map((r) => {
            let v = r.value;
            if (!reportShearBulkFromNu &&
                (r.key === "shear_modulus_gpa" || r.key === "bulk_modulus_gpa")) {
                v = null;
            }
            return {
                label: normalizePdfLabel(r.label),
                key: r.key,
                value: fmtNum(v, r.decimals ?? 3),
                unit: r.unit ?? "",
            };
        }),
        show,
        charts,
        photos: {
            beforeSrc,
            afterSrc,
        },
        lab,
        footer: {
            formCode: "F-PL-ANCFD-D7012",
        },
        testConditions,
        signatures: {
            preparedBy: preparedByDisplay(test.prepared_by, test.operator_name),
            verifiedBy: displayTextField(test.verified_by),
        },
    };
}
export async function buildPointLoadPayload(supabase, testId, templateCode, templateVersion, templatesRoot) {
    const { data: test, error: tErr } = await supabase
        .from("tests")
        .select(`
      id, test_type, status, operator_name, device_name, prepared_by, verified_by, test_date, formula_version, notes,
      created_at, updated_at, created_by, updated_by,
      report_options_json, ucs_report_metadata_json, point_load_report_metadata_json,
      sample:samples (
        id, code, depth_from, depth_to, lithology, notes,
        borehole:boreholes (
          id, code, name, depth_total, elevation, notes,
          project:projects ( id, code, name, client_name, location, notes )
        )
      )
    `)
        .eq("id", testId)
        .single();
    if (tErr)
        throw tErr;
    if (!test || test.test_type !== "point_load") {
        throw new Error("Doar testele Point load sunt suportate de acest raport.");
    }
    const rawSample = test.sample;
    if (!rawSample || Array.isArray(rawSample)) {
        throw new Error("Date probă lipsă sau invalide.");
    }
    const sample = rawSample;
    if (!sample.borehole?.project) {
        throw new Error("Ierarhie incompletă (probă / foraj / proiect).");
    }
    const lab = await loadLabForReport(supabase);
    const [{ data: measurements }, { data: results }, taggedPhotos] = await Promise.all([
        supabase.from("test_measurements").select("*").eq("test_id", testId).order("display_order"),
        supabase.from("test_results").select("*").eq("test_id", testId).order("display_order"),
        supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .in("file_role", ["specimen_before", "specimen_after"]),
    ]);
    if (taggedPhotos.error)
        throw taggedPhotos.error;
    let photoRows = taggedPhotos.data;
    if (!photoRows || photoRows.length === 0) {
        const { data: allFiles, error: allErr } = await supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .order("uploaded_at", { ascending: true });
        if (allErr)
            throw allErr;
        const imgs = (allFiles ?? []).filter((r) => isImageTestFileRow(r));
        if (imgs.length > 0) {
            photoRows = imgs.slice(0, 2).map((r, i) => ({
                ...r,
                file_role: i === 0 ? "specimen_before" : "specimen_after",
            }));
        }
    }
    const show = {};
    for (const s of POINT_LOAD_REPORT_SECTIONS) {
        show[s] = true;
    }
    show.chartStressTime = false;
    show.chartLoadStrain = false;
    show.chartTimeLoad = false;
    show.ucsChartsSection = false;
    const wantSpecimenPhotos = specimenPhotosIncludedInReport(test.report_options_json);
    let beforeSrc = null;
    let afterSrc = null;
    if (wantSpecimenPhotos && photoRows && photoRows.length > 0) {
        for (const row of photoRows) {
            const r = row;
            const src = await downloadImageDataUrl(supabase, r.file_path, r.file_type);
            if (r.file_role === "specimen_before")
                beforeSrc = src;
            if (r.file_role === "specimen_after")
                afterSrc = src;
        }
    }
    const sectionWantsPhotos = POINT_LOAD_REPORT_SECTIONS.includes("specimenPhotos");
    show.specimenPhotos =
        sectionWantsPhotos && wantSpecimenPhotos && (beforeSrc != null || afterSrc != null);
    const wantPltFigures = pltAstmFiguresIncludedInReport(test.report_options_json);
    const pltAstmFigures = wantPltFigures ? await loadPltAstmFigureDataUrls(templatesRoot) : [];
    const sectionWantsPlt = POINT_LOAD_REPORT_SECTIONS.includes("pltAstmFigures");
    show.pltAstmFigures = sectionWantsPlt && wantPltFigures && pltAstmFigures.length > 0;
    const rawRes = (results ?? []);
    const meta = parseUcsReportMetadata(test.ucs_report_metadata_json);
    const plRep = parsePointLoadReportMetadata(test.point_load_report_metadata_json);
    const metaMoistText = displayTextField(meta.sample_moisture ?? undefined);
    const testConditions = {
        testDateDisplay: formatTestDateRo(test.test_date),
        operatorEquipment: operatorEquipmentLine(test.operator_name, test.device_name),
        operatorDisplay: displayTextField(test.operator_name),
        deviceDisplay: displayTextField(test.device_name),
        loadingRate: loadingRateMpaPerSecond(meta.loading_rate ?? undefined),
        timeToFailure: displayTextField(meta.time_to_failure ?? undefined),
        failureMode: displayTextField(meta.failure_mode_description ?? undefined),
        sampleMoisture: metaMoistText,
        sampleMoistureDisplay: metaMoistText,
        directionVsStructure: displayTextField(meta.direction_vs_structure ?? undefined),
        dimensionalCompliance: displayTextField(meta.dimensional_compliance ?? undefined),
        youngModulusMethod: "",
        unitWeightReported: "—",
        unitWeightReportedLine: "—",
        unitWeightSourceNote: "",
        unitWeightMeanFromTab: "—",
        unitWeightMeanFromTabLine: "—",
        unitWeightPerSpecimen: [],
    };
    show.testConditions = false;
    const mRows = (measurements ?? []);
    const pointLoadSections = buildPointLoadPdfSections({
        project: {
            code: sample.borehole.project.code,
            name: sample.borehole.project.name,
            client_name: sample.borehole.project.client_name,
            location: sample.borehole.project.location,
        },
        borehole: { code: sample.borehole.code, name: sample.borehole.name },
        sample: {
            code: sample.code,
            depth_from: sample.depth_from,
            depth_to: sample.depth_to,
            lithology: sample.lithology,
        },
        testDateDisplay: testConditions.testDateDisplay,
        operatorDisplay: testConditions.operatorDisplay,
        deviceDisplay: testConditions.deviceDisplay,
        formulaVersion: test.formula_version,
        testNotes: test.notes,
        plMeta: plRep,
        ucsMeta: meta,
        measRows: mRows,
        resRows: rawRes,
        photosIncluded: Boolean(show.specimenPhotos),
    });
    return {
        generatedAt: new Date().toISOString(),
        templateCode,
        templateVersion,
        reportMainTitle: "Determinarea indicelui de rezistență point load (Is)",
        reportNormRef: "ISRM; ASTM D5731-16 — Point Load Strength Index of Rock",
        reportPageTitle: "Point load (Is) — ASTM D5731",
        project: {
            code: sample.borehole.project.code,
            name: sample.borehole.project.name,
            client_name: sample.borehole.project.client_name,
            location: sample.borehole.project.location,
        },
        borehole: {
            code: sample.borehole.code,
            name: sample.borehole.name,
            depth_total: sample.borehole.depth_total,
            elevation: sample.borehole.elevation,
        },
        sample: {
            code: sample.code,
            depth_from: sample.depth_from,
            depth_to: sample.depth_to,
            lithology: sample.lithology,
        },
        test: {
            id: test.id,
            test_type: test.test_type,
            status: test.status,
            conclusion: null,
            operator_name: test.operator_name,
            device_name: test.device_name,
            test_date: test.test_date,
            formula_version: test.formula_version,
            notes: test.notes,
            created_at: test.created_at ?? null,
            updated_at: test.updated_at ?? null,
            created_by: test.created_by ?? null,
            updated_by: test.updated_by ?? null,
        },
        measurements: (measurements ?? []).map((m) => ({
            label: normalizePdfLabel(m.label),
            key: m.key,
            value: fmtNum(m.value, 4),
            unit: m.unit ?? "",
        })),
        results: rawRes.map((r) => ({
            label: normalizePdfLabel(r.label),
            key: r.key,
            value: fmtNum(r.value, r.decimals ?? 3),
            unit: r.unit ?? "",
        })),
        show,
        charts: {},
        photos: {
            beforeSrc,
            afterSrc,
        },
        pltAstmFigures: show.pltAstmFigures ? pltAstmFigures : [],
        pointLoadSections,
        lab,
        footer: {
            formCode: "F-PL-ANCFD-D5731",
        },
        testConditions,
        signatures: {
            preparedBy: preparedByDisplay(test.prepared_by, test.operator_name),
            verifiedBy: displayTextField(test.verified_by),
        },
    };
}
export async function buildUnconfinedSoilPayload(supabase, testId, templateCode, templateVersion, sections) {
    const { data: test, error: tErr } = await supabase
        .from("tests")
        .select(`
      id, test_type, status, operator_name, device_name, prepared_by, verified_by, test_date, formula_version, notes,
      created_at, updated_at, created_by, updated_by,
      unconfined_soil_mode, unconfined_soil_curve_json, unconfined_soil_report_metadata_json, report_options_json,
      sample:samples (
        id, code, depth_from, depth_to, lithology, notes,
        borehole:boreholes (
          id, code, name, depth_total, elevation, notes,
          project:projects ( id, code, name, client_name, location, notes )
        )
      )
    `)
        .eq("id", testId)
        .single();
    if (tErr)
        throw tErr;
    const testTypeNorm = normalizeTestTypeForPayload(test?.test_type);
    if (!test || testTypeNorm !== "unconfined_soil") {
        throw new Error("Doar testele de compresiune monoaxială pământ (unconfined_soil) sunt suportate.");
    }
    const rawSample = test.sample;
    if (!rawSample || Array.isArray(rawSample)) {
        throw new Error("Date probă lipsă sau invalide.");
    }
    const sample = rawSample;
    if (!sample.borehole?.project) {
        throw new Error("Ierarhie incompletă (probă / foraj / proiect).");
    }
    const lab = await loadLabForReport(supabase);
    const [{ data: measurements }, { data: results }, taggedPhotos] = await Promise.all([
        supabase.from("test_measurements").select("*").eq("test_id", testId).order("display_order"),
        supabase.from("test_results").select("*").eq("test_id", testId).order("display_order"),
        supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .in("file_role", ["specimen_before", "specimen_after"]),
    ]);
    if (taggedPhotos.error)
        throw taggedPhotos.error;
    let photoRows = taggedPhotos.data;
    if (!photoRows || photoRows.length === 0) {
        const { data: allFiles, error: allErr } = await supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .order("uploaded_at", { ascending: true });
        if (allErr)
            throw allErr;
        const imgs = (allFiles ?? []).filter((r) => isImageTestFileRow(r));
        if (imgs.length > 0) {
            photoRows = imgs.slice(0, 2).map((r, i) => ({
                ...r,
                file_role: i === 0 ? "specimen_before" : "specimen_after",
            }));
        }
    }
    const show = {};
    for (const s of sections) {
        show[s] = true;
    }
    show.iso17892Section = true;
    show.soilOnlyTestConditions = true;
    const mode = test.unconfined_soil_mode === "instrumented"
        ? "instrumented"
        : "basic";
    const curvePayload = parseUnconfinedSoilCurvePayload(test.unconfined_soil_curve_json);
    const soilChartOpts = parseUnconfinedSoilChartOptions(test.report_options_json);
    const soilResOpts = parseUnconfinedSoilResultsOptions(test.report_options_json);
    const areaMm2 = unconfinedInitialAreaMm2(measurements ?? []);
    const heightMm = measurementNumber(measurements ?? [], "height_mm");
    const pts = curvePayload?.points ?? [];
    const baselineKn = unconfinedBaselineKn(pts, measurements ?? []);
    const series = mode === "instrumented" &&
        curvePayload &&
        Number.isFinite(heightMm) &&
        heightMm > 0 &&
        Number.isFinite(areaMm2) &&
        areaMm2 > 0
        ? stressStrainSeriesKpa(heightMm, areaMm2, pts, baselineKn)
        : [];
    const soilChartPoints = series.map((s) => ({
        strainPct: s.strain * 100,
        stressKpa: s.stress_kpa,
    }));
    const availSoilStressStrain = soilChartPoints.length >= 2;
    const incSoilStressStrain = mode === "instrumented" &&
        effectiveInclude(soilChartOpts.stress_strain, true) &&
        availSoilStressStrain;
    const charts = {};
    if (incSoilStressStrain) {
        const svgMain = soilStressStrainSvg(soilChartPoints, "σ – ε (principal)");
        if (svgMain)
            charts.soilStressStrainSvg = svgMain;
        const timeDual = series
            .filter((s) => s.t_s != null && Number.isFinite(s.t_s))
            .map((s) => ({
            t: s.t_s,
            strainPct: s.strain * 100,
            dispMm: s.disp_mm,
        }));
        if (timeDual.length >= 2) {
            const svgT = soilEpsilonDispTimeDualSvg(timeDual, "ε și ΔH – timp");
            if (svgT)
                charts.soilEpsilonDispTimeSvg = svgT;
        }
    }
    show.chartSoilStressStrain = Boolean(charts.soilStressStrainSvg);
    show.chartSoilEpsilonDispTime = Boolean(charts.soilEpsilonDispTimeSvg);
    show.chartSoilMohr = false;
    show.chartStressTime = false;
    show.chartLoadStrain = false;
    show.chartTimeLoad = false;
    const wantSpecimenPhotos = specimenPhotosIncludedInReport(test.report_options_json);
    let beforeSrc = null;
    let afterSrc = null;
    if (wantSpecimenPhotos && photoRows && photoRows.length > 0) {
        for (const row of photoRows) {
            const r = row;
            const src = await downloadImageDataUrl(supabase, r.file_path, r.file_type);
            if (r.file_role === "specimen_before")
                beforeSrc = src;
            if (r.file_role === "specimen_after")
                afterSrc = src;
        }
    }
    const sectionWantsPhotos = sections.includes("specimenPhotos");
    show.specimenPhotos =
        sectionWantsPhotos && wantSpecimenPhotos && (beforeSrc != null || afterSrc != null);
    const rawRes = (results ?? []);
    const meta = parseUnconfinedSoilReportMetadata(test.unconfined_soil_report_metadata_json);
    const gammaRows = rawRes
        .filter((r) => /^uw_subm_\d+_gamma_knm3$/.test(r.key))
        .sort((a, b) => {
        const ma = a.key.match(/^uw_subm_(\d+)_/);
        const mb = b.key.match(/^uw_subm_(\d+)_/);
        return (parseInt(ma?.[1] ?? "0", 10) || 0) - (parseInt(mb?.[1] ?? "0", 10) || 0);
    });
    const dryGammaSubUs = rawRes.find((r) => r.key === "gamma_dry_from_submerged_kn_m3");
    const calcGammaDryUs = dryGammaSubUs && dryGammaSubUs.value != null ? Number(dryGammaSubUs.value) : NaN;
    const dryRow = rawRes.find((r) => r.key === "dry_unit_weight_kn_m3");
    const calcGammaBulkUs = dryRow && dryRow.value != null ? Number(dryRow.value) : NaN;
    const gammaDecimals = (Number.isFinite(calcGammaDryUs) ? dryGammaSubUs?.decimals : dryRow?.decimals) ?? 2;
    const manualG = meta.manual_dry_unit_weight_kn_m3;
    let unitWeightReported;
    let unitWeightSourceNote;
    if (manualG != null && Number.isFinite(manualG)) {
        unitWeightReported = manualG.toFixed(2);
        unitWeightSourceNote = "Valoare manuală pentru raport.";
    }
    else if (Number.isFinite(calcGammaDryUs)) {
        unitWeightReported = calcGammaDryUs.toFixed(gammaDecimals);
        unitWeightSourceNote = "γ_d din γ aparentă (submersă) și umiditatea gravimetrică.";
    }
    else if (Number.isFinite(calcGammaBulkUs)) {
        unitWeightReported = calcGammaBulkUs.toFixed(gammaDecimals);
        unitWeightSourceNote =
            "γ aparentă (submersă); pentru γ_d completați umiditatea gravimetrică în tabul „Greutate volumică”.";
    }
    else {
        unitWeightReported = "—";
        unitWeightSourceNote = "";
    }
    const unitWeightMeanFromTab = Number.isFinite(calcGammaDryUs)
        ? calcGammaDryUs.toFixed(gammaDecimals)
        : Number.isFinite(calcGammaBulkUs)
            ? calcGammaBulkUs.toFixed(gammaDecimals)
            : "—";
    const unitWeightReportedLine = unitWeightReported === "—" ? "—" : `${unitWeightReported} kN/m³`;
    const unitWeightMeanFromTabLine = unitWeightMeanFromTab === "—" ? "—" : `${unitWeightMeanFromTab} kN/m³`;
    const unitWeightPerSpecimen = gammaRows.map((r) => ({
        label: r.label,
        value: fmtNum(r.value, r.decimals ?? 2),
    }));
    const metaMoistText = displayTextField(meta.sample_moisture ?? undefined);
    const wGrav = resultNumber(rawRes, "gravimetric_moisture_percent");
    let sampleMoistureDisplay;
    if (metaMoistText !== "—")
        sampleMoistureDisplay = metaMoistText;
    else if (Number.isFinite(wGrav))
        sampleMoistureDisplay = `${wGrav.toFixed(2)} % (gravimetric)`;
    else
        sampleMoistureDisplay = "—";
    const crMmMin = measurementNumber(measurements ?? [], "compression_rate_mm_min");
    const loadingRateLine = Number.isFinite(crMmMin) && crMmMin > 0
        ? fmtSig2(crMmMin, "mm/min")
        : displayTextField(meta.compression_rate_strain_pct_per_min ?? meta.compression_rate ?? undefined);
    const testConditions = {
        testDateDisplay: formatTestDateRo(test.test_date),
        operatorEquipment: operatorEquipmentLine(test.operator_name, test.device_name),
        operatorDisplay: displayTextField(test.operator_name),
        deviceDisplay: displayTextField(test.device_name),
        loadingRate: loadingRateLine,
        timeToFailure: displayTextField(meta.time_to_failure ?? undefined),
        failureMode: displayTextField(meta.failure_mode_description ?? undefined),
        sampleMoisture: metaMoistText,
        sampleMoistureDisplay,
        directionVsStructure: "—",
        dimensionalCompliance: "—",
        youngModulusMethod: "",
        unitWeightReported,
        unitWeightReportedLine,
        unitWeightSourceNote,
        unitWeightMeanFromTab,
        unitWeightMeanFromTabLine,
        unitWeightPerSpecimen,
    };
    if (meta.visual_description?.trim()) {
        testConditions.soilVisualDescription = displayTextField(meta.visual_description);
    }
    if (meta.specimen_type_procedure?.trim()) {
        testConditions.soilSpecimenTypeProcedure = displayTextField(meta.specimen_type_procedure);
    }
    if (meta.deviations?.trim()) {
        testConditions.soilDeviations = displayTextField(meta.deviations);
    }
    if (meta.failure_documentation?.trim()) {
        testConditions.soilFailureDocumentation = displayTextField(meta.failure_documentation);
    }
    show.testConditions = sections.includes("testConditions");
    const OMIT_RESULT_KEYS_REPORT = new Set([
        "dry_unit_weight_kn_m3",
        "gamma_dry_from_submerged_kn_m3",
        "dry_density_kg_m3",
        "vertical_strain_at_failure",
        "unconfined_seating_load_used_kn",
    ]);
    const resultsForReport = rawRes.filter((r) => {
        if (OMIT_RESULT_KEYS_REPORT.has(r.key))
            return false;
        if (r.key === "cu_kpa" && soilResOpts.include_cu_kpa === false)
            return false;
        if (r.key.startsWith("uw_subm_"))
            return false;
        return true;
    });
    const qu = resultNumber(rawRes, "qu_kpa");
    const epsFail = resultNumber(rawRes, "strain_at_failure_percent");
    const cuMohrPdf = soilResOpts.include_cu_kpa === false ? null : resultNumber(rawRes, "cu_kpa");
    if (Number.isFinite(qu) && qu > 0) {
        const m = soilMohrQuCuSvg(qu, cuMohrPdf != null && Number.isFinite(cuMohrPdf) ? cuMohrPdf : null);
        if (m)
            charts.soilMohrQuCuSvg = m;
    }
    show.chartSoilMohr = Boolean(charts.soilMohrQuCuSvg);
    show.ucsChartsSection =
        show.chartSoilStressStrain ||
            show.chartSoilEpsilonDispTime ||
            show.chartSoilMohr;
    const hasPhotos = Boolean(beforeSrc || afterSrc);
    const conformanceStatement = "Încercarea a fost efectuată în conformitate cu SR EN ISO 17892-7:2018.";
    const iso17892MandatoryRows = [
        {
            id: "a",
            label: "a) Identificare probă (foraj, probă, adâncime, selecție)",
            value: [
                `Foraj: ${sample.borehole.code}`,
                `Probă: ${sample.code}`,
                `Adâncime: ${fmtNum(sample.depth_from, 2)} – ${fmtNum(sample.depth_to, 2)} m`,
                meta.specimen_depth_in_sample_note?.trim()
                    ? `Detalii în eșantion: ${meta.specimen_depth_in_sample_note.trim()}`
                    : null,
                meta.sample_selection_method?.trim()
                    ? `Selecție: ${meta.sample_selection_method.trim()}`
                    : null,
            ]
                .filter(Boolean)
                .join(" · "),
        },
        {
            id: "b",
            label: "b) Descriere vizuală (ISO 14688-1)",
            value: [
                meta.visual_description?.trim() ? meta.visual_description.trim() : "—",
                meta.coarse_particle_note_1_10_d?.trim()
                    ? `> 1/10 D: ${meta.coarse_particle_note_1_10_d.trim()}`
                    : null,
                meta.coarse_particle_note_1_6_d?.trim()
                    ? `> 1/6 D: ${meta.coarse_particle_note_1_6_d.trim()}`
                    : null,
            ]
                .filter(Boolean)
                .join(" · "),
        },
        {
            id: "c",
            label: "c) Tip probă și procedură (nedistorsionată / preparată)",
            value: meta.specimen_type_procedure?.trim() ? meta.specimen_type_procedure.trim() : "—",
        },
        {
            id: "d",
            label: "d) Dimensiuni inițiale (mm)",
            value: [
                measurementText(measurements, "diameter_mm", 2) !== "—"
                    ? `D: ${measurementText(measurements, "diameter_mm", 2)}`
                    : null,
                measurementText(measurements, "side_mm", 2) !== "—"
                    ? `l: ${measurementText(measurements, "side_mm", 2)}`
                    : null,
                measurementText(measurements, "height_mm", 2) !== "—"
                    ? `H: ${measurementText(measurements, "height_mm", 2)}`
                    : null,
            ]
                .filter(Boolean)
                .join(" · ") || "—",
        },
        {
            id: "e",
            label: "e) Umiditate w (%)",
            value: measurementText(measurements, "water_content_percent", 2) !== "—"
                ? measurementText(measurements, "water_content_percent", 2)
                : sampleMoistureDisplay,
        },
        {
            id: "f",
            label: "f) Densitate volumică umedă ρ (Mg/m³)",
            value: measurementText(measurements, "bulk_density_mg_m3", 3),
        },
        {
            id: "g",
            label: "g) Densitate uscată ρ_d (Mg/m³)",
            value: measurementText(measurements, "dry_density_mg_m3", 3),
        },
        {
            id: "h",
            label: "h) Viteza de forfecare (mm/min) / rată compresie (%/min)",
            value: loadingRateLine,
        },
        {
            id: "i",
            label: "i) Rezistenta la compresiune monoaxiala q_u (kPa) (rotunjit)",
            value: Number.isFinite(qu) ? `${Math.round(qu)} kPa` : "—",
        },
        {
            id: "j",
            label: "j) Deformația specifică axială la momentul ruperii probei ε_v (%) (rotunjit la 0,1%)",
            value: Number.isFinite(epsFail) ? `${epsFail.toFixed(1)} %` : "—",
        },
        {
            id: "k",
            label: "k) Documentare mod eșec (descriere / schiță / foto)",
            value: (() => {
                const parts = [
                    meta.failure_documentation?.trim() ? meta.failure_documentation.trim() : null,
                    hasPhotos ? "Fotografii probă: da" : "Fotografii probă: nu",
                ].filter(Boolean);
                return parts.length ? parts.join(" · ") : "—";
            })(),
        },
        {
            id: "l",
            label: "l) Abateri de la procedură",
            value: meta.deviations?.trim() ? meta.deviations.trim() : "—",
        },
    ];
    return {
        generatedAt: new Date().toISOString(),
        templateCode,
        templateVersion,
        reportMainTitle: "Compresiune monoaxială a pământului",
        reportNormRef: "SR EN ISO 17892-7:2018 — Geotehnică. Încercări de laborator. Partea 7: încercare la compresiune monoaxială",
        reportPageTitle: "Compresiune monoaxială pământ — ISO 17892-7",
        conformanceStatement,
        project: {
            code: sample.borehole.project.code,
            name: sample.borehole.project.name,
            client_name: sample.borehole.project.client_name,
            location: sample.borehole.project.location,
        },
        borehole: {
            code: sample.borehole.code,
            name: sample.borehole.name,
            depth_total: sample.borehole.depth_total,
            elevation: sample.borehole.elevation,
        },
        sample: {
            code: sample.code,
            depth_from: sample.depth_from,
            depth_to: sample.depth_to,
            lithology: sample.lithology,
        },
        test: {
            id: test.id,
            test_type: test.test_type,
            status: test.status,
            conclusion: null,
            operator_name: test.operator_name,
            device_name: test.device_name,
            test_date: test.test_date,
            formula_version: test.formula_version,
            notes: test.notes,
            created_at: test.created_at ?? null,
            updated_at: test.updated_at ?? null,
            created_by: test.created_by ?? null,
            updated_by: test.updated_by ?? null,
        },
        measurements: (() => {
            const isSquare = measurementNumber(measurements, "unconfined_is_square") === 1;
            const OMIT_KEYS = new Set([
                // nu vrem aceste câmpuri în PDF
                "unconfined_seating_load_kn",
                "unconfined_subtract_initial_seating",
                "unconfined_disp_source",
            ]);
            return (measurements ?? [])
                .filter((m) => {
                if (OMIT_KEYS.has(m.key))
                    return false;
                // nu afișăm latura dacă secțiunea este cilindru
                if (!isSquare && m.key === "side_mm")
                    return false;
                return true;
            })
                .map((m) => {
                // Secțiune: afișăm cilindru/pătrat în loc de 0/1
                if (m.key === "unconfined_is_square") {
                    const vRaw = measurementNumber(measurements, "unconfined_is_square");
                    const shape = vRaw === 1 ? "pătrat" : "cilindru";
                    return {
                        label: normalizePdfLabel("Secțiune"),
                        key: m.key,
                        value: shape,
                        unit: "",
                    };
                }
                return {
                    label: normalizePdfLabel(unconfinedSoilPdfMeasurementLabel(m.key, m.label)),
                    key: m.key,
                    value: fmtNum(m.value, 2),
                    unit: m.unit ?? "",
                };
            });
        })(),
        results: resultsForReport.map((r) => ({
            label: normalizePdfLabel(unconfinedSoilPdfResultLabel(r.key, r.label)),
            key: r.key,
            value: fmtNum(r.value, r.decimals ?? 3),
            unit: r.unit ?? "",
        })),
        show,
        charts,
        photos: {
            beforeSrc,
            afterSrc,
        },
        lab,
        footer: {
            formCode: "F-PL-GTF.27.01",
        },
        testConditions,
        signatures: {
            preparedBy: preparedByDisplay(test.prepared_by, test.operator_name),
            verifiedBy: displayTextField(test.verified_by),
        },
        iso17892MandatoryRows,
    };
}
function parseAbsPorRock(raw) {
    if (!raw || typeof raw !== "object")
        return [];
    const s = raw.specimens;
    if (!Array.isArray(s))
        return [];
    const out = [];
    for (let i = 0; i < Math.min(3, s.length); i++) {
        const r = s[i];
        const o = r && typeof r === "object" ? r : {};
        const num = (v) => {
            if (v === null || v === undefined || v === "")
                return null;
            const n = Number(v);
            return Number.isFinite(n) ? n : null;
        };
        out.push({
            label: String(o.label ?? `Epr. ${i + 1}`).trim() || `Epr. ${i + 1}`,
            mass_dry_g: num(o.mass_dry_g),
            mass_sat_ssd_g: num(o.mass_sat_ssd_g),
            mass_submerged_g: num(o.mass_submerged_g),
        });
    }
    while (out.length < 3)
        out.push({ label: `Epr. ${out.length + 1}`, mass_dry_g: null, mass_sat_ssd_g: null, mass_submerged_g: null });
    return out;
}
function parseAbsPorMeta(raw) {
    const dash = "—";
    if (!raw || typeof raw !== "object") {
        return {
            standard_number: "SR EN ISO 13755",
            standard_title: "Natural stone — Determination of water absorption at atmospheric pressure",
            standard_issue_date: dash,
            test_location: dash,
            client_name_address: dash,
            stone_petrographic_name: dash,
            stone_commercial_name: dash,
            extraction_country_region: dash,
            supplier_name: dash,
            anisotropy_direction: dash,
            surface_finish: dash,
            sampling_by: dash,
            delivery_date: dash,
            preparation_date: dash,
            deviations: dash,
            remarks: dash,
        };
    }
    const o = raw;
    const txt = (k, fallback = dash) => {
        const v = o[k];
        if (v === null || v === undefined)
            return fallback;
        const s = String(v).trim();
        return s.length ? s : fallback;
    };
    return {
        standard_number: txt("standard_number", "SR EN ISO 13755"),
        standard_title: txt("standard_title", "Natural stone — Determination of water absorption at atmospheric pressure"),
        standard_issue_date: txt("standard_issue_date"),
        test_location: txt("test_location"),
        client_name_address: txt("client_name_address"),
        stone_petrographic_name: txt("stone_petrographic_name"),
        stone_commercial_name: txt("stone_commercial_name"),
        extraction_country_region: txt("extraction_country_region"),
        supplier_name: txt("supplier_name"),
        anisotropy_direction: txt("anisotropy_direction"),
        surface_finish: txt("surface_finish"),
        sampling_by: txt("sampling_by"),
        delivery_date: txt("delivery_date"),
        preparation_date: txt("preparation_date"),
        deviations: txt("deviations"),
        remarks: txt("remarks"),
    };
}
function absPorCalc(md, ms, msub) {
    const denomV = ms - msub;
    const absorption = ((ms - md) / md) * 100;
    const porosity = ((ms - md) / denomV) * 100;
    const rho = md / denomV;
    return { absorption_pct: absorption, porosity_pct: porosity, rho_g_cm3: rho };
}
function roundTo(n, step) {
    return Math.round(n / step) * step;
}
export async function buildAbsorptionPorosityRockPayload(supabase, testId, templateCode, templateVersion, sections) {
    const { data: test, error: tErr } = await supabase
        .from("tests")
        .select(`
      id, test_type, status, operator_name, device_name, prepared_by, verified_by, test_date, formula_version, notes,
      created_at, updated_at, created_by, updated_by,
      absorption_porosity_rock_json, absorption_porosity_rock_report_metadata_json, report_options_json,
      sample:samples (
        id, code, depth_from, depth_to, lithology, notes,
        borehole:boreholes (
          id, code, name, depth_total, elevation, notes,
          project:projects ( id, code, name, client_name, location, notes )
        )
      )
    `)
        .eq("id", testId)
        .single();
    if (tErr)
        throw tErr;
    if (!test || normalizeTestTypeForPayload(test.test_type) !== "absorption_porosity_rock") {
        throw new Error("Doar testele ISO 13755 (absorption_porosity_rock) sunt suportate.");
    }
    const rawSample = test.sample;
    if (!rawSample || Array.isArray(rawSample))
        throw new Error("Date probă lipsă sau invalide.");
    const sample = rawSample;
    if (!sample.borehole?.project)
        throw new Error("Ierarhie incompletă (probă / foraj / proiect).");
    const lab = await loadLabForReport(supabase);
    const [{ data: measurements }, { data: results }, taggedPhotos] = await Promise.all([
        supabase.from("test_measurements").select("*").eq("test_id", testId).order("display_order"),
        supabase.from("test_results").select("*").eq("test_id", testId).order("display_order"),
        supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .in("file_role", ["specimen_before", "specimen_after"]),
    ]);
    if (taggedPhotos.error)
        throw taggedPhotos.error;
    const show = {};
    for (const s of sections)
        show[s] = true;
    show.iso17892Section = false;
    show.soilOnlyTestConditions = false;
    const wantSpecimenPhotos = specimenPhotosIncludedInReport(test.report_options_json);
    let beforeSrc = null;
    let afterSrc = null;
    if (wantSpecimenPhotos && taggedPhotos.data && taggedPhotos.data.length > 0) {
        for (const row of taggedPhotos.data) {
            const r = row;
            const src = await downloadImageDataUrl(supabase, r.file_path, r.file_type);
            if (r.file_role === "specimen_before")
                beforeSrc = src;
            if (r.file_role === "specimen_after")
                afterSrc = src;
        }
    }
    show.specimenPhotos = Boolean(wantSpecimenPhotos && (beforeSrc || afterSrc));
    const rawRes = (results ?? []);
    const measRows = (measurements ?? []);
    const specimens = parseAbsPorRock(test.absorption_porosity_rock_json);
    const meta = parseAbsPorMeta(test.absorption_porosity_rock_report_metadata_json);
    const rows = specimens.map((s) => {
        const md = s.mass_dry_g;
        const ms = s.mass_sat_ssd_g;
        const msub = s.mass_submerged_g;
        const ok = md != null && ms != null && msub != null && md > 0 && ms - msub > 0;
        const calc = ok ? absPorCalc(md, ms, msub) : null;
        const abs01 = calc ? roundTo(calc.absorption_pct, 0.1) : NaN;
        return {
            label: s.label,
            mass_dry_g: fmtNum(md, 3),
            mass_sat_ssd_g: fmtNum(ms, 3),
            mass_submerged_g: fmtNum(msub, 3),
            absorption_percent: Number.isFinite(abs01) ? abs01.toFixed(1) : "—",
            apparent_porosity_percent: calc ? fmtNum(calc.porosity_pct, 2) : "—",
            bulk_density_g_cm3: calc ? fmtNum(calc.rho_g_cm3, 3) : "—",
            _abs_raw: calc?.absorption_pct ?? NaN,
            _por_raw: calc?.porosity_pct ?? NaN,
            _rho_raw: calc?.rho_g_cm3 ?? NaN,
        };
    });
    const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    const absMean01 = roundTo(mean(rows.map((r) => r._abs_raw).filter((x) => Number.isFinite(x))), 0.1);
    const porMean = mean(rows.map((r) => r._por_raw).filter((x) => Number.isFinite(x)));
    const rhoMean = mean(rows.map((r) => r._rho_raw).filter((x) => Number.isFinite(x)));
    const iso13755MandatoryRows = [
        { id: "a", label: "Număr unic de identificare raport", value: meta.standard_number ? meta.standard_number : "—" },
        { id: "b", label: "Număr / titlu / data emiterii standardului", value: `${meta.standard_number} — ${meta.standard_title}${meta.standard_issue_date !== "—" ? ` (${meta.standard_issue_date})` : ""}` },
        { id: "c", label: "Laborator (nume + adresă) / locație încercare (dacă diferă)", value: `${displayTextField(lab.companyName)}${lab.address ? `, ${lab.address}` : ""}${meta.test_location !== "—" ? `; locație: ${meta.test_location}` : ""}` },
        { id: "d", label: "Client (nume + adresă)", value: meta.client_name_address },
        { id: "e1", label: "Denumire petrografică", value: meta.stone_petrographic_name },
        { id: "e2", label: "Denumire comercială", value: meta.stone_commercial_name },
        { id: "e3", label: "Țara / regiunea de extracție", value: meta.extraction_country_region },
        { id: "e4", label: "Furnizor", value: meta.supplier_name },
        { id: "e5", label: "Direcția planului de anizotropie (dacă e relevant)", value: meta.anisotropy_direction },
        { id: "e6", label: "Finisaj suprafață (dacă e relevant)", value: meta.surface_finish },
        { id: "e7", label: "Prelevare efectuată de", value: meta.sampling_by },
        { id: "f", label: "Data livrării", value: meta.delivery_date },
        { id: "g", label: "Data preparării (dacă e relevant) / data încercării", value: `${meta.preparation_date}${test.test_date ? `; test: ${test.test_date}` : ""}` },
        { id: "h", label: "Număr epruvete în probă", value: "3" },
        { id: "j", label: "Absorbție apă la presiune atmosferică (pe epruvetă) + medie", value: `Epr.1–3: ${rows.map((r) => r.absorption_percent).join(", ")}; medie: ${Number.isFinite(absMean01) ? absMean01.toFixed(1) : "—"} %` },
        { id: "l", label: "Abateri de la standard + justificare", value: meta.deviations },
        { id: "m", label: "Observații", value: meta.remarks },
    ];
    const payload = {
        generatedAt: new Date().toISOString(),
        templateCode,
        templateVersion,
        reportMainTitle: "Determinarea absorbției de apă și porozității aparente (rocă)",
        reportNormRef: `${meta.standard_number} — ${meta.standard_title}`,
        reportPageTitle: `${meta.standard_number} — Absorbție apă / Porozitate`,
        project: {
            code: sample.borehole.project.code,
            name: sample.borehole.project.name,
            client_name: sample.borehole.project.client_name,
            location: sample.borehole.project.location,
        },
        borehole: {
            code: sample.borehole.code,
            name: sample.borehole.name,
            depth_total: sample.borehole.depth_total,
            elevation: sample.borehole.elevation,
        },
        sample: {
            code: sample.code,
            depth_from: sample.depth_from,
            depth_to: sample.depth_to,
            lithology: sample.lithology,
        },
        test: {
            id: test.id,
            test_type: test.test_type,
            status: test.status,
            conclusion: null,
            operator_name: test.operator_name,
            device_name: test.device_name,
            test_date: test.test_date,
            formula_version: test.formula_version,
            notes: test.notes,
            created_at: test.created_at ?? null,
            updated_at: test.updated_at ?? null,
            created_by: test.created_by ?? null,
            updated_by: test.updated_by ?? null,
        },
        measurements: measRows.map((m) => ({
            label: normalizePdfLabel(m.label),
            key: String(m.key ?? ""),
            value: fmtNum(m.value, 4),
            unit: String(m.unit ?? ""),
        })),
        results: rawRes.map((r) => ({
            label: normalizePdfLabel(r.label),
            key: r.key,
            value: fmtNum(r.value, r.decimals ?? 3),
            unit: r.unit ?? "",
        })),
        show,
        charts: {},
        photos: { beforeSrc, afterSrc },
        lab,
        footer: { formCode: "F-ISO13755" },
        testConditions: {
            testDateDisplay: formatTestDateRo(test.test_date ?? null),
            operatorEquipment: operatorEquipmentLine(test.operator_name ?? null, test.device_name ?? null),
            loadingRate: "—",
            timeToFailure: "—",
            failureMode: "—",
            sampleMoisture: "—",
            directionVsStructure: "—",
            dimensionalCompliance: "—",
            youngModulusMethod: "",
            unitWeightReported: "—",
            unitWeightReportedLine: "—",
            unitWeightSourceNote: "",
            unitWeightMeanFromTab: "—",
            unitWeightMeanFromTabLine: "—",
            unitWeightPerSpecimen: [],
            operatorDisplay: displayTextField(test.operator_name ?? null),
            deviceDisplay: displayTextField(test.device_name ?? null),
            sampleMoistureDisplay: "—",
        },
        signatures: {
            preparedBy: preparedByDisplay(test.prepared_by ?? null, test.operator_name ?? null),
            verifiedBy: displayTextField(test.verified_by ?? null),
        },
        iso13755MandatoryRows,
        absorptionPorosityRock: {
            specimens: rows.map((r) => ({
                label: r.label,
                mass_dry_g: r.mass_dry_g,
                mass_sat_ssd_g: r.mass_sat_ssd_g,
                mass_submerged_g: r.mass_submerged_g,
                absorption_percent: r.absorption_percent,
                apparent_porosity_percent: r.apparent_porosity_percent,
                bulk_density_g_cm3: r.bulk_density_g_cm3,
            })),
            mean: {
                absorption_percent: Number.isFinite(absMean01) ? absMean01.toFixed(1) : "—",
                apparent_porosity_percent: Number.isFinite(porMean) ? porMean.toFixed(2) : "—",
                bulk_density_g_cm3: Number.isFinite(rhoMean) ? rhoMean.toFixed(3) : "—",
            },
            meta,
        },
    };
    // For this report we show core sections.
    show.header = true;
    show.sampleInfo = true;
    show.measurements = false;
    show.results = false;
    show.testConditions = false;
    show.observations = true;
    show.signatures = true;
    show.footer = true;
    return payload;
}
export async function buildPresiometryPayload(supabase, testId, templateCode, templateVersion, sections, options) {
    const { data: test, error: tErr } = await supabase
        .from("tests")
        .select(`
      id, test_type, status, operator_name, device_name, prepared_by, verified_by, test_date, formula_version, notes,
      created_at, updated_at, created_by, updated_by,
      presiometry_settings_json, presiometry_report_metadata_json, report_options_json, presiometry_curve_json,
      sample:samples (
        id, code, depth_from, depth_to, lithology, notes,
        borehole:boreholes (
          id, code, name, depth_total, elevation, notes,
          project:projects ( id, code, name, client_name, location, notes )
        )
      )
    `)
        .eq("id", testId)
        .single();
    if (tErr)
        throw tErr;
    const tt = normalizeTestTypeForPayload(test.test_type);
    if (!test || (tt !== "presiometry_program_a" && tt !== "presiometry_program_b" && tt !== "presiometry_program_c")) {
        throw new Error("Doar testele presiometrie Program A/B/C sunt suportate.");
    }
    const loc = options?.locale === "en" ? "en" : "ro";
    const tr = presiometryStaticCopy(loc);
    const rawSample = test.sample;
    if (!rawSample || Array.isArray(rawSample))
        throw new Error("Date probă lipsă sau invalide.");
    const sample = rawSample;
    if (!sample.borehole?.project)
        throw new Error("Ierarhie incompletă (probă / foraj / proiect).");
    const lab = await loadLabForReport(supabase);
    const [{ data: measurements }, { data: results }, taggedPhotos] = await Promise.all([
        supabase.from("test_measurements").select("*").eq("test_id", testId).order("display_order"),
        supabase.from("test_results").select("*").eq("test_id", testId).order("display_order"),
        supabase
            .from("test_files")
            .select("file_path, file_role, file_type, file_name, uploaded_at")
            .eq("test_id", testId)
            .in("file_role", ["specimen_before", "specimen_after"]),
    ]);
    if (taggedPhotos.error)
        throw taggedPhotos.error;
    const show = {};
    for (const s of sections)
        show[s] = true;
    show.iso17892Section = false;
    show.soilOnlyTestConditions = false;
    show.pointLoadStructured = false;
    show.pltAstmFigures = false;
    /** Raport presiometrie: partial dedicat (fără câmpuri specifice încercări pe rocă / sol). */
    show.presiometryReport = true;
    const wantSpecimenPhotos = specimenPhotosIncludedInReport(test.report_options_json);
    let beforeSrc = null;
    let afterSrc = null;
    if (wantSpecimenPhotos && taggedPhotos.data && taggedPhotos.data.length > 0) {
        for (const row of taggedPhotos.data) {
            const r = row;
            const src = await downloadImageDataUrl(supabase, r.file_path, r.file_type);
            if (r.file_role === "specimen_before")
                beforeSrc = src;
            if (r.file_role === "specimen_after")
                afterSrc = src;
        }
    }
    const sectionWantsPhotos = sections.includes("specimenPhotos");
    show.specimenPhotos = sectionWantsPhotos && wantSpecimenPhotos && (beforeSrc != null || afterSrc != null);
    // Minimal report metadata (optional)
    const rawMeta = test.presiometry_report_metadata_json != null &&
        typeof test.presiometry_report_metadata_json === "object"
        ? test.presiometry_report_metadata_json
        : {};
    const startTime = typeof rawMeta.start_time === "string" ? rawMeta.start_time.trim() : "";
    const importDateIsoRaw = typeof rawMeta.import_test_date_iso === "string" ? String(rawMeta.import_test_date_iso).trim() : "";
    const importDateIso = /^\d{4}-\d{2}-\d{2}/.test(importDateIsoRaw) ? importDateIsoRaw.slice(0, 10) : "";
    const testDateSource = test.test_date?.toString().trim() || (importDateIso ? importDateIso : null);
    const curveRaw = test.presiometry_curve_json;
    const curveObj = curveRaw && typeof curveRaw === "object" ? curveRaw : null;
    const xKind = curveObj?.x_kind === "radius_mm" ? "radius_mm" : "volume_cm3";
    const ptsArr = Array.isArray(curveObj?.points) ? curveObj.points : [];
    const curvePts = ptsArr
        .map((p) => (p && typeof p === "object" ? p : null))
        .filter((p) => Boolean(p))
        .map((p) => {
        const p_kpa = Number(p.p_kpa);
        const r_mm = p.r_mm != null ? Number(p.r_mm) : Number(p.v_cm3);
        const v_cm3 = Number(p.v_cm3);
        const x = xKind === "radius_mm" ? r_mm : v_cm3;
        return { p_kpa, r_mm, v_cm3, x };
    })
        .filter((p) => Number.isFinite(p.p_kpa) && Number.isFinite(p.x));
    const measRows = measurements ?? [];
    /** Aliniat la web `src/lib/presiometry-defaults.ts`: sondă Ø76 mm → R așezare 38 mm. */
    const PMT_SEATING_R_MM_DEFAULT = 38;
    const seatingRMeas = measurementNumber(measRows, "pmt_seating_r_mm");
    const seatingR0 = xKind === "radius_mm"
        ? Number.isFinite(seatingRMeas) && seatingRMeas > 0
            ? seatingRMeas
            : PMT_SEATING_R_MM_DEFAULT
        : curvePts.length
            ? curvePts[0].x
            : 0;
    const overlaysPdf = tt !== "presiometry_program_c" && curvePts.length >= 2 && curveObj
        ? buildPresiometryPdfOverlays({
            testType: tt,
            xKind,
            curveObj,
            settingsJson: test.presiometry_settings_json,
            seatingR0: xKind === "radius_mm" ? seatingR0 : curvePts[0].x,
        })
        : null;
    const pvForMarkers = extractPvPointsPdf(curveObj);
    const v0pr = pvForMarkers[0]?.x ?? 0;
    const loopMarkersPr = [];
    const loopMarkersPdr = [];
    const yMpa = (pk) => pk / 1000;
    if (pvForMarkers.length >= 2) {
        loopMarkersPr.push({ x: pvForMarkers[0].x, y: yMpa(pvForMarkers[0].p_kpa), fill: "#1e8449" });
        const lastPv = pvForMarkers[pvForMarkers.length - 1];
        loopMarkersPr.push({ x: lastPv.x, y: yMpa(lastPv.p_kpa), fill: "#7b241c" });
        loopMarkersPdr.push({
            x: xKind === "radius_mm" ? pvForMarkers[0].x - seatingR0 : pvForMarkers[0].x - v0pr,
            y: yMpa(pvForMarkers[0].p_kpa),
            fill: "#1e8449",
        });
        loopMarkersPdr.push({
            x: xKind === "radius_mm" ? lastPv.x - seatingR0 : lastPv.x - v0pr,
            y: yMpa(lastPv.p_kpa),
            fill: "#7b241c",
        });
        const loopsM = detectLoopsByPressure(pvForMarkers);
        loopsM.slice(0, 10).forEach((w, idx) => {
            const i = idx + 1;
            const peak = pvForMarkers[w.peakIndex];
            const valley = pvForMarkers[w.valleyIndex];
            const nx = pvForMarkers[w.nextPeakIndex];
            const pushPair = (xPr, y, label, fill) => {
                loopMarkersPr.push({ x: xPr, y, label, fill });
                loopMarkersPdr.push({
                    x: xKind === "radius_mm" ? xPr - seatingR0 : xPr - v0pr,
                    y,
                    label,
                    fill,
                });
            };
            if (peak)
                pushPair(peak.x, yMpa(peak.p_kpa), `Vf${i}`, "#ca6f1e");
            if (valley)
                pushPair(valley.x, yMpa(valley.p_kpa), `Vl${i}`, "#6c3483");
            if (nx)
                pushPair(nx.x, yMpa(nx.p_kpa), `Vr${i}`, "#ca6f1e");
        });
    }
    const chartMarkersPr = loopMarkersPr.length ? loopMarkersPr : undefined;
    const chartMarkersPdr = loopMarkersPdr.length ? loopMarkersPdr : undefined;
    const svgPR = curvePts.length >= 2
        ? svgLineChart({
            title: xKind === "radius_mm" ? tr.chart_pR : tr.chart_pV,
            xLabel: xKind === "radius_mm" ? tr.axis_R_mm : tr.axis_V_cm3,
            yLabel: tr.axis_p_mpa,
            points: curvePts.map((p) => ({ x: p.x, y: p.p_kpa / 1000 })),
            padAxesRatio: tt !== "presiometry_program_c" ? 0.06 : undefined,
            bands: overlaysPdf?.bandsPr,
            segmentLines: overlaysPdf?.linesPr,
            markers: chartMarkersPr,
        })
        : null;
    const svgPdR = curvePts.length >= 2
        ? svgLineChart({
            title: xKind === "radius_mm" ? tr.chart_p_delta : tr.chart_p_dV,
            xLabel: xKind === "radius_mm" ? tr.axis_delta_mm : tr.axis_dV_cm3,
            yLabel: tr.axis_p_mpa,
            points: curvePts.map((p) => ({
                x: xKind === "radius_mm" ? p.r_mm - seatingR0 : p.v_cm3 - (curvePts[0]?.v_cm3 ?? 0),
                y: p.p_kpa / 1000,
            })),
            padAxesRatio: tt !== "presiometry_program_c" ? 0.06 : undefined,
            bands: overlaysPdf?.bandsPdr,
            segmentLines: overlaysPdf?.linesPdr,
            markers: chartMarkersPdr,
        })
        : null;
    const reportMainTitle = presiometryReportMainTitle(tt, loc);
    const reportNormRef = tr.norm;
    const reportPageTitle = presiometryPageTitle(tt, loc);
    const conformanceStatement = tr.conf_statement;
    const testConditions = {
        testDateDisplay: formatTestDateForReport(testDateSource, loc),
        operatorEquipment: "",
        loadingRate: "—",
        timeToFailure: "—",
        failureMode: "—",
        sampleMoisture: "—",
        directionVsStructure: "—",
        dimensionalCompliance: "—",
        youngModulusMethod: "",
        unitWeightReported: "—",
        unitWeightReportedLine: "—",
        unitWeightSourceNote: "",
        unitWeightMeanFromTab: "—",
        unitWeightMeanFromTabLine: "—",
        unitWeightPerSpecimen: [],
        operatorDisplay: displayTextField(test.operator_name ?? null),
        deviceDisplay: displayTextField(test.device_name ?? null),
        sampleMoistureDisplay: "—",
    };
    const signatures = {
        preparedBy: displayTextField(test.prepared_by ?? null),
        verifiedBy: displayTextField(test.verified_by ?? null),
    };
    return {
        generatedAt: new Date().toISOString(),
        templateCode,
        templateVersion,
        project: {
            code: sample.borehole.project.code,
            name: sample.borehole.project.name,
            client_name: sample.borehole.project.client_name ?? null,
            location: sample.borehole.project.location ?? null,
        },
        borehole: {
            code: sample.borehole.code,
            name: sample.borehole.name ?? null,
            depth_total: sample.borehole.depth_total ?? null,
            elevation: sample.borehole.elevation ?? null,
        },
        sample: {
            code: sample.code,
            depth_from: sample.depth_from ?? null,
            depth_to: sample.depth_to ?? null,
            lithology: sample.lithology ?? null,
        },
        test: {
            id: String(test.id ?? ""),
            test_type: tt,
            status: String(test.status ?? ""),
            conclusion: typeof rawMeta.conclusion === "string" ? rawMeta.conclusion : null,
            operator_name: test.operator_name ?? null,
            device_name: test.device_name ?? null,
            test_date: test.test_date ?? null,
            formula_version: test.formula_version ?? null,
            notes: test.notes ?? null,
            created_at: test.created_at ?? null,
            updated_at: test.updated_at ?? null,
            created_by: test.created_by ?? null,
            updated_by: test.updated_by ?? null,
        },
        measurements: (() => {
            /** Rânduri refăcute dedesubt (o singură apariție pentru packer / axă / oră). */
            const PRESIOMETRY_ROW_KEYS_PREPENDED = new Set(["pmt_series_axis", "pmt_packer_diameter_mm", "pmt_start_time"]);
            const base = (measurements ?? [])
                .filter((m) => !PRESIOMETRY_OMIT_MEASUREMENT_KEYS.has(String(m.key ?? "")))
                .filter((m) => !PRESIOMETRY_ROW_KEYS_PREPENDED.has(String(m.key ?? "")))
                .map((m) => {
                const key = String(m.key ?? "");
                const labelRo = String(m.label ?? key ?? "");
                return {
                    label: pmtMeasurementLabelForLocale(key, labelRo, loc),
                    key,
                    value: fmtNum(m.value, 3),
                    unit: String(m.unit ?? ""),
                };
            });
            const packer = (measurements ?? []).find((m) => m.key === "pmt_packer_diameter_mm");
            const packerVal = packer?.value;
            const packerNum = packerVal == null ? NaN : Number(packerVal);
            const hasPacker = Number.isFinite(packerNum) && packerNum > 0;
            const axisValue = xKind === "radius_mm" ? tr.series_axis_pr : tr.series_axis_pv;
            const axisNote = { label: tr.series_imported, key: "pmt_series_axis", value: axisValue, unit: "" };
            const out = [...base];
            if (startTime)
                out.unshift({ label: tr.start_time_csv, key: "pmt_start_time", value: startTime, unit: "" });
            if (hasPacker) {
                out.unshift({
                    label: tr.packer_diameter,
                    key: "pmt_packer_diameter_mm",
                    value: fmtNum(packerNum, 0),
                    unit: "mm",
                });
            }
            out.unshift(axisNote);
            return out;
        })(),
        results: (results ?? [])
            .filter((r) => !PRESIOMETRY_OMIT_RESULT_KEYS.has(String(r.key ?? "")))
            .map((r) => {
            const key = String(r.key ?? "");
            const labelRo = String(r.label ?? key ?? "");
            return {
                label: pmtTableLabelForLocale(key, labelRo, loc),
                key,
                value: fmtNum(r.value, r.decimals),
                unit: String(r.unit ?? ""),
            };
        }),
        show,
        charts: {
            ...(svgPR ? { presioPRSvg: svgPR } : null),
            ...(svgPdR ? { presioPdRSvg: svgPdR } : null),
        },
        photos: { beforeSrc, afterSrc },
        lab,
        footer: { formCode: "ISO-22476-5" },
        reportMainTitle,
        reportNormRef,
        reportPageTitle,
        conformanceStatement,
        testConditions,
        signatures,
        i18n: tr,
        htmlLang: tr.htmlLang,
    };
}
