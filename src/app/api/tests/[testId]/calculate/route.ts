import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { parsePresiometryCurvePayload } from "@/lib/presiometry-curve";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import { measurementsRowsToMap, runCalculationForTestType } from "@/modules/calculations";
import type { CalculationContext } from "@/modules/calculations";
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

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const actor = getLabActorFromRequest(req, { fallbackUserId: auth.user.id });

    const { data: test, error: tErr } = await supabase
      .from("tests")
      .select("id, test_type, locked_by_user_id, lock_expires_at, presiometry_curve_json, presiometry_settings_json")
      .eq("id", testId)
      .single();
    if (tErr) throw tErr;

    if (isLockedByOther(test, actor.userId)) {
      return NextResponse.json({ error: "Test blocat de alt post." }, { status: 423 });
    }

    const testTypeRaw = (test as { test_type?: unknown } | null)?.test_type;
    if (!isPresiometryType(testTypeRaw)) {
      return NextResponse.json({ error: "Tip test nesuportat în această aplicație." }, { status: 400 });
    }
    const testType = testTypeRaw;

    const { data: mRows, error: mErr } = await supabase
      .from("test_measurements")
      .select("key, value")
      .eq("test_id", testId);
    if (mErr) throw mErr;
    const map = measurementsRowsToMap(mRows ?? []);

    const curve = parsePresiometryCurvePayload((test as { presiometry_curve_json?: unknown }).presiometry_curve_json);
    const settings = (test as { presiometry_settings_json?: unknown }).presiometry_settings_json ?? null;
    const ctx: CalculationContext = { presiometry: { curve, settings } };

    const out = runCalculationForTestType(testType, map, ctx);

    // Persist results (replace existing)
    await supabase.from("test_results").delete().eq("test_id", testId);
    if (out.intermediate.length + out.final.length > 0) {
      const rows = [...out.intermediate, ...out.final].map((r) => ({
        test_id: testId,
        key: r.key,
        label: r.label,
        value: r.value,
        unit: r.unit,
        decimals: r.decimals,
        reportable: r.reportable,
        display_order: r.display_order,
      }));
      const { error: insErr } = await supabase.from("test_results").insert(rows);
      if (insErr) throw insErr;
    }

    const { error: upErr } = await supabase
      .from("tests")
      .update({
        formula_version: out.formulaVersion ?? null,
        updated_by: actor.displayName,
        updated_by_user_id: actor.userId,
      })
      .eq("id", testId);
    if (upErr) throw upErr;

    return NextResponse.json(out);
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

