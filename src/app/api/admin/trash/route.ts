import { requireAdmin } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type TrashType = "project" | "borehole" | "sample" | "test";

const TRASH_TYPES: TrashType[] = ["project", "borehole", "sample", "test"];

export async function GET(req: Request) {
  try {
    const auth = await requireAdmin();
    if (!auth.ok) return auth.res;

    const { searchParams } = new URL(req.url);
    const type = (searchParams.get("type") ?? "test").trim() as TrashType;
    const q = (searchParams.get("q") ?? "").trim();
    const limitRaw = parseInt(searchParams.get("limit") ?? "", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, limitRaw)) : 50;
    const offsetRaw = parseInt(searchParams.get("offset") ?? "", 10);
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, offsetRaw) : 0;

    if (!TRASH_TYPES.includes(type)) {
      return NextResponse.json({ error: "Tip invalid." }, { status: 400 });
    }

    const admin = createAdminClient();
    const rangeFrom = offset;
    const rangeTo = offset + limit - 1;

    if (type === "project") {
      let query = admin
        .from("projects")
        .select("id, code, name, deleted_at, deleted_by_user_id", { count: "exact" })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(rangeFrom, rangeTo);
      if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%,client_name.ilike.%${q}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return NextResponse.json({ type, items: data ?? [], total: count ?? 0, limit, offset });
    }

    if (type === "borehole") {
      let query = admin
        .from("boreholes")
        .select("id, project_id, code, name, deleted_at, deleted_by_user_id", { count: "exact" })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(rangeFrom, rangeTo);
      if (q) query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return NextResponse.json({ type, items: data ?? [], total: count ?? 0, limit, offset });
    }

    if (type === "sample") {
      let query = admin
        .from("samples")
        .select("id, borehole_id, code, lithology, deleted_at, deleted_by_user_id", { count: "exact" })
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(rangeFrom, rangeTo);
      if (q) query = query.or(`code.ilike.%${q}%,lithology.ilike.%${q}%`);
      const { data, error, count } = await query;
      if (error) throw error;
      return NextResponse.json({ type, items: data ?? [], total: count ?? 0, limit, offset });
    }

    // tests
    let query = admin
      .from("tests")
      .select("id, sample_id, test_type, status, test_date, deleted_at, deleted_by_user_id", { count: "exact" })
      .not("deleted_at", "is", null)
      .order("deleted_at", { ascending: false })
      .range(rangeFrom, rangeTo);
    if (q) query = query.or(`test_type.ilike.%${q}%,status.ilike.%${q}%`);
    const { data, error, count } = await query;
    if (error) throw error;
    return NextResponse.json({ type, items: data ?? [], total: count ?? 0, limit, offset });
  } catch (e) {
    console.error("[GET /api/admin/trash]", e);
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

