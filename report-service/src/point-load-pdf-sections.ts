import type { PointLoadReportMetadata } from "./point-load-report-metadata.js";
import { classifyIs50MpaStrengthRoOrDash } from "./plt-is50-strength-class.js";
import type { UcsReportMetadata } from "./ucs-report-metadata.js";

/** Aliniat cu `web/src/lib/plt-d5731.ts` (K implicit pentru σ_uc). */
const PLT_DEFAULT_UCS_CORRELATION_K = 20;

export type PointLoadPdfSection = {
  num: string;
  title: string;
  note?: string;
  rows: Array<{ label: string; value: string }>;
};

function displayText(s: string | null | undefined): string {
  const t = (s ?? "").trim();
  return t.length ? t : "—";
}

/** Afișare numerică cu 3 cifre semnificative (dimensiuni, rezultate principale). */
export function fmtSig3(v: unknown): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  if (n === 0) return "0.00";
  const s = n.toPrecision(3);
  const x = Number(s);
  return Number.isFinite(x) ? String(x) : s;
}

function measNum(
  rows: Array<{ key: string; value: unknown }>,
  key: string,
): number | null {
  const r = rows.find((m) => m.key === key);
  if (!r || r.value === null || r.value === undefined) return null;
  const n = Number(r.value);
  return Number.isFinite(n) ? n : null;
}

function resNum(
  rows: Array<{ key: string; value: unknown }>,
  key: string,
): number | null {
  return measNum(rows, key);
}

function pltTestKindLabel(v: number | null): string {
  if (v == null) return "—";
  const k = Math.floor(v);
  const m: Record<number, string> = {
    1: "Diametral (d)",
    2: "Axial (a)",
    3: "Bloc (paralelipiped) (b)",
    4: "Neregulat (i)",
  };
  return m[k] ?? String(v);
}

function pltAnisotropyLabel(v: number | null): string {
  if (v == null) return "—";
  const k = Math.floor(v);
  if (k === 0) return "Perpendicular pe foliație / șistozitate (T)";
  if (k === 1) return "Paralel cu foliație / șistozitate (//)";
  return String(v);
}

function depthInterval(df: number | null, dt: number | null): string {
  if (df != null && dt != null) return `${df} – ${dt} m`;
  if (df != null) return `${df} m`;
  if (dt != null) return `${dt} m`;
  return "—";
}

