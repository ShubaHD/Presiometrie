import { requireAdmin, requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ boreholeId: string }> };

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

async function resolveBoreholeId(supabase: { from: (t: string) => any }, boreholeId: string): Promise<string | null> {
  const raw = boreholeId.trim();
  if (isUuid(raw)) return raw;

  // Backward-compat / user-friendly: allow using borehole code or name in URL.
  const { data: byCode } = await supabase
    .from("boreholes")
    .select("id")
    .eq("code", raw)
    .is("deleted_at", null)
    .maybeSingle();
  if (byCode?.id) return String(byCode.id);

  const { data: byName } = await supabase
    .from("boreholes")
    .select("id")
    .eq("name", raw)
    .is("deleted_at", null)
    .maybeSingle();
  if (byName?.id) return String(byName.id);

  return null;
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { boreholeId } = await params;
    const id = await resolveBoreholeId(supabase, boreholeId);
    if (!id) {
      return NextResponse.json(
        { error: `Foraj invalid: "${boreholeId}". Așteptam UUID (id) sau un cod/nume existent.` },
        { status: 400 },
      );
    }
    const { data, error } = await supabase
      .from("boreholes")
      .select("*")
      .eq("id", id)
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
    const { boreholeId } = await params;
    const id = await resolveBoreholeId(supabase, boreholeId);
    if (!id) {
      return NextResponse.json(
        { error: `Foraj invalid: "${boreholeId}". Așteptam UUID (id) sau un cod/nume existent.` },
        { status: 400 },
      );
    }
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (body.code !== undefined) patch.code = String(body.code).trim();
    if (body.name !== undefined) patch.name = body.name;
    if (body.depth_total !== undefined) patch.depth_total = body.depth_total;
    if (body.elevation !== undefined) patch.elevation = body.elevation;
    if (body.notes !== undefined) patch.notes = body.notes;

    const { data, error } = await supabase.from("boreholes").update(patch).eq("id", id).select("*").single();
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
    // For delete we accept UUID only to avoid accidental deletes by code collision.
    const { boreholeId } = await params;
    if (!isUuid(boreholeId)) {
      return NextResponse.json(
        { error: `Foraj invalid: "${boreholeId}". Ștergerea necesită UUID (id).` },
        { status: 400 },
      );
    }

    // Use service role for admin soft-delete to avoid RLS/trigger edge cases.
    const admin = createAdminClient();
    const { data: deleted, error } = await admin
      .from("boreholes")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", boreholeId)
      .select("id");
    if (error) {
      if (error.code === "42501" || error.code === "P0001" || /row-level security/i.test(error.message)) {
        return NextResponse.json({ error: "Mutarea la coș este permisă doar administratorilor." }, { status: 403 });
      }
      throw error;
    }
    if (!deleted || deleted.length === 0) {
      return NextResponse.json({ error: "Forajul nu a fost găsit sau nu poate fi mutat la coș." }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
