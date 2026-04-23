import { requireAuth } from "@/lib/auth/session";
import { isTestType, parseAllocationDateIso } from "@/lib/sample-auto-code";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ boreholeId: string }> };

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

async function resolveBoreholeUuid(supabase: { from: (t: string) => any }, boreholeId: string): Promise<string> {
  const raw = boreholeId.trim();
  if (isUuid(raw)) return raw;
  const { data: byCode } = await supabase
    .from("boreholes")
    .select("id")
    .eq("code", raw)
    .is("deleted_at", null)
    .maybeSingle();
  if (byCode?.id) return String(byCode.id);
  const { data: byName } = await supabase
    .from("boreholes")
    .select("id")
    .eq("name", raw)
    .is("deleted_at", null)
    .maybeSingle();
  if (byName?.id) return String(byName.id);
  throw new Error(`Foraj invalid: "${boreholeId}". Așteptam UUID (id) sau un cod/nume existent.`);
}

/** Previzualizare cod următor PREFIX+DDMMYYYY+##### (fără consumare din contor). */
export async function GET(req: Request, { params }: Params) {
  try {
    const { boreholeId } = await params;
    const { searchParams } = new URL(req.url);
    const testType = (searchParams.get("testType") ?? "").trim();
    if (!isTestType(testType)) {
      return NextResponse.json(
        { error: "Parametru obligatoriu: testType (tip încercare pentru codul probei)." },
        { status: 400 },
      );
    }
    const dateIso = parseAllocationDateIso(searchParams.get("date"));
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const boreholeUuid = await resolveBoreholeUuid(supabase, boreholeId);
    const rpcArgs: {
      p_borehole_id: string;
      p_test_type: string;
      p_day?: string;
    } = { p_borehole_id: boreholeUuid, p_test_type: testType };
    if (dateIso) rpcArgs.p_day = dateIso;

    const { data: suggestedCode, error } = await supabase.rpc("peek_next_sample_code", rpcArgs);
    if (error) throw error;
    if (suggestedCode == null || String(suggestedCode).trim() === "") {
      return NextResponse.json({ error: "Previzualizare cod eșuată (peek_next_sample_code)." }, { status: 500 });
    }
    return NextResponse.json({ suggestedCode: String(suggestedCode).trim(), testType, date: dateIso ?? null });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
