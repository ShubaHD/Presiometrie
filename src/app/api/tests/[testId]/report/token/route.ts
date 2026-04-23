import { createHmac } from "node:crypto";
import {
  vercelInvalidReportUrlMessage,
  vercelReportDurationHint,
} from "@/lib/report-service-vercel";
import { requireAuth } from "@/lib/auth/session";
import { getLabActorFromRequest } from "@/lib/lab-actor";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

/** Durata tokenului HMAC pentru apeluri browser → report-service (ocolire limită ~10s Vercel Hobby). */
const TOKEN_TTL_SEC = 15 * 60;

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ testId: string }> };

function signReportToken(secret: string, testId: string, expUnix: number): string {
  return createHmac("sha256", secret).update(`${testId}\n${expUnix}`).digest("hex");
}

/**
 * Emite credențiale pe termen scurt pentru ca **browserul** să apeleze direct report-service
 * (POST /reports, /reports/preview), fără a expune REPORT_SERVICE_SECRET.
 */
export async function POST(_req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    getLabActorFromRequest(_req);
    const { testId } = await params;
    const baseUrl = process.env.REPORT_SERVICE_URL?.trim();
    const secret = process.env.REPORT_SERVICE_SECRET?.trim();
    if (!baseUrl || !secret) {
      return NextResponse.json(
        { error: "Configurați REPORT_SERVICE_URL și REPORT_SERVICE_SECRET." },
        { status: 503 },
      );
    }

    const badUrl = vercelInvalidReportUrlMessage(baseUrl);
    if (badUrl) {
      return NextResponse.json({ error: badUrl + vercelReportDurationHint() }, { status: 503 });
    }

    const { data: test, error: tErr } = await supabase
      .from("tests")
      .select("test_type")
      .eq("id", testId)
      .single();
    if (tErr) throw tErr;

    if (
      test.test_type !== "ucs" &&
      test.test_type !== "young" &&
      test.test_type !== "point_load" &&
      test.test_type !== "triaxial_rock" &&
      test.test_type !== "unconfined_soil" &&
      test.test_type !== "absorption_porosity_rock"
    ) {
      return NextResponse.json(
        {
          error:
            "Raport PDF disponibil pentru UCS, Young (D7012), Triaxial rocă (D7012), Point load (D5731), compresiune monoaxială pământ (ISO 17892-7) și absorbție/porozitate (ISO 13755).",
        },
        { status: 400 },
      );
    }

    const expUnix = Math.floor(Date.now() / 1000) + TOKEN_TTL_SEC;
    const token = signReportToken(secret, testId, expUnix);

    return NextResponse.json({
      ok: true,
      reportServiceUrl: baseUrl.replace(/\/$/, ""),
      token,
      expiresAt: expUnix,
      testId,
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