export function buildPointLoadPdfSections(args: {
  project: { name: string; code: string; client_name: string | null; location: string | null };
  borehole: { code: string; name: string | null };
  sample: { code: string; depth_from: number | null; depth_to: number | null; lithology: string | null };
  testDateDisplay: string;
  operatorDisplay: string;
  deviceDisplay: string;
  formulaVersion: string | null;
  testNotes: string | null;
  plMeta: PointLoadReportMetadata;
  ucsMeta: UcsReportMetadata;
  measRows: Array<{ key: string; value: unknown }>;
  resRows: Array<{ key: string; value: unknown; decimals?: number }>;
  photosIncluded: boolean;
}): PointLoadPdfSection[] {
  const { plMeta: pl, ucsMeta: um, measRows, resRows } = args;

  const d = measNum(measRows, "plt_d_mm");
  const w = measNum(measRows, "plt_w_mm");
  const wMean = resNum(resRows, "plt_w_mean_mm");
  const w1 = measNum(measRows, "plt_w1_mm");
  const w2 = measNum(measRows, "plt_w2_mm");
  const w3 = measNum(measRows, "plt_w3_mm");
  const l = measNum(measRows, "plt_l_mm");
  const deDirect = measNum(measRows, "equivalent_diameter_mm");
  const peakKn = measNum(measRows, "peak_load_kn");
  const kMeas = measNum(measRows, "plt_ucs_correlation_k");
  const kind = measNum(measRows, "plt_test_kind");
  const aniso = measNum(measRows, "plt_anisotropy");

  const wWidthForDisplay = wMean ?? w;

  const deCalc = resNum(resRows, "plt_de_mm");
  const area = resNum(resRows, "plt_area_mm2");
  const pN = resNum(resRows, "plt_load_n");
  const fFac = resNum(resRows, "plt_size_factor_f");
  const isMpa = resNum(resRows, "is_mpa");
  const is50 = resNum(resRows, "is50_mpa");
  const ucsEst = resNum(resRows, "plt_ucs_estimated_mpa");
  const wPctCalc = resNum(resRows, "gravimetric_moisture_percent");
  const bulkRho = resNum(resRows, "bulk_density_g_cm3");
  const kApplied = resNum(resRows, "plt_k_applied");
  let kUcs: number | null = null;
  if (kApplied != null && kApplied > 0) kUcs = kApplied;
  else if (kMeas != null && kMeas > 0) kUcs = kMeas;
  else if (ucsEst != null && Number.isFinite(ucsEst)) kUcs = PLT_DEFAULT_UCS_CORRELATION_K;

  let areaDisp = "—";
  if (area != null) areaDisp = `${fmtSig3(area)} mm²`;
  else if (d != null && wWidthForDisplay != null)
    areaDisp = `${fmtSig3(d * wWidthForDisplay)} mm² (W·D)`;

  const moistureCombined = [
    displayText(um.sample_moisture ?? undefined),
    displayText(pl.moisture_condition_detail ?? undefined),
  ]
    .filter((x) => x !== "—")
    .join("; ") || "—";

  const loadVsWeak =
    displayText(pl.loading_vs_weakness_note ?? undefined) !== "—"
      ? displayText(pl.loading_vs_weakness_note ?? undefined)
      : pltAnisotropyLabel(aniso) !== "—" || displayText(um.direction_vs_structure ?? undefined) !== "—"
        ? [pltAnisotropyLabel(aniso), displayText(um.direction_vs_structure ?? undefined)]
            .filter((x) => x !== "—")
            .join(" · ")
        : "—";

  const s1: PointLoadPdfSection = {
    num: "1",
    title: "Informații generale despre probă",
    rows: [
      { label: "Nume proiect", value: displayText(args.project.name) },
      { label: "Client", value: displayText(args.project.client_name) },
      { label: "Amplasament", value: displayText(args.project.location) },
      { label: "Cod foraj", value: displayText(args.borehole.code) },
      { label: "Număr foraj", value: displayText(args.borehole.name) },
      { label: "Număr probă", value: displayText(args.sample.code) },
      { label: "Adâncime test (m)", value: depthInterval(args.sample.depth_from, args.sample.depth_to) },
      ...(displayText(args.sample.lithology) !== "—"
        ? [{ label: "Litologie", value: displayText(args.sample.lithology) }]
        : []),
    ],
  };

  const s2: PointLoadPdfSection = {
    num: "2",
    title: "Descrierea fizică a probei",
    rows: [
      { label: "Tipul rocii (litologie)", value: displayText(args.sample.lithology) },
      { label: "Mod geometrie test (ASTM)", value: pltTestKindLabel(kind) },
      { label: "Încărcare față de structură (cod măsurătoare 0/1)", value: pltAnisotropyLabel(aniso) },
    ],
  };

  const equipParts: string[] = [];
  if (displayText(args.deviceDisplay) !== "—") equipParts.push(displayText(args.deviceDisplay));
  const tipMod = [displayText(pl.equipment_type), displayText(pl.equipment_model)]
    .filter((x) => x !== "—")
    .join(" ");
  if (tipMod) equipParts.push(tipMod);
  const equipLine = equipParts.length ? equipParts.join(" — ") : "—";

  const s3: PointLoadPdfSection = {
    num: "3",
    title: "Informații despre testare",
    rows: [
      { label: "Data testării", value: displayText(args.testDateDisplay) },
      { label: "Personal (operator)", value: displayText(args.operatorDisplay) },
      { label: "Echipament (denumire, tip, model)", value: equipLine },
      { label: "Versiune formule / standard (aplicație)", value: displayText(args.formulaVersion) },
    ],
  };

  const wPct =
    pl.water_content_percent != null && Number.isFinite(pl.water_content_percent)
      ? `${fmtSig3(pl.water_content_percent)} %`
      : "—";

  const s4: PointLoadPdfSection = {
    num: "4",
    title: "Starea de umiditate",
    rows: [
      { label: "Condiție probă și detalii umiditate", value: moistureCombined },
      { label: "Conținut de apă (cantitativ), dacă e cazul", value: wPct },
    ],
  };

  const s5: PointLoadPdfSection = {
    num: "5",
    title: "Dimensiuni și măsurători",
    note: "Valorile numerice sunt afișate cu 3 cifre semnificative.",
    rows: [
      { label: "D — distanța între punctele de contact (mm)", value: fmtSig3(d) },
      ...(Math.floor(kind ?? NaN) === 4
        ? [
            { label: "W1 — neregulat (mm)", value: fmtSig3(w1) },
            { label: "W2 — neregulat (mm)", value: fmtSig3(w2) },
            { label: "W3 — neregulat (mm)", value: fmtSig3(w3) },
          ]
        : []),
      {
        label: "W — lățime ⊥ direcția sarcinii / mediu (W1+W2+W3)/3 dacă e cazul (mm)",
        value: fmtSig3(wWidthForDisplay),
      },
      { label: "L — distanță punct de contact – față liberă (mm)", value: fmtSig3(l) },
      { label: "De — introdus direct (mm), dacă s-a folosit", value: fmtSig3(deDirect) },
      { label: "Aria minimă a secțiunii A (mm²)", value: areaDisp },
      { label: "De — diametru echivalent core (din calcule) (mm)", value: fmtSig3(deCalc) },
    ],
  };

  const pKnStr = peakKn != null ? `${fmtSig3(peakKn)} kN` : "—";
  const pNStr = pN != null ? `${fmtSig3(pN)} N` : "—";
  const pCombined =
    pKnStr !== "—" && pNStr !== "—"
      ? `${pKnStr} (${pNStr})`
      : pKnStr !== "—"
        ? pKnStr
        : pNStr;

  const s6: PointLoadPdfSection = {
    num: "6",
    title: "Datele brute ale încercării",
    rows: [
      { label: "Sarcina maximă aplicată P", value: pCombined },
      { label: "Mod de încărcare față de foliație / șistozitate / structură", value: loadVsWeak },
    ],
  };

  const wManual =
    pl.water_content_percent != null && Number.isFinite(pl.water_content_percent)
      ? pl.water_content_percent
      : null;
  const wForDisplay = wPctCalc ?? wManual;
  const s7: PointLoadPdfSection = {
    num: "7",
    title: "Rezultate calculate",
    rows: [
      { label: "Is — indice de rezistență la punct (necorectat) (MPa)", value: isMpa != null ? fmtSig3(isMpa) : "—" },
      { label: "Is(50) — corectat la De = 50 mm (MPa)", value: is50 != null ? fmtSig3(is50) : "—" },
      { label: "K — factor corecție (De/50)^0,45", value: fFac != null ? fmtSig3(fFac) : "—" },
      { label: "Conținut de apă w (%)", value: wForDisplay != null ? fmtSig3(wForDisplay) : "—" },
      { label: "Densitate aparentă ρ (metodă submersă / parafină, dacă e completat) (g/cm³)", value: bulkRho != null ? fmtSig3(bulkRho) : "—" },
    ],
  };

  const ucsStr = ucsEst != null ? `${fmtSig3(ucsEst)} MPa` : "—";
  const rockClassStored = displayText(pl.rock_strength_class);
  const rockClass =
    rockClassStored !== "—" ? rockClassStored : classifyIs50MpaStrengthRoOrDash(is50);
  const s8: PointLoadPdfSection = {
    num: "8",
    title: "Rezultate interpretate",
    rows: [
      { label: "σc — rezistență la compresiune uniaxială estimată (σ_uc ≈ K·Is(50))", value: ucsStr },
      {
        label: "Clasificarea rezistenței rocii (după Is(50), orientativ ISRM)",
        value: rockClass,
      },
    ],
  };

  const photoLine = args.photosIncluded
    ? "Da — fotografii înainte/după în secțiunea dedicată a raportului."
    : "Nu sunt incluse în acest PDF (opțiune dezactivată sau fișiere indisponibile).";

  const testNotesLine = displayText(args.testNotes);
  const s9: PointLoadPdfSection = {
    num: "9",
    title: "Elemente suplimentare",
    rows: [
      { label: "Fotografii înainte și după test", value: photoLine },
      ...(testNotesLine !== "—"
        ? [{ label: "Observații test (câmp note probă)", value: testNotesLine }]
        : []),
    ],
  };

  const sections = [s1, s2, s3, s4, s5, s6, s7, s8, s9];
  return sections.map((s, i) => ({ ...s, num: String(i + 1) }));
}
