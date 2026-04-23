import { requireAdmin, requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { projectId } = await params;
    const { data, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .is("deleted_at", null)
      .single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { projectId } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.code !== undefined) patch.code = String(body.code).trim();
    if (body.name !== undefined) patch.name = String(body.name).trim();
    if (body.client_name !== undefined) patch.client_name = body.client_name;
    if (body.location !== undefined) patch.location = body.location;
    if (body.notes !== undefined) patch.notes = body.notes;

    const { data, error } = await supabase.from("projects").update(patch).eq("id", projectId).select("*").single();
    if (error) throw error;
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.res;
    const { projectId } = await params;

    // Use service role for admin soft-delete to avoid RLS/trigger edge cases.
    const admin = createAdminClient();
    const { data: deleted, error } = await admin
      .from("projects")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", projectId)
      .select("id");
    if (error) {
      if (error.code === "42501" || error.code === "P0001" || /row-level security/i.test(error.message)) {
        return NextResponse.json({ error: "Mutarea la coș este permisă doar administratorilor." }, { status: 403 });
      }
      throw error;
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Proiectul nu a fost găsit sau nu poate fi mutat la coș." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
