import { requireAuth } from "@/lib/auth/session";
import { parsePagination } from "@/lib/pagination";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { searchParams } = new URL(req.url);
    const { page, pageSize, from, to } = parsePagination(searchParams);
    const q = (searchParams.get("q") ?? "").trim();

    let query = supabase
      .from("projects")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (q) {
      query = query.or(`code.ilike.%${q}%,name.ilike.%${q}%,client_name.ilike.%${q}%`);
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
    console.error("[GET /api/projects]", e);
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const body = (await req.json()) as Record<string, unknown>;
    const row = {
      code: String(body.code ?? "").trim(),
      name: String(body.name ?? "").trim(),
      client_name: body.client_name ? String(body.client_name) : null,
      location: body.location ? String(body.location) : null,
      notes: body.notes ? String(body.notes) : null,
    };
    if (!row.code || !row.name) {
      return NextResponse.json({ error: "Cod și denumire sunt obligatorii." }, { status: 400 });
    }
    const { data, error } = await supabase.from("projects").insert(row).select("*").single();
    if (error) throw error;
    return NextResponse.json(data, { status: 201 });
  } catch (e) {
    console.error("[POST /api/projects]", e);
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
