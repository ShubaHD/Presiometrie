import { requireAuth } from "@/lib/auth/session";
import { isTestType, parseAllocationDateIso } from "@/lib/sample-auto-code";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ boreholeId: string }> };

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
    const rpcArgs: {
      p_borehole_id: string;
      p_test_type: string;
      p_day?: string;
    } = { p_borehole_id: boreholeId, p_test_type: testType };
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
