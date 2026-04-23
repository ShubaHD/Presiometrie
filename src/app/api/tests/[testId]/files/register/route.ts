import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import type { TestFileRole } from "@/types/lab";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ testId: string }> };

type Body = {
  file_name?: unknown;
  file_path?: unknown;
  file_type?: unknown;
  file_role?: unknown;
};

function parseFileRole(raw: unknown): TestFileRole | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (s === "specimen_before" || s === "specimen_after") return s;
  return null;
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
      .select("locked_by_user_id, lock_expires_at")
      .eq("id", testId)
      .single();
    if (metaErr) throw metaErr;
    if (isLockedByOther(meta, actor.userId)) {
      return NextResponse.json({ error: "Test blocat de alt post." }, { status: 423 });
    }

    const body = (await req.json()) as Body;
    const file_name = typeof body.file_name === "string" ? body.file_name : null;
    const file_path = typeof body.file_path === "string" ? body.file_path : null;
    const file_type = typeof body.file_type === "string" ? body.file_type : null;
    const file_role = parseFileRole(body.file_role);

    if (!file_name || !file_path) {
      return NextResponse.json({ error: "Lipsește file_name sau file_path." }, { status: 400 });
    }
    if (!file_path.startsWith(`${testId}/`)) {
      return NextResponse.json({ error: "file_path invalid." }, { status: 400 });
    }

    if (file_role) {
      const { data: existing, error: exErr } = await supabase
        .from("test_files")
        .select("id, file_path")
        .eq("test_id", testId)
        .eq("file_role", file_role);
      if (exErr) throw exErr;
      for (const old of existing ?? []) {
        await supabase.storage.from("lab-files").remove([old.file_path]);
        await supabase.from("test_files").delete().eq("id", old.id);
      }
    }

    const insertRow: Record<string, unknown> = {
      test_id: testId,
      file_name,
      file_path,
      file_type: file_type || null,
    };
    if (file_role) insertRow.file_role = file_role;

    const { data: inserted, error } = await supabase.from("test_files").insert(insertRow).select("*").single();
    if (error) throw error;

    await supabase
      .from("tests")
      .update({ updated_by: actor.displayName, updated_by_user_id: actor.userId })
      .eq("id", testId);

    return NextResponse.json(inserted, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

