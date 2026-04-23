import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ testId: string; runId: string }> };

type PatchBody = {
  is_suspect?: unknown;
  observations?: unknown;
};

export async function PATCH(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId, runId } = await params;
    const actor = getLabActorFromRequest(req);

    const { data: meta, error: metaErr } = await supabase
      .from("tests")
      .select("locked_by_user_id, lock_expires_at")
      .eq("id", testId)
      .single();
    if (metaErr) throw metaErr;
    if (isLockedByOther(meta, actor.userId)) {
      return NextResponse.json({ error: "Test blocat de alt post." }, { status: 423 });
    }

    const body = (await req.json()) as PatchBody;
    const patch: Record<string, unknown> = {};
    if (body.is_suspect !== undefined) patch.is_suspect = Boolean(body.is_suspect);
    if (body.observations !== undefined) {
      const s = typeof body.observations === "string" ? body.observations : String(body.observations ?? "");
      patch.observations = s;
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nimic de actualizat." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("triaxial_rock_runs")
      .update(patch)
      .eq("id", runId)
      .eq("test_id", testId)
      .select("*")
      .single();
    if (error) throw error;

    await supabase
      .from("tests")
      .update({ updated_by: actor.displayName, updated_by_user_id: actor.userId })
      .eq("id", testId);

    return NextResponse.json({ ok: true, run: data });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId, runId } = await params;
    const actor = getLabActorFromRequest(req);

    const { data: meta, error: metaErr } = await supabase
      .from("tests")
      .select("locked_by_user_id, lock_expires_at")
      .eq("id", testId)
      .single();
    if (metaErr) throw metaErr;
    if (isLockedByOther(meta, actor.userId)) {
      return NextResponse.json({ error: "Test blocat de alt post." }, { status: 423 });
    }

    const { data: row, error: rowErr } = await supabase
      .from("triaxial_rock_runs")
      .select("id, storage_path")
      .eq("id", runId)
      .eq("test_id", testId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) return NextResponse.json({ error: "Rulare inexistentă." }, { status: 404 });

    const { error: rmErr } = await supabase.storage.from("lab-imports").remove([row.storage_path]);
    if (rmErr) throw rmErr;

    const { error: delErr } = await supabase
      .from("triaxial_rock_runs")
      .delete()
      .eq("id", runId)
      .eq("test_id", testId);
    if (delErr) throw delErr;

    await supabase
      .from("tests")
      .update({ updated_by: actor.displayName, updated_by_user_id: actor.userId })
      .eq("id", testId);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

