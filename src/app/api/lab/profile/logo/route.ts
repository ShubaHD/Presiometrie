import { requireAuth } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/to-error-message";
import type { LabProfile } from "@/types/lab";
import { NextResponse } from "next/server";

const MAX_LOGO_BYTES = 4 * 1024 * 1024;
const BUCKET = "lab-files";

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Lipsește fișierul imagine." }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Încărcați o imagine (PNG, JPEG, SVG, …)." }, { status: 400 });
    }
    if (file.size > MAX_LOGO_BYTES) {
      return NextResponse.json({ error: "Logo-ul depășește 4 MB." }, { status: 400 });
    }

    const { data: prof, error: pErr } = await supabase.from("lab_profile").select("logo_path").eq("id", 1).single();
    if (pErr) throw pErr;
    const oldPath = (prof as Pick<LabProfile, "logo_path"> | null)?.logo_path;
    if (oldPath) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }

    const ext =
      file.name.includes(".") && file.name.split(".").pop()
        ? String(file.name.split(".").pop()).replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8) || "png"
        : file.type.includes("svg")
          ? "svg"
          : file.type.includes("png")
            ? "png"
            : "jpg";
    const path = `branding/lab_logo_${Date.now()}.${ext}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, buf, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });
    if (upErr) throw upErr;

    const { data, error } = await supabase
      .from("lab_profile")
      .update({ logo_path: path, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select("logo_path, updated_at")
      .single();
    if (error) throw error;

    return NextResponse.json({
      logoPath: (data as { logo_path: string }).logo_path,
      updatedAt: (data as { updated_at: string }).updated_at,
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { data: prof, error: pErr } = await supabase.from("lab_profile").select("logo_path").eq("id", 1).single();
    if (pErr) throw pErr;
    const oldPath = (prof as Pick<LabProfile, "logo_path"> | null)?.logo_path;
    if (oldPath) {
      await supabase.storage.from(BUCKET).remove([oldPath]);
    }
    const { error } = await supabase
      .from("lab_profile")
      .update({ logo_path: null, updated_at: new Date().toISOString() })
      .eq("id", 1);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
