import { requireAuth } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { searchParams } = new URL(req.url);
    const bucket = searchParams.get("bucket");
    const path = searchParams.get("path");
    if (!bucket || !path) {
      return NextResponse.json({ error: "Parametri bucket și path obligatorii." }, { status: 400 });
    }
    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw error;
    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
