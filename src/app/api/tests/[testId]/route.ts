import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { clampPointLoadReportMetadataForStorage } from "@/lib/point-load-report-metadata";
import { clampUcsReportMetadataForStorage } from "@/lib/ucs-report-metadata";
import { clampUnitWeightSubmergedPayload } from "@/lib/unit-weight-submerged";
import { clampCurveForStorage, parseUcsCurvePayload } from "@/lib/ucs-instrumentation";
import {
  clampUnconfinedSoilCurveForStorage,
  parseUnconfinedSoilCurvePayload,
} from "@/lib/unconfined-soil-curve";
import { clampUnconfinedSoilReportMetadataForStorage } from "@/lib/unconfined-soil-report-metadata";
import { clampYoungCurveForStorage, type YoungCurvePayload } from "@/lib/young-curve-parse";
import { clampTriaxialCurveForStorage, type TriaxialCurvePayload } from "@/lib/triaxial-curve-parse";
import {
  clampAbsorptionPorosityRockPayloadForStorage,
  clampAbsorptionPorosityRockReportMetadataForStorage,
} from "@/lib/absorption-porosity-rock";
import {
  clampPresiometryCurveForStorage,
  parsePresiometryCurvePayload,
  type PresiometryCurvePayload,
} from "@/lib/presiometry-curve";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ testId: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;

    const { data: test, error: testError } = await supabase
      .from("tests")
      .select(
        `
        *,
        sample:samples (
          *,
          borehole:boreholes (
            *,
            project:projects (*)
          )
        )
      `,
      )
      .eq("id", testId)
      .is("deleted_at", null)
      .single();

    if (testError) throw testError;

    const [{ data: measurements, error: mErr }, { data: results, error: rErr }, { data: files, error: fErr }, { data: reports, error: repErr }] =
      await Promise.all([
        supabase
          .from("test_measurements")
          .select("*")
          .eq("test_id", testId)
          .order("display_order", { ascending: true }),
        supabase.from("test_results").select("*").eq("test_id", testId).order("display_order", { ascending: true }),
        supabase.from("test_files").select("*").eq("test_id", testId).order("uploaded_at", { ascending: false }),
        supabase.from("reports").select("*").eq("test_id", testId).order("generated_at", { ascending: false }),
      ]);

    if (mErr) throw mErr;
    if (rErr) throw rErr;
    if (fErr) throw fErr;
    if (repErr) throw repErr;

    return NextResponse.json({
      test,
      measurements: measurements ?? [],
      results: results ?? [],
      files: files ?? [],
      reports: reports ?? [],
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const actor = getLabActorFromRequest(req);
    const body = (await req.json()) as Record<string, unknown>;

    const { data: existing, error: exErr } = await supabase
      .from("tests")
      .select("locked_by_user_id, lock_expires_at")
      .eq("id", testId)
      .single();
    if (exErr) throw exErr;
    if (isLockedByOther(existing, actor.userId)) {
      return NextResponse.json(
        { error: "Test blocat de alt post. Preluați blocarea sau așteptați expirarea." },
        { status: 423 },
      );
    }

    const patch: Record<string, unknown> = {
      updated_by: actor.displayName,
      updated_by_user_id: actor.userId,
    };
    if (body.status != null) patch.status = body.status;
    if (body.operator_name !== undefined) patch.operator_name = body.operator_name;
    if (body.device_name !== undefined) patch.device_name = body.device_name;
    if (body.prepared_by !== undefined) patch.prepared_by = body.prepared_by;
    if (body.verified_by !== undefined) patch.verified_by = body.verified_by;
    if (body.test_date !== undefined) patch.test_date = body.test_date;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.formula_version !== undefined) patch.formula_version = body.formula_version;

    if (body.ucs_mode !== undefined) {
      const m = String(body.ucs_mode);
      if (m === "basic" || m === "instrumented") patch.ucs_mode = m;
    }
    if (body.ucs_curve_json !== undefined) {
      if (body.ucs_curve_json === null) {
        patch.ucs_curve_json = null;
      } else {
        const parsed = parseUcsCurvePayload(body.ucs_curve_json);
        if (!parsed) {
          return NextResponse.json({ error: "ucs_curve_json invalid (lipsește points)." }, { status: 400 });
        }
        patch.ucs_curve_json = clampCurveForStorage(parsed);
      }
    }
    if (body.ucs_modulus_settings_json !== undefined) {
      patch.ucs_modulus_settings_json =
        body.ucs_modulus_settings_json === null ? null : body.ucs_modulus_settings_json;
    }
    if (body.unit_weight_submerged_json !== undefined) {
      if (body.unit_weight_submerged_json === null) {
        patch.unit_weight_submerged_json = null;
      } else {
        patch.unit_weight_submerged_json = clampUnitWeightSubmergedPayload(body.unit_weight_submerged_json);
      }
    }
    if (body.ucs_report_metadata_json !== undefined) {
      if (body.ucs_report_metadata_json === null) {
        patch.ucs_report_metadata_json = null;
      } else if (body.ucs_report_metadata_json && typeof body.ucs_report_metadata_json === "object") {
        patch.ucs_report_metadata_json = clampUcsReportMetadataForStorage(body.ucs_report_metadata_json);
      } else {
        return NextResponse.json({ error: "ucs_report_metadata_json invalid." }, { status: 400 });
      }
    }

    if (body.point_load_report_metadata_json !== undefined) {
      if (body.point_load_report_metadata_json === null) {
        patch.point_load_report_metadata_json = null;
      } else if (
        body.point_load_report_metadata_json &&
        typeof body.point_load_report_metadata_json === "object"
      ) {
        patch.point_load_report_metadata_json = clampPointLoadReportMetadataForStorage(
          body.point_load_report_metadata_json,
        );
      } else {
        return NextResponse.json({ error: "point_load_report_metadata_json invalid." }, { status: 400 });
      }
    }

    if (body.report_options_json !== undefined) {
      if (body.report_options_json === null) {
        patch.report_options_json = null;
      } else if (body.report_options_json && typeof body.report_options_json === "object") {
        const ro = body.report_options_json as Record<string, unknown>;
        const ucs = ro.ucs_charts;
        const sanitized: Record<string, unknown> = {};
        if (ucs && typeof ucs === "object") {
          const u = ucs as Record<string, unknown>;
          const charts: Record<string, boolean> = {};
          for (const k of [
            "stress_strain",
            "sarcina_axial",
            "time_load",
            "stress_time",
            "result_bar",
          ] as const) {
            if (k in u) charts[k] = Boolean(u[k]);
          }
          if (Object.keys(charts).length > 0) sanitized.ucs_charts = charts;
        }
        const sp = ro.specimen_photos;
        if (sp && typeof sp === "object" && "include" in sp) {
          sanitized.specimen_photos = { include: Boolean((sp as Record<string, unknown>).include) };
        }
        const pl = ro.plt_astm_figures;
        if (pl && typeof pl === "object" && "include" in pl) {
          sanitized.plt_astm_figures = { include: Boolean((pl as Record<string, unknown>).include) };
        }
        const usc = ro.unconfined_soil_charts;
        if (usc && typeof usc === "object" && "stress_strain" in usc) {
          sanitized.unconfined_soil_charts = {
            stress_strain: Boolean((usc as Record<string, unknown>).stress_strain),
          };
        }
        const usr = ro.unconfined_soil_results;
        if (usr && typeof usr === "object" && "include_cu_kpa" in usr) {
          sanitized.unconfined_soil_results = {
            include_cu_kpa: Boolean((usr as Record<string, unknown>).include_cu_kpa),
          };
        }
        patch.report_options_json = Object.keys(sanitized).length > 0 ? sanitized : {};
      } else {
        return NextResponse.json({ error: "report_options_json invalid." }, { status: 400 });
      }
    }

    if (body.young_mode !== undefined) {
      const m = String(body.young_mode);
      if (m === "no_gauges" || m === "gauges") patch.young_mode = m;
    }
    if (body.young_settings_json !== undefined) {
      if (body.young_settings_json === null) {
        patch.young_settings_json = null;
      } else if (body.young_settings_json && typeof body.young_settings_json === "object") {
        patch.young_settings_json = body.young_settings_json;
      } else {
        return NextResponse.json({ error: "young_settings_json invalid." }, { status: 400 });
      }
    }
    if (body.young_curve_json !== undefined) {
      if (body.young_curve_json === null) {
        patch.young_curve_json = null;
      } else if (body.young_curve_json && typeof body.young_curve_json === "object") {
        // minimal validation: must have points[]
        const pts = (body.young_curve_json as Record<string, unknown>).points;
        if (!Array.isArray(pts)) {
          return NextResponse.json({ error: "young_curve_json invalid (lipsește points)." }, { status: 400 });
        }
        patch.young_curve_json = clampYoungCurveForStorage(body.young_curve_json as YoungCurvePayload);
      } else {
        return NextResponse.json({ error: "young_curve_json invalid." }, { status: 400 });
      }
    }

    if (body.unconfined_soil_mode !== undefined) {
      const m = String(body.unconfined_soil_mode);
      if (m === "basic" || m === "instrumented") patch.unconfined_soil_mode = m;
    }
    if (body.unconfined_soil_curve_json !== undefined) {
      if (body.unconfined_soil_curve_json === null) {
        patch.unconfined_soil_curve_json = null;
      } else {
        const parsed = parseUnconfinedSoilCurvePayload(body.unconfined_soil_curve_json);
        if (!parsed) {
          return NextResponse.json(
            { error: "unconfined_soil_curve_json invalid (lipsește points)." },
            { status: 400 },
          );
        }
        patch.unconfined_soil_curve_json = clampUnconfinedSoilCurveForStorage(parsed);
      }
    }

    if (body.presiometry_curve_json !== undefined) {
      if (body.presiometry_curve_json === null) {
        patch.presiometry_curve_json = null;
      } else {
        const parsed = parsePresiometryCurvePayload(body.presiometry_curve_json);
        if (!parsed) {
          return NextResponse.json(
            { error: "presiometry_curve_json invalid (lipsește points sau puncte invalide)." },
            { status: 400 },
          );
        }
        patch.presiometry_curve_json = clampPresiometryCurveForStorage(parsed as PresiometryCurvePayload);
      }
    }

    if (body.presiometry_settings_json !== undefined) {
      patch.presiometry_settings_json = body.presiometry_settings_json === null ? null : body.presiometry_settings_json;
    }

    if (body.presiometry_report_metadata_json !== undefined) {
      patch.presiometry_report_metadata_json =
        body.presiometry_report_metadata_json === null ? null : body.presiometry_report_metadata_json;
    }

    if (body.triaxial_curve_json !== undefined) {
      if (body.triaxial_curve_json === null) {
        patch.triaxial_curve_json = null;
      } else if (body.triaxial_curve_json && typeof body.triaxial_curve_json === "object") {
        const pts = (body.triaxial_curve_json as Record<string, unknown>).points;
        if (!Array.isArray(pts)) {
          return NextResponse.json({ error: "triaxial_curve_json invalid (lipsește points)." }, { status: 400 });
        }
        patch.triaxial_curve_json = clampTriaxialCurveForStorage(body.triaxial_curve_json as TriaxialCurvePayload);
      } else {
        return NextResponse.json({ error: "triaxial_curve_json invalid." }, { status: 400 });
      }
    }

    if (body.absorption_porosity_rock_json !== undefined) {
      if (body.absorption_porosity_rock_json === null) {
        patch.absorption_porosity_rock_json = null;
      } else if (body.absorption_porosity_rock_json && typeof body.absorption_porosity_rock_json === "object") {
        patch.absorption_porosity_rock_json = clampAbsorptionPorosityRockPayloadForStorage(
          body.absorption_porosity_rock_json,
        );
      } else {
        return NextResponse.json({ error: "absorption_porosity_rock_json invalid." }, { status: 400 });
      }
    }

    if (body.absorption_porosity_rock_report_metadata_json !== undefined) {
      if (body.absorption_porosity_rock_report_metadata_json === null) {
        patch.absorption_porosity_rock_report_metadata_json = null;
      } else if (
        body.absorption_porosity_rock_report_metadata_json &&
        typeof body.absorption_porosity_rock_report_metadata_json === "object"
      ) {
        patch.absorption_porosity_rock_report_metadata_json = clampAbsorptionPorosityRockReportMetadataForStorage(
          body.absorption_porosity_rock_report_metadata_json,
        );
      } else {
        return NextResponse.json({ error: "absorption_porosity_rock_report_metadata_json invalid." }, { status: 400 });
      }
    }
    if (body.unconfined_soil_report_metadata_json !== undefined) {
      if (body.unconfined_soil_report_metadata_json === null) {
        patch.unconfined_soil_report_metadata_json = null;
      } else if (
        body.unconfined_soil_report_metadata_json &&
        typeof body.unconfined_soil_report_metadata_json === "object"
      ) {
        patch.unconfined_soil_report_metadata_json = clampUnconfinedSoilReportMetadataForStorage(
          body.unconfined_soil_report_metadata_json,
        );
      } else {
        return NextResponse.json({ error: "unconfined_soil_report_metadata_json invalid." }, { status: 400 });
      }
    }

    const { data, error } = await supabase.from("tests").update(patch).eq("id", testId).select("*").single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const actor = getLabActorFromRequest(req);

    const { data: existing, error: exErr } = await supabase
      .from("tests")
      .select("locked_by_user_id, lock_expires_at")
      .eq("id", testId)
      .single();
    if (exErr) throw exErr;
    if (isLockedByOther(existing, actor.userId)) {
      return NextResponse.json(
        { error: "Test blocat de alt post. Nu poate fi șters până la eliberarea blocării." },
        { status: 423 },
      );
    }

    const { data: deleted, error } = await supabase
      .from("tests")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", testId)
      .select("id");
    if (error) {
      if (error.code === "42501" || error.code === "P0001" || /row-level security/i.test(error.message)) {
        return NextResponse.json(
          { error: "Mutarea la coș nu este permisă (doar teste în draft sau ca administrator)." },
          { status: 403 },
        );
      }
      throw error;
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Testul nu a fost găsit sau nu poate fi mutat la coș." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
