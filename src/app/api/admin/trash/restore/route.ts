import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type TrashType = "project" | "borehole" | "sample" | "test";

type RestoreBody = {
  type?: TrashType;
  id?: string;
};

export async function POST(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.res;

    const body = (await req.json()) as RestoreBody;
    const type = body.type;
    const id = String(body.id ?? "").trim();
    if (!type || !id) return NextResponse.json({ error: "Câmpuri obligatorii: type, id" }, { status: 400 });

    const admin = createAdminClient();

    if (type === "project") {
      const { error } = await admin.from("projects").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (type === "borehole") {
      const { error } = await admin.from("boreholes").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (type === "sample") {
      const { error } = await admin.from("samples").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (type === "test") {
      const { error } = await admin.from("tests").update({ deleted_at: null }).eq("id", id);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Tip invalid." }, { status: 400 });
  } catch (e) {
    console.error("[POST /api/admin/trash/restore]", e);
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

