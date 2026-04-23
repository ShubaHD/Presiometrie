import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import { NextResponse } from "next/server";

const REPORTS_BUCKET = "reports";

type Params = { params: Promise<{ testId: string; reportId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId, reportId } = await params;
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
      .from("reports")
      .select("id, pdf_path")
      .eq("id", reportId)
      .eq("test_id", testId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) {
      return NextResponse.json({ error: "Raport inexistent." }, { status: 404 });
    }

    const { error: rmErr } = await supabase.storage.from(REPORTS_BUCKET).remove([row.pdf_path]);
    if (rmErr) {
      /* Continuăm ștergerea din DB chiar dacă fișierul lipsea din Storage. */
      const msg = rmErr.message?.toLowerCase() ?? "";
      if (!msg.includes("not found") && !msg.includes("does not exist")) {
        throw rmErr;
      }
    }

    const { error: delErr } = await supabase.from("reports").delete().eq("id", reportId).eq("test_id", testId);
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
