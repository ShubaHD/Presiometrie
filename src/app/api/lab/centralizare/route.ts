import { requireAuth } from "@/lib/auth/session";
import { parsePagination } from "@/lib/pagination";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * Listă teste presiometrie cu ierarhie proiect → foraj → probă (paginată).
 */
export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { searchParams } = new URL(req.url);
    const { page, pageSize, from, to } = parsePagination(searchParams);

    let query = supabase
      .from("tests")
      .select(
        `
        id,
        test_type,
        status,
        test_date,
        created_at,
        sample:samples!inner(
          id,
          code,
          deleted_at,
          borehole:boreholes!inner(
            id,
            code,
            deleted_at,
            project:projects!inner(
              id,
              code,
              deleted_at
            )
          )
        )
      `,
        { count: "exact" },
      )
      .is("deleted_at", null)
      .is("samples.deleted_at", null)
      .is("samples.boreholes.deleted_at", null)
      .is("samples.boreholes.projects.deleted_at", null)
      .order("created_at", { ascending: false })
      .range(from, to);

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
