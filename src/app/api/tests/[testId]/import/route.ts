import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { clampPresiometryCurveForStorage, parsePresiometryDelimited } from "@/lib/presiometry-curve";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import type { TestType } from "@/types/lab";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ testId: string }> };

function isPresiometryType(tt: unknown): tt is TestType {
  return (
    tt === "presiometry_program_a" ||
    tt === "presiometry_program_b" ||
    tt === "presiometry_program_c"
  );
}

function parseElastLoggerHeader(text: string): {
  dateIso?: string;
  time?: string;
  holeNo?: string;
  depthM?: number;
  tubeType?: string;
} | null {
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  if (!lines[0]?.toLowerCase().includes("elast logger")) return null;

  const out: ReturnType<typeof parseElastLoggerHeader> = {};
  for (const line of lines) {
    if (!line) continue;
    const lower = line.toLowerCase();
    if (lower.startsWith("number,")) break; // start of data table
    const parts = line.split(",").map((s) => s.trim());
    if (parts.length < 2) continue;
    const key = parts[0]!.toLowerCase();
    const val = parts.slice(1).join(",").trim();

    if (key.startsWith("date")) {
      // "2026-04-01"
      if (/^\d{4}-\d{2}-\d{2}$/.test(val)) out.dateIso = val;
    } else if (key.startsWith("time")) {
      // "14:22:40"
      if (/^\d{2}:\d{2}:\d{2}$/.test(val)) out.time = val;
    } else if (key.startsWith("hole no")) {
      out.holeNo = val || undefined;
    } else if (key.startsWith("depth")) {
      const n = Number(val.replace(",", "."));
      if (Number.isFinite(n)) out.depthM = n;
    } else if (key.startsWith("tube type")) {
      out.tubeType = val || undefined;
    }
  }

  return Object.keys(out).length ? out : null;
}

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const actor = getLabActorFromRequest(req, { fallbackUserId: auth.user.id });

    const { data: meta, error: metaErr } = await supabase
      .from("tests")
      .select("locked_by_user_id, lock_expires_at, test_type")
      .eq("id", testId)
      .single();
    if (metaErr) throw metaErr;
    if (isLockedByOther(meta, actor.userId)) {
      return NextResponse.json({ error: "Test blocat de alt post." }, { status: 423 });
    }
    if (!isPresiometryType((meta as { test_type?: unknown } | null)?.test_type)) {
      return NextResponse.json({ error: "Tip test nesuportat în această aplicație." }, { status: 400 });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size <= 0) {
      return NextResponse.json({ error: "Lipsește fișierul." }, { status: 400 });
    }

    const name = file.name.toLowerCase();
    if (!(name.endsWith(".txt") || name.endsWith(".csv") || name.endsWith(".tsv"))) {
      return NextResponse.json(
        {
          error:
            "Import presiometrie: folosiți TXT/CSV/TSV cu un header care conține presiunea (kPa/MPa/bar) și axa X (V în cm³ sau R/D în mm).",
        },
        { status: 400 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const text = buf.toString("utf-8");
    const parsed = parsePresiometryDelimited(text);
    if (!parsed) {
      return NextResponse.json(
        {
          error:
            "Nu am putut parsa seria. Verificați că există un rând de antet și cel puțin 2 puncte numerice. Format acceptat: p (kPa/MPa/bar) + V (cm³/ml/mm³) sau p + R/D (mm) pentru caliper; timp opțional.",
        },
        { status: 400 },
      );
    }

    const curveJson = clampPresiometryCurveForStorage(parsed);

    const hdr = parseElastLoggerHeader(text);

    const testPatch: Record<string, unknown> = {
      presiometry_curve_json: curveJson,
      updated_by: actor.displayName,
      updated_by_user_id: actor.userId,
    };
    if (hdr?.dateIso) {
      // store date of test from CSV
      testPatch.test_date = hdr.dateIso;
    }

    const { error: upCurveErr } = await supabase.from("tests").update(testPatch).eq("id", testId);
    if (upCurveErr) throw upCurveErr;

    // Upsert selected header fields into measurements (so they show in UI/PDF)
    if (hdr) {
      const rows: Array<{
        test_id: string;
        key: string;
        label: string;
        value: number | null;
        unit: string | null;
        display_order: number;
        source: "imported";
      }> = [];

      // Depth[m] -> pmt_depth_m
      if (hdr.depthM != null && Number.isFinite(hdr.depthM)) {
        rows.push({
          test_id: testId,
          key: "pmt_depth_m",
          label: "Adâncime test (z)",
          value: hdr.depthM,
          unit: "m",
          display_order: 10,
          source: "imported",
        });
      }

      // Tube type -> pmt_probe_type (NXH / NX etc.)
      if (hdr.tubeType?.trim()) {
        // stored as number field in current schema; keep as NULL and store actual text in test JSON later if needed
        // For now, we just mark device_name with tube type
        const dev = `Elast Logger 3i${hdr.tubeType ? ` · Tube ${hdr.tubeType}` : ""}`;
        await supabase
          .from("tests")
          .update({ device_name: dev, updated_by: actor.displayName, updated_by_user_id: actor.userId })
          .eq("id", testId);
      }

      // If there are rows, apply by delete+insert for these keys
      if (rows.length > 0) {
        const keys = rows.map((r) => r.key);
        await supabase.from("test_measurements").delete().eq("test_id", testId).in("key", keys);
        const { error: insMErr } = await supabase.from("test_measurements").insert(rows);
        if (insMErr) throw insMErr;
      }

      // Store the rest of header (holeNo, time) into presiometry_report_metadata_json for PDF visibility
      const metaPatch: Record<string, unknown> = {};
      if (hdr.holeNo) metaPatch.hole_no = hdr.holeNo;
      if (hdr.time) metaPatch.start_time = hdr.time;
      if (Object.keys(metaPatch).length > 0) {
        const { data: curRow } = await supabase
          .from("tests")
          .select("presiometry_report_metadata_json")
          .eq("id", testId)
          .single();
        const curMeta =
          curRow && typeof (curRow as { presiometry_report_metadata_json?: unknown }).presiometry_report_metadata_json === "object"
            ? ((curRow as { presiometry_report_metadata_json?: unknown }).presiometry_report_metadata_json as Record<string, unknown>)
            : {};
        const { error: upMetaErr } = await supabase
          .from("tests")
          .update({
            presiometry_report_metadata_json: { ...curMeta, ...metaPatch },
            updated_by: actor.displayName,
            updated_by_user_id: actor.userId,
          })
          .eq("id", testId);
        if (upMetaErr) throw upMetaErr;
      }
    }

    // Best-effort: store raw import file for traceability (non-fatal on failure)
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${testId}/${Date.now()}_${safeName}`;
    const { error: upErr } = await supabase.storage.from("lab-imports").upload(storagePath, buf, {
      contentType: file.type || "text/plain",
      upsert: false,
    });
    const storageOk = !upErr;

    return NextResponse.json({
      ok: true,
      presiometryCurveImported: true,
      points: curveJson.points.length,
      elastHeaderImported: Boolean(hdr),
      storagePath: storageOk ? storagePath : null,
      storageWarning: storageOk ? null : upErr?.message ?? "Upload Storage nereușit",
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

