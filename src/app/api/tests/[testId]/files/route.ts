import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import type { TestFileRole } from "@/types/lab";
import { NextResponse } from "next/server";

const SPEC_ROLES: TestFileRole[] = ["specimen_before", "specimen_after"];
const MAX_SPEC_IMAGE_BYTES = 8 * 1024 * 1024;

type Params = { params: Promise<{ testId: string }> };

function parseFileRole(raw: FormDataEntryValue | null): TestFileRole | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  if (s === "specimen_before" || s === "specimen_after") return s;
  return null;
}

/** Pe unele browsere/OS, `File.type` poate fi gol chiar pentru JPEG/PNG. */
function isAllowedSpecimenImage(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(jpe?g|png|gif|webp|bmp|heic|heif)$/i.test(file.name);
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

    const form = await req.formData();
    const file = form.get("file");
    const fileRole = parseFileRole(form.get("file_role"));

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Lipsește file." }, { status: 400 });
    }

    if (fileRole) {
      if (!isAllowedSpecimenImage(file)) {
        return NextResponse.json(
          { error: "Pentru probă înainte/după încărcați doar imagini (JPEG, PNG, …)." },
          { status: 400 },
        );
      }
      if (file.size > MAX_SPEC_IMAGE_BYTES) {
        return NextResponse.json({ error: "Imaginea depășește 8 MB." }, { status: 400 });
      }

      const { data: existing, error: exErr } = await supabase
        .from("test_files")
        .select("id, file_path")
        .eq("test_id", testId)
        .eq("file_role", fileRole);
      if (exErr) throw exErr;
      for (const old of existing ?? []) {
        await supabase.storage.from("lab-files").remove([old.file_path]);
        await supabase.from("test_files").delete().eq("id", old.id);
      }
    }

    const path = `${testId}/${Date.now()}_${file.name.replace(/[^\w.\-]+/g, "_")}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from("lab-files").upload(path, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
    if (upErr) {
      const m = (upErr as { message?: string }).message ?? "";
      if (/bucket not found/i.test(m)) {
        throw new Error(
          "Bucket-ul Storage „lab-files” lipsește. Rulați migrarea 20250415120000_storage_buckets.sql (sau creați manual bucket-ul „lab-files” în Supabase → Storage).",
        );
      }
      throw upErr;
    }

    const ext = file.name.includes(".") ? file.name.split(".").pop() ?? "" : "";
    const insertRow: Record<string, unknown> = {
      test_id: testId,
      file_name: file.name,
      file_path: path,
      file_type: ext || null,
    };
    if (fileRole) {
      insertRow.file_role = fileRole;
    }

    const { data: inserted, error } = await supabase.from("test_files").insert(insertRow).select("*").single();
    if (error) throw error;

    let data = inserted;
    /* Dacă coloana lipsea la insert sau răspunsul nu include file_role, realiniem rolul. */
    if (fileRole && data && ((data as { file_role?: string | null }).file_role == null || (data as { file_role?: string | null }).file_role === "")) {
      const { data: patched, error: patchErr } = await supabase
        .from("test_files")
        .update({ file_role: fileRole })
        .eq("id", (data as { id: string }).id)
        .select("*")
        .single();
      if (!patchErr && patched) data = patched;
    }

    await supabase
      .from("tests")
      .update({ updated_by: actor.displayName, updated_by_user_id: actor.userId })
      .eq("id", testId);

    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
