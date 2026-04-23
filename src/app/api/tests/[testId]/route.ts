import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import {
  clampPresiometryCurveForStorage,
  parsePresiometryCurvePayload,
  type PresiometryCurvePayload,
} from "@/lib/presiometry-curve";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import type { TestType } from "@/types/lab";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ testId: string }> };

function isPresiometryType(tt: unknown): tt is TestType {
  return (
    tt === "presiometry_program_a" ||
    tt === "presiometry_program_b" ||
    tt === "presiometry_program_c"
  );
}

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
      .select("test_type, locked_by_user_id, lock_expires_at")
      .eq("id", testId)
      .single();
    if (exErr) throw exErr;
    if (isLockedByOther(existing, actor.userId)) {
      return NextResponse.json(
        { error: "Test blocat de alt post. Preluați blocarea sau așteptați expirarea." },
        { status: 423 },
      );
    }
    if (!isPresiometryType((existing as { test_type?: unknown } | null)?.test_type)) {
      return NextResponse.json({ error: "Tip test nesuportat în această aplicație." }, { status: 400 });
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
      patch.presiometry_settings_json =
        body.presiometry_settings_json === null ? null : body.presiometry_settings_json;
    }

    if (body.presiometry_report_metadata_json !== undefined) {
      patch.presiometry_report_metadata_json =
        body.presiometry_report_metadata_json === null ? null : body.presiometry_report_metadata_json;
    }

    if (body.report_options_json !== undefined) {
      if (body.report_options_json === null) {
        patch.report_options_json = null;
      } else if (body.report_options_json && typeof body.report_options_json === "object") {
        const ro = body.report_options_json as Record<string, unknown>;
        const sp = ro.specimen_photos;
        if (sp && typeof sp === "object" && "include" in sp) {
          patch.report_options_json = { specimen_photos: { include: Boolean((sp as Record<string, unknown>).include) } };
        } else {
          patch.report_options_json = {};
        }
      } else {
        return NextResponse.json({ error: "report_options_json invalid." }, { status: 400 });
      }
    }

    const { data, error } = await supabase.from("tests").update(patch).eq("id", testId).select("*").single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

