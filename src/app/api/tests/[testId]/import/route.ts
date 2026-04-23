import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { clampCurveForStorage } from "@/lib/ucs-instrumentation";
import {
  looksLikeUcsMachineTab,
  parseUcsMachineTabExport,
  timeSecondsAtPeakStressFromCurve,
  timeSecondsAtPeakStressFromPoints,
  UCS_DEFAULT_STRAIN_SCALE,
} from "@/lib/ucs-curve-parse";
import {
  clampYoungCurveForStorage,
  looksLikeYoungMachineTab,
  parseYoungMachineTabExport,
} from "@/lib/young-curve-parse";
import { clampUcsReportMetadataForStorage } from "@/lib/ucs-report-metadata";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import { NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  clampUnconfinedSoilCurveForStorage,
  looksLikeUniframeControlsTab,
  parseUnconfinedSoilCurvePayload,
  parseUniframeControlsExport,
} from "@/lib/unconfined-soil-curve";
import {
  clampUnconfinedSoilReportMetadataForStorage,
  parseUnconfinedSoilReportMetadata,
} from "@/lib/unconfined-soil-report-metadata";
import { measurementsRowsToMap } from "@/modules/calculations";
import { unconfinedSoilInstrumentedPeakTimeS } from "@/modules/calculations/unconfinedSoil";
import { normalizeUcsMode } from "@/lib/ucs-instrumentation";
import {
  clampTriaxialCurveForStorage,
  looksLikeTriaxialMachineTab,
  parseTriaxialMachineTabExport,
} from "@/lib/triaxial-curve-parse";
import { clampPresiometryCurveForStorage, parsePresiometryDelimited } from "@/lib/presiometry-curve";

type Params = { params: Promise<{ testId: string }> };

function maxFinite(nums: Array<number | null | undefined>): number | null {
  let best = -Infinity;
  let ok = false;
  for (const x of nums) {
    if (x == null) continue;
    const n = Number(x);
    if (!Number.isFinite(n)) continue;
    if (!ok || n > best) {
      best = n;
      ok = true;
    }
  }
  return ok ? best : null;
}

function medianFinite(nums: Array<number | null | undefined>): number | null {
  const arr = nums
    .map((x) => (x == null ? NaN : Number(x)))
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);
  if (arr.length === 0) return null;
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 === 1 ? arr[mid]! : (arr[mid - 1]! + arr[mid]!) / 2;
}

