import { requireAdmin, requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ sampleId: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { sampleId } = await params;
    const { data, error } = await supabase
      .from("samples")
      .select("*")
      .eq("id", sampleId)
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
    const { sampleId } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.code !== undefined) patch.code = String(body.code).trim();
    if (body.depth_from !== undefined) patch.depth_from = body.depth_from;
    if (body.depth_to !== undefined) patch.depth_to = body.depth_to;
    if (body.lithology !== undefined) patch.lithology = body.lithology;
    if (body.notes !== undefined) patch.notes = body.notes;

    const { data, error } = await supabase.from("samples").update(patch).eq("id", sampleId).select("*").single();
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
    const { sampleId } = await params;

    // Use service role for admin soft-delete to avoid RLS edge cases.
    const admin = createAdminClient();
    const { data: deleted, error } = await admin
      .from("samples")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", sampleId)
      .select("id");
    if (error) {
      throw error;
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Proba nu a fost găsită." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
