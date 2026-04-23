import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { isLockedByOther } from "@/lib/test-lock";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ testId: string }> };

const DEFAULT_TTL_MIN = 30;

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const actor = getLabActorFromRequest(req, { fallbackUserId: auth.user.id });
    const body = (await req.json().catch(() => ({}))) as { ttlMinutes?: number };
    const ttl = Math.min(480, Math.max(5, Number(body.ttlMinutes) || DEFAULT_TTL_MIN));
    const { data: row, error: fetchErr } = await supabase
      .from("tests")
      .select("id, locked_by_user_id, locked_by_label, locked_at, lock_expires_at")
      .eq("id", testId)
      .single();
    if (fetchErr) throw fetchErr;

    if (isLockedByOther(row, actor.userId)) {
      return NextResponse.json(
        {
          error: "Testul este blocat de alt utilizator/post.",
          lockedByLabel: row.locked_by_label ?? row.locked_by_user_id,
          lockExpiresAt: row.lock_expires_at,
        },
        { status: 409 },
      );
    }

    const expires = new Date(Date.now() + ttl * 60_000).toISOString();

    const { data, error } = await supabase
      .from("tests")
      .update({
        locked_by_user_id: actor.userId,
        locked_by_label: actor.displayName,
        locked_at: new Date().toISOString(),
        lock_expires_at: expires,
        updated_by: actor.displayName,
        updated_by_user_id: actor.userId,
      })
      .eq("id", testId)
      .select("*")
      .single();
    if (error) throw error;

    return NextResponse.json({ ok: true, test: data, ttlMinutes: ttl });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
