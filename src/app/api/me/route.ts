import { requireAuth } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;

    const { data: profile, error } = await auth.supabase
      .from("profiles")
      .select("role, display_name")
      .eq("id", auth.user.id)
      .maybeSingle();
    if (error) throw error;

    return NextResponse.json({
      email: auth.user.email,
      role: profile?.role ?? "lab_user",
      displayName: profile?.display_name ?? auth.user.email,
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
