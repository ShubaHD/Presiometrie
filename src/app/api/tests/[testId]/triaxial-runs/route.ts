import { requireAuth } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ testId: string }> };

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(_req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;

    const { data, error } = await supabase
      .from("triaxial_rock_runs")
      .select("*")
      .eq("test_id", testId)
      .order("created_at", { ascending: false });
    if (error) throw error;

    return NextResponse.json({ ok: true, runs: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

