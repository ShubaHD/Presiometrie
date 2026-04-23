import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type Params = { params: Promise<{ testId: string }> };

type RowInput = {
  key: string;
  label: string;
  value: number | string | null;
  unit?: string | null;
  display_order?: number;
  source?: "manual" | "imported";
};

/**
 * Înlocuiește măsurătorile pentru test (MVP). Upsert pe (test_id, key).
 */
export async function PUT(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const actor = getLabActorFromRequest(req, { fallbackUserId: auth.user.id });

    const { data: meta, error: metaErr } = await supabase
      .from("tests")
      .select("locked_by_user_id, lock_expires_at")
      .eq("id", testId)
      .single();
    if (metaErr) throw metaErr;
    if (isLockedByOther(meta, actor.userId)) {
      return NextResponse.json({ error: "Test blocat de alt post." }, { status: 423 });
    }

    const body = (await req.json()) as { rows?: RowInput[] };
    const rows = body.rows ?? [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: "Lipsește array-ul rows." }, { status: 400 });
    }

    const normalized = rows.map((r, i) => {
      let value: number | string | null = r.value;
      if (typeof value === "string") {
        const t = value.trim();
        value = t.length ? t : null;
      }
      return {
        test_id: testId,
        key: String(r.key).trim(),
        label: String(r.label).trim(),
        value,
        unit: r.unit ?? null,
        display_order: r.display_order ?? i * 10,
        source: r.source ?? "manual",
      };
    });

    for (const r of normalized) {
      if (!r.key || !r.label) {
        return NextResponse.json({ error: "Fiecare rând necesită key și label." }, { status: 400 });
      }
    }

    const { error: delErr } = await supabase.from("test_measurements").delete().eq("test_id", testId);
    if (delErr) throw delErr;

    const { data, error } = await supabase.from("test_measurements").insert(normalized).select("*");
    if (error) throw error;

    await supabase
      .from("tests")
      .update({ updated_by: actor.displayName, updated_by_user_id: actor.userId })
      .eq("id", testId);

    return NextResponse.json({ data: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