function parseDelimited(text: string): { key: string; value: number | null }[] {
  const out: { key: string; value: number | null }[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  for (const line of lines) {
    const parts = (line.includes("\t") ? line.split("\t") : line.split(/[;,]/)).map((s) => s?.trim() ?? "");
    const a = parts[0];
    const b = parts[1];
    if (!a || a.toLowerCase() === "key") continue;
    const num = b !== undefined && b !== "" ? Number(b.replace(",", ".")) : NaN;
    out.push({ key: a, value: Number.isFinite(num) ? num : null });
  }
  return out;
}

function parseXlsx(buf: Buffer): { key: string; value: number | null }[] {
  const wb = XLSX.read(buf, { type: "buffer" });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as unknown as (string | number)[][];
  const out: { key: string; value: number | null }[] = [];
  for (const row of rows) {
    const a = String(row[0] ?? "").trim();
    const b = row[1];
    if (!a || a.toLowerCase() === "key") continue;
    const num = typeof b === "number" ? b : Number(String(b).replace(",", "."));
    out.push({ key: a, value: Number.isFinite(num) ? num : null });
  }
  return out;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const actor = getLabActorFromRequest(req);

    const { data: meta, error: metaErr } = await supabase
      .from("tests")
      .select("locked_by_user_id, lock_expires_at, test_type, ucs_mode")
      .eq("id", testId)
      .single();
    if (metaErr) throw metaErr;
    if (isLockedByOther(meta, actor.userId)) {
      return NextResponse.json({ error: "Test blocat de alt post." }, { status: 423 });
    }

    const form = await req.formData();
    const multiFiles = form
      .getAll("files")
      .filter((x): x is File => x instanceof File && x.size > 0);

    // Bulk import: only supported for triaxial_rock runs list
    if (multiFiles.length > 0) {
      if (meta.test_type !== "triaxial_rock") {
        return NextResponse.json({ error: "Import multiplu este disponibil doar pentru Triaxial rocă." }, { status: 400 });
      }

      const { data: mRowsTr, error: mErrTr } = await supabase
        .from("test_measurements")
        .select("key, value")
        .eq("test_id", testId);
      if (mErrTr) throw mErrTr;
      const byKeyTr = new Map((mRowsTr ?? []).map((r) => [r.key, r.value]));
      const diameterMm = Number(byKeyTr.get("diameter_mm"));
      const areaMm2 =
        Number.isFinite(diameterMm) && diameterMm > 0 ? Math.PI * (diameterMm / 2) ** 2 : null;

      const scaleRaw = byKeyTr.get("triaxial_strain_scale");
      const strainScale =
        scaleRaw != null && Number.isFinite(Number(scaleRaw)) && Number(scaleRaw) > 0 ? Number(scaleRaw) : 1e-6;
      const dispScaleRaw = byKeyTr.get("triaxial_displacement_scale_mm");
      const displacementScaleMm =
        dispScaleRaw != null && Number.isFinite(Number(dispScaleRaw)) && Number(dispScaleRaw) > 0
          ? Number(dispScaleRaw)
          : 1;

      const results: Array<{
        ok: boolean;
        fileName: string;
        runId?: string;
        storagePath?: string | null;
        sigma3Mpa?: number | null;
        peakQMpa?: number | null;
        sigma1Mpa?: number | null;
        warnings?: string[];
        error?: string;
        storageWarning?: string | null;
      }> = [];

      for (let i = 0; i < multiFiles.length; i++) {
        const file = multiFiles[i]!;
        try {
          const name = file.name.toLowerCase();
          const buf = Buffer.from(await file.arrayBuffer());
          const safeName = file.name.replace(/[^\w.\-]+/g, "_");
          const storagePath = `${testId}/${Date.now()}_${i + 1}_${safeName}`;

          let storageOk = false;
          const { error: upErr } = await supabase.storage.from("lab-imports").upload(storagePath, buf, {
            contentType: file.type || "application/octet-stream",
            upsert: false,
          });
          if (!upErr) storageOk = true;

          const text = buf.toString("utf-8");
          const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
          const firstLine = lines[0] ?? "";

          if (!(name.endsWith(".txt") || name.endsWith(".csv")) || !looksLikeTriaxialMachineTab(firstLine)) {
            throw new Error("Fișierul nu pare export tab Triaxial (TXT/CSV cu antet Time/Load și tab-uri).");
          }

          const { payload, warnings } = parseTriaxialMachineTabExport(text, {
            strainScale,
            displacementScaleMm,
          });
          if (payload.points.length < 2) {
            throw new Error(warnings?.join(" ") || "Parsare curbă triaxial eșuată.");
          }

          const sigma3Mpa = medianFinite(payload.points.map((p) => p.confining_ch13_mpa));

          // σ1,peak: prefer channel 1 (Load ch1) + specimen area; fallback to Stress(MPa) if present.
          const sigma1PeakMpa =
            areaMm2 != null
              ? (() => {
                  const maxLoadCh1 = maxFinite(payload.points.map((p) => p.load_ch1_kn));
                  if (maxLoadCh1 == null) return null;
                  // 1 MPa = 1 N/mm²; kN → N: *1000
                  return (maxLoadCh1 * 1000) / areaMm2;
                })()
              : null;

          const sigma1FromStressCol = maxFinite(payload.points.map((p) => p.stress_mpa));
          const sigma1Mpa = sigma1PeakMpa ?? sigma1FromStressCol ?? null;
          const peakQMpa = sigma3Mpa != null && sigma1Mpa != null ? sigma1Mpa - sigma3Mpa : null;

          const curveJson = clampTriaxialCurveForStorage(payload);
          const { data: inserted, error: insErr } = await supabase
            .from("triaxial_rock_runs")
            .insert({
              test_id: testId,
              file_name: file.name,
              storage_path: storagePath,
              curve_json: curveJson,
              sigma3_mpa: sigma3Mpa,
              peak_q_mpa: peakQMpa,
              sigma1_mpa: sigma1Mpa,
              import_warnings: warnings?.length ? warnings : null,
            })
            .select("id")
            .single();
          if (insErr) throw insErr;

          results.push({
            ok: true,
            fileName: file.name,
            runId: inserted?.id,
            storagePath: storageOk ? storagePath : null,
            sigma3Mpa,
            peakQMpa,
            sigma1Mpa,
            warnings,
            storageWarning: storageOk ? null : upErr?.message ?? "Upload Storage nereușit",
          });
        } catch (e) {
          results.push({
            ok: false,
            fileName: file.name,
            error: toErrorMessage(e),
          });
        }
      }

      await supabase
        .from("tests")
        .update({ updated_by: actor.displayName, updated_by_user_id: actor.userId })
        .eq("id", testId);

      return NextResponse.json({ ok: true, bulk: true, runs: results });
    }

    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Lipsește câmpul file." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    const buf = Buffer.from(await file.arrayBuffer());
    const storagePath = `${testId}/${Date.now()}_${file.name}`;

    let storageOk = false;
    const { error: upErr } = await supabase.storage.from("lab-imports").upload(storagePath, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (!upErr) storageOk = true;

    const text = buf.toString("utf-8");
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const firstLine = lines[0] ?? "";

    if (meta.test_type === "presiometry") {
      if (!(name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".tsv"))) {
        return NextResponse.json(
          { error: "Import presiometrie: folosiți TXT/CSV/TSV cu coloane p_kpa; v_cm3 (opțional t_s)." },
          { status: 400 },
        );
      }
      const parsed = parsePresiometryDelimited(text);
      if (!parsed) {
        return NextResponse.json(
          { error: "Nu am putut parsa seria presiometrie. Aștept coloane: p_kpa, v_cm3 (și opțional t_s)." },
          { status: 400 },
        );
      }
      const curveJson = clampPresiometryCurveForStorage(parsed);
      const { error: upCurveErr } = await supabase
        .from("tests")
        .update({
          presiometry_curve_json: curveJson,
          updated_by: actor.displayName,
          updated_by_user_id: actor.userId,
        })
        .eq("id", testId);
      if (upCurveErr) throw upCurveErr;
      return NextResponse.json({
        ok: true,
        presiometryCurveImported: true,
        points: curveJson.points.length,
        storagePath: storageOk ? storagePath : null,
        storageWarning: storageOk ? null : upErr?.message ?? "Upload Storage nereușit",
      });
    }

    let pairs: { key: string; value: number | null }[] = [];
    let curveImportWarnings: string[] | null = null;
    let ucsCurveImported = false;
    let ucsCurveMode: "basic" | "instrumented" | null = null;
    let timeToFailureFromCurve: string | null = null;
    let autoPeakLoadKn: number | null = null;
    let youngCurveImported = false;
    let unconfinedSoilCurveImported = false;
    let triaxialCurveImported = false;

    if (
      meta.test_type === "ucs" &&
      (name.endsWith(".txt") || name.endsWith(".csv")) &&
      looksLikeUcsMachineTab(firstLine)
    ) {
      const ucsMode = normalizeUcsMode((meta as { ucs_mode?: unknown }).ucs_mode);
      ucsCurveMode = ucsMode;
      const { data: mRows, error: mErr } = await supabase
        .from("test_measurements")
        .select("key, value")
        .eq("test_id", testId);
      if (mErr) throw mErr;
      const byKey = new Map((mRows ?? []).map((r) => [r.key, r.value]));
      let diam = Number(byKey.get("diameter_mm"));
      let height = Number(byKey.get("height_mm"));
      if (!Number.isFinite(diam) || diam <= 0) {
        const m = file.name.match(/[._-]d(\d+)/i);
        if (m) diam = Number(m[1]);
      }
      if (!Number.isFinite(height) || height <= 0) {
        const m = file.name.match(/[._-]l(\d+)/i);
        if (m) height = Number(m[1]);
      }
      if (!Number.isFinite(diam) || diam <= 0) {
        return NextResponse.json(
          {
            error:
              "Import curbă UCS: setați diameter_mm la măsurători sau folosiți d84 în numele fișierului (ex. probă_d84_l168.txt).",
          },
          { status: 400 },
        );
      }
      const scaleRaw = byKey.get("ucs_strain_scale");
      const strainScale =
        scaleRaw != null && Number.isFinite(Number(scaleRaw)) && Number(scaleRaw) > 0
          ? Number(scaleRaw)
          : UCS_DEFAULT_STRAIN_SCALE;
      const { payload, warnings } = parseUcsMachineTabExport(text, {
        diameterMm: diam,
        strainScale,
        heightMm: Number.isFinite(height) && height > 0 ? height : undefined,
        // Varianta Basic: ignorăm ch6–ch8 și importăm doar t–F / t–σ pentru grafice.
        requireStrain: ucsMode === "instrumented",
      });
      curveImportWarnings = warnings;
      if (payload.points.length === 0) {
        return NextResponse.json(
          { error: warnings.join(" ") || "Parsare curbă UCS eșuată." },
          { status: 400 },
        );
      }

      // Basic: completează automat sarcina de rupere (peak_load_kn) dacă lipsește.
      // IMPORTANT: nu scriem direct în DB aici, pentru că mai jos endpoint-ul reface tabelul
      // `test_measurements` (delete + insert). În schimb, adăugăm cheia în `pairs` ca să fie
      // inclusă în merge-ul standard.
      if (ucsMode === "basic") {
        const existingPeak = byKey.get("peak_load_kn");
        const existingPeakNum = existingPeak == null ? NaN : Number(existingPeak);
        const hasPeak = Number.isFinite(existingPeakNum) && existingPeakNum > 0;
        if (!hasPeak) {
          const areaMm2 = Math.PI * (diam / 2) ** 2;
          const maxLoadFromCurve = maxFinite(payload.points.map((p) => p.load_kn));
          const maxStress = maxFinite(payload.points.map((p) => p.stress_mpa));
          const peakKn =
            maxLoadFromCurve != null && maxLoadFromCurve > 0
              ? maxLoadFromCurve
              : maxStress != null && maxStress > 0
                ? (maxStress * areaMm2) / 1000
                : null;
          if (peakKn != null && Number.isFinite(peakKn) && peakKn > 0) {
            pairs = [{ key: "peak_load_kn", value: peakKn }];
            autoPeakLoadKn = peakKn;
          }
        }
      }

      const tPeakS = timeSecondsAtPeakStressFromCurve(payload);
      const curveUpdate: Record<string, unknown> = {
        ucs_curve_json: clampCurveForStorage(payload),
        // Respectăm varianta curentă: în Basic nu comutăm automat în UCS+Young.
        ucs_mode: ucsMode,
        updated_by: actor.displayName,
        updated_by_user_id: actor.userId,
      };
      if (tPeakS != null) {
        const { data: metaRow, error: metaSelErr } = await supabase
          .from("tests")
          .select("ucs_report_metadata_json")
          .eq("id", testId)
          .single();
        if (metaSelErr) throw metaSelErr;
        const prevRaw: Record<string, unknown> =
          metaRow?.ucs_report_metadata_json != null && typeof metaRow.ucs_report_metadata_json === "object"
            ? { ...(metaRow.ucs_report_metadata_json as Record<string, unknown>) }
            : {};
        const s =
          Number.isInteger(tPeakS) || Math.abs(tPeakS - Math.round(tPeakS)) < 1e-6
            ? String(Math.round(tPeakS))
            : String(Math.round(tPeakS * 1000) / 1000);
        timeToFailureFromCurve = `${s} s`;
        prevRaw.time_to_failure = timeToFailureFromCurve;
        curveUpdate.ucs_report_metadata_json = clampUcsReportMetadataForStorage(prevRaw);
      }

      const { error: cuErr } = await supabase.from("tests").update(curveUpdate).eq("id", testId);
      if (cuErr) throw cuErr;
      ucsCurveImported = true;
      if (!pairs || pairs.length === 0) pairs = [];
    } else if (
      meta.test_type === "young" &&
      (name.endsWith(".txt") || name.endsWith(".csv")) &&
      looksLikeYoungMachineTab(firstLine)
    ) {
      const { data: mRows, error: mErr } = await supabase
        .from("test_measurements")
        .select("key, value")
        .eq("test_id", testId);
      if (mErr) throw mErr;
      const byKey = new Map((mRows ?? []).map((r) => [r.key, r.value]));
      let diam = Number(byKey.get("diameter_mm"));
      let height = Number(byKey.get("height_mm"));
      if (!Number.isFinite(diam) || diam <= 0) {
        const m = file.name.match(/[._-]d(\d+)/i);
        if (m) diam = Number(m[1]);
      }
      if (!Number.isFinite(height) || height <= 0) {
        const m = file.name.match(/[._-]l(\d+)/i);
        if (m) height = Number(m[1]);
      }
      if (!Number.isFinite(height) || height <= 0) {
        return NextResponse.json(
          {
            error:
              "Import curbă Young: setați height_mm la măsurători sau folosiți l112 în numele fișierului (ex. probă_d54_l112.txt).",
          },
          { status: 400 },
        );
      }
      const { payload, warnings } = parseYoungMachineTabExport(text, {
        diameterMm: Number.isFinite(diam) && diam > 0 ? diam : undefined,
      });
      curveImportWarnings = warnings;
      if (payload.points.length === 0) {
        return NextResponse.json(
          { error: warnings.join(" ") || "Parsare curbă Young eșuată." },
          { status: 400 },
        );
      }
      const curveUpdate: Record<string, unknown> = {
        young_curve_json: clampYoungCurveForStorage(payload),
        young_mode: "no_gauges",
        updated_by: actor.displayName,
        updated_by_user_id: actor.userId,
      };
      const tPeakYoung = timeSecondsAtPeakStressFromPoints(payload.points);
      if (tPeakYoung != null) {
        const { data: metaRowY, error: metaSelYErr } = await supabase
          .from("tests")
          .select("ucs_report_metadata_json")
          .eq("id", testId)
          .single();
        if (metaSelYErr) throw metaSelYErr;
        const prevY: Record<string, unknown> =
          metaRowY?.ucs_report_metadata_json != null && typeof metaRowY.ucs_report_metadata_json === "object"
            ? { ...(metaRowY.ucs_report_metadata_json as Record<string, unknown>) }
            : {};
        const sY =
          Number.isInteger(tPeakYoung) || Math.abs(tPeakYoung - Math.round(tPeakYoung)) < 1e-6
            ? String(Math.round(tPeakYoung))
            : String(Math.round(tPeakYoung * 1000) / 1000);
        timeToFailureFromCurve = `${sY} s`;
        prevY.time_to_failure = timeToFailureFromCurve;
        curveUpdate.ucs_report_metadata_json = clampUcsReportMetadataForStorage(prevY);
      }
      const { error: yuErr } = await supabase.from("tests").update(curveUpdate).eq("id", testId);
      if (yuErr) throw yuErr;
      youngCurveImported = true;
      pairs = [];
    } else if (
      meta.test_type === "triaxial_rock" &&
      (name.endsWith(".txt") || name.endsWith(".csv")) &&
      looksLikeTriaxialMachineTab(firstLine)
    ) {
      const { data: mRowsTr, error: mErrTr } = await supabase
        .from("test_measurements")
        .select("key, value")
        .eq("test_id", testId);
      if (mErrTr) throw mErrTr;
      const byKeyTr = new Map((mRowsTr ?? []).map((r) => [r.key, r.value]));

      const scaleRaw = byKeyTr.get("triaxial_strain_scale");
      const strainScale =
        scaleRaw != null && Number.isFinite(Number(scaleRaw)) && Number(scaleRaw) > 0 ? Number(scaleRaw) : 1e-6;
      const dispScaleRaw = byKeyTr.get("triaxial_displacement_scale_mm");
      const displacementScaleMm =
        dispScaleRaw != null && Number.isFinite(Number(dispScaleRaw)) && Number(dispScaleRaw) > 0
          ? Number(dispScaleRaw)
          : 1;

      const { payload, warnings } = parseTriaxialMachineTabExport(text, {
        strainScale,
        displacementScaleMm,
      });
      curveImportWarnings = warnings;
      if (payload.points.length < 2) {
        return NextResponse.json(
          { error: warnings?.join(" ") || "Parsare curbă triaxial eșuată." },
          { status: 400 },
        );
      }

      const curveUpdate: Record<string, unknown> = {
        triaxial_curve_json: clampTriaxialCurveForStorage(payload),
        updated_by: actor.displayName,
        updated_by_user_id: actor.userId,
      };
      const { error: trUpErr } = await supabase.from("tests").update(curveUpdate).eq("id", testId);
      if (trUpErr) throw trUpErr;
      triaxialCurveImported = true;
      pairs = [];
    } else if (
      meta.test_type === "unconfined_soil" &&
      (name.endsWith(".txt") || name.endsWith(".tsv")) &&
      looksLikeUniframeControlsTab(firstLine)
    ) {
      const { data: mRowsUs, error: mErrUs } = await supabase
        .from("test_measurements")
        .select("key, value")
        .eq("test_id", testId);
      if (mErrUs) throw mErrUs;
      const byKeyUs = new Map((mRowsUs ?? []).map((r) => [r.key, r.value]));
      const dispSrcNum = byKeyUs.get("unconfined_disp_source");
      const dispSource =
        dispSrcNum != null && Number(dispSrcNum) === 0 ? ("first_mm" as const) : ("crosshead" as const);

      const { points: usPoints, warnings: usWarn } = parseUniframeControlsExport(text, {
        dispSource,
      });
      curveImportWarnings = usWarn;
      if (usPoints.length < 5) {
        return NextResponse.json(
          {
            error:
              usWarn.join(" ") || "Import Uniframe: prea puține puncte valide (minim 5).",
          },
          { status: 400 },
        );
      }
      const usPayload = clampUnconfinedSoilCurveForStorage({ version: 1, points: usPoints });
      const usCurveUpdate: Record<string, unknown> = {
        unconfined_soil_curve_json: usPayload,
        unconfined_soil_mode: "instrumented",
        updated_by: actor.displayName,
        updated_by_user_id: actor.userId,
      };

      // Auto-complete measurements from curve header/data if missing:
      // - baseline seating load = first load point
      // - subtract initial seating = 1 (default)
      const existingSeat = Number(byKeyUs.get("unconfined_seating_load_kn"));
      const hasSeat = Number.isFinite(existingSeat) && existingSeat > 0;
      const existingSub = Number(byKeyUs.get("unconfined_subtract_initial_seating"));
      const hasSub = Number.isFinite(existingSub) && (existingSub === 0 || existingSub === 1);
      const p0 = usPoints[0];
      if (p0 && Number.isFinite(p0.load_kn) && p0.load_kn >= 0) {
        if (!hasSeat) pairs.push({ key: "unconfined_seating_load_kn", value: p0.load_kn });
        if (!hasSub) pairs.push({ key: "unconfined_subtract_initial_seating", value: 1 });
      } else if (!hasSub) {
        // still prefer default subtraction behavior if not explicitly set
        pairs.push({ key: "unconfined_subtract_initial_seating", value: 1 });
      }

      const measurementMapUs = measurementsRowsToMap(
        (mRowsUs ?? []).map((r) => ({ key: r.key, value: r.value })),
      );
      const curveForTime = parseUnconfinedSoilCurvePayload(usPayload);
      const tPeakImp = unconfinedSoilInstrumentedPeakTimeS(measurementMapUs, curveForTime);
      if (tPeakImp != null) {
        const { data: usMetaRow, error: usMetaErr } = await supabase
          .from("tests")
          .select("unconfined_soil_report_metadata_json")
          .eq("id", testId)
          .single();
        if (usMetaErr) throw usMetaErr;
        const prevTf = parseUnconfinedSoilReportMetadata(
          usMetaRow?.unconfined_soil_report_metadata_json,
        ).time_to_failure;
        if ((prevTf ?? "").trim() === "") {
          const rawMeta: Record<string, unknown> =
            usMetaRow?.unconfined_soil_report_metadata_json != null &&
            typeof usMetaRow.unconfined_soil_report_metadata_json === "object"
              ? { ...(usMetaRow.unconfined_soil_report_metadata_json as Record<string, unknown>) }
              : {};
          const sT =
            Number.isInteger(tPeakImp) || Math.abs(tPeakImp - Math.round(tPeakImp)) < 1e-6
              ? String(Math.round(tPeakImp))
              : String(Math.round(tPeakImp * 1000) / 1000);
          rawMeta.time_to_failure = `${sT} s`;
          usCurveUpdate.unconfined_soil_report_metadata_json =
            clampUnconfinedSoilReportMetadataForStorage(rawMeta);
        }
      }
      const { error: usCuErr } = await supabase.from("tests").update(usCurveUpdate).eq("id", testId);
      if (usCuErr) throw usCuErr;
      unconfinedSoilCurveImported = true;
      pairs = [];
    } else if (name.endsWith(".csv") || name.endsWith(".txt")) {
      pairs = parseDelimited(text);
    } else if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
      pairs = parseXlsx(buf);
    } else {
      return NextResponse.json({ error: "Format nesuportat. Folosiți CSV, TXT sau XLSX." }, { status: 400 });
    }

    const { data: existingRows, error: exErr } = await supabase
      .from("test_measurements")
      .select("*")
      .eq("test_id", testId);
    if (exErr) throw exErr;

    const prevByKey = new Map((existingRows ?? []).map((r) => [r.key, r]));
    const importedKeys = new Set(pairs.map((p) => p.key));

    const kept = (existingRows ?? [])
      .filter((r) => !importedKeys.has(r.key))
      .map((r) => ({
        test_id: testId,
        key: r.key,
        label: r.label,
        value: r.value,
        unit: r.unit,
        display_order: r.display_order,
        source: r.source,
      }));

    const maxOrder = Math.max(0, ...(existingRows ?? []).map((r) => r.display_order ?? 0));
    let o = maxOrder;

    const fromFile = pairs.map((p) => {
      const prev = prevByKey.get(p.key);
      o += 10;
      return {
        test_id: testId,
        key: p.key,
        label: prev?.label ?? p.key,
        value: p.value,
        unit: prev?.unit ?? null,
        display_order: prev?.display_order ?? o,
        source: "imported" as const,
      };
    });

    const { error: delErr } = await supabase.from("test_measurements").delete().eq("test_id", testId);
    if (delErr) throw delErr;

    const merged = [...kept, ...fromFile];

    if (merged.length > 0) {
      const { error: insErr } = await supabase.from("test_measurements").insert(merged);
      if (insErr) throw insErr;
    }

    await supabase
      .from("tests")
      .update({ updated_by: actor.displayName, updated_by_user_id: actor.userId })
      .eq("id", testId);

    return NextResponse.json({
      ok: true,
      imported: pairs.length,
      ucsCurveImported,
      ucsCurveMode,
      autoPeakLoadKn,
      youngCurveImported,
      unconfinedSoilCurveImported,
      triaxialCurveImported,
      timeToFailureFromCurve,
      curveWarnings: curveImportWarnings,
      storagePath: storageOk ? storagePath : null,
      storageWarning: storageOk ? null : upErr?.message ?? "Upload Storage nereușit",
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
