import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ testId: string; fileId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId, fileId } = await params;
    const actor = getLabActorFromRequest(req, { fallbackUserId: auth.user.id });

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
      .from("test_files")
      .select("id, file_path")
      .eq("id", fileId)
      .eq("test_id", testId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) {
      return NextResponse.json({ error: "Fișier inexistent." }, { status: 404 });
    }

    const { error: rmErr } = await supabase.storage.from("lab-files").remove([row.file_path]);
    if (rmErr) throw rmErr;

    const { error: delErr } = await supabase.from("test_files").delete().eq("id", fileId).eq("test_id", testId);
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
