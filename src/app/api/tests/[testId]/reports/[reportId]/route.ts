import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportsStorageBucket } from "@/lib/reports-bucket";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ testId: string; reportId: string }> };

export async function DELETE(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId, reportId } = await params;
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
      .from("reports")
      .select("id, pdf_path")
      .eq("id", reportId)
      .eq("test_id", testId)
      .maybeSingle();
    if (rowErr) throw rowErr;
    if (!row) {
      return NextResponse.json({ error: "Raport inexistent." }, { status: 404 });
    }

    const bucket = reportsStorageBucket();
    let rmErr: { message?: string } | null = null;
    try {
      const admin = createAdminClient();
      const rm = await admin.storage.from(bucket).remove([row.pdf_path]);
      rmErr = rm.error;
    } catch {
      const rm = await supabase.storage.from(bucket).remove([row.pdf_path]);
      rmErr = rm.error;
    }
    if (rmErr) {
      /* Continuăm ștergerea din DB chiar dacă fișierul lipsea din Storage. */
      const msg = rmErr.message?.toLowerCase() ?? "";
      if (!msg.includes("not found") && !msg.includes("does not exist")) {
        throw new Error(rmErr.message ?? "Eroare storage la ștergere.");
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
