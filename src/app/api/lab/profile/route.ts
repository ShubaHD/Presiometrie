import { requireAuth } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/to-error-message";
import type { LabProfile } from "@/types/lab";
import { NextResponse } from "next/server";

function rowToClient(row: LabProfile) {
  return {
    companyName: row.company_name ?? "",
    address: row.address ?? "",
    phone: row.phone ?? "",
    website: row.website ?? "",
    logoPath: row.logo_path,
    updatedAt: row.updated_at,
  };
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { data, error } = await supabase.from("lab_profile").select("*").eq("id", 1).maybeSingle();
    if (error) throw error;
    if (!data) {
      return NextResponse.json({
        companyName: "",
        address: "",
        phone: "",
        website: "",
        logoPath: null as string | null,
        updatedAt: null as string | null,
      });
    }
    return NextResponse.json(rowToClient(data as LabProfile));
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const body = (await req.json()) as Record<string, unknown>;
    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    const optStr = (k: string, col: string) => {
      if (!(k in body)) return;
      const v = body[k];
      if (v === null || v === undefined || v === "") patch[col] = null;
      else patch[col] = String(v).trim() || null;
    };

    optStr("companyName", "company_name");
    optStr("address", "address");
    optStr("phone", "phone");
    optStr("website", "website");

    const { data, error } = await supabase.from("lab_profile").update(patch).eq("id", 1).select("*").single();
    if (error) throw error;
    return NextResponse.json(rowToClient(data as LabProfile));
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
