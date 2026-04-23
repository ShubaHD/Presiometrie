import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockActive } from "@/lib/test-lock";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ testId: string }> };

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const actor = getLabActorFromRequest(req, { fallbackUserId: auth.user.id });
    const body = (await req.json().catch(() => ({}))) as { force?: boolean };
    const { data: row, error: fetchErr } = await supabase
      .from("tests")
      .select("id, locked_by_user_id, lock_expires_at")
      .eq("id", testId)
      .single();
    if (fetchErr) throw fetchErr;

    if (isLockActive(row) && row.locked_by_user_id !== actor.userId) {
      if (!body.force) {
        return NextResponse.json(
          { error: "Nu puteți elibera blocarea altui utilizator (admin: trimiteți force: true)." },
          { status: 403 },
        );
      }
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", auth.user.id).maybeSingle();
      if (prof?.role !== "admin") {
        return NextResponse.json({ error: "force este permis doar administratorilor." }, { status: 403 });
      }
    }

    const { data, error } = await supabase
      .from("tests")
      .update({
        locked_by_user_id: null,
        locked_by_label: null,
        locked_at: null,
        lock_expires_at: null,
        updated_by: actor.displayName,
        updated_by_user_id: actor.userId,
      })
      .eq("id", testId)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, test: data });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
