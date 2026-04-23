import { requireAuth } from "@/lib/auth/session";
import { parsePagination } from "@/lib/pagination";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ projectId: string }> };

export async function GET(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { projectId } = await params;
    const { searchParams } = new URL(req.url);
    const { page, pageSize, from, to } = parsePagination(searchParams);
    const q = (searchParams.get("q") ?? "").trim();

    let query = supabase
      .from("boreholes")
      .select("*", { count: "exact" })
      .eq("project_id", projectId)
      .is("deleted_at", null)
      .order("code", { ascending: true })
      .range(from, to);

    if (q) {
      query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      data: data ?? [],
      total: count ?? 0,
      page,
      pageSize,
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { projectId } = await params;
    const body = (await req.json()) as Record<string, unknown>;
    const row = {
      project_id: projectId,
      code: String(body.code ?? "").trim(),
      name: body.name ? String(body.name) : null,
      depth_total: body.depth_total != null && body.depth_total !== "" ? Number(body.depth_total) : null,
      elevation: body.elevation != null && body.elevation !== "" ? Number(body.elevation) : null,
      notes: body.notes ? String(body.notes) : null,
    };
    if (!row.code) {
      return NextResponse.json({ error: "Cod foraj obligatoriu." }, { status: 400 });
    }
    const { data, error } = await supabase.from("boreholes").insert(row).select("*").single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
