import { requireAuth } from "@/lib/auth/session";
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
      .from("tests")
      .select(
        `
        id,
        created_at,
        test_results ( key, value )
      `,
      )
      .eq("sample_id", sampleId)
      .eq("test_type", "triaxial_rock")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const out =
      (data ?? []).map((t) => {
        const rows = Array.isArray((t as { test_results?: unknown }).test_results)
          ? ((t as { test_results: Array<{ key: string; value: number | null }> }).test_results ?? [])
          : [];
        const byKey = new Map(rows.map((r) => [r.key, r.value]));
        const sigma1 = Number(byKey.get("sigma1_mpa"));
        const sigma3 = Number(byKey.get("sigma3_mpa"));
        return {
          id: t.id as string,
          created_at: t.created_at as string,
          sigma1_mpa: Number.isFinite(sigma1) ? sigma1 : null,
          sigma3_mpa: Number.isFinite(sigma3) ? sigma3 : null,
        };
      }) ?? [];

    return NextResponse.json({ data: out });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

