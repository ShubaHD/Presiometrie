import { requireAuth } from "@/lib/auth/session";
import {
  normalizeReportServiceBaseUrl,
  normalizeReportServiceSecret,
  vercelInvalidReportUrlMessage,
  vercelReportDurationHint,
} from "@/lib/report-service-vercel";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

/** Previzualizare HTML raport (fără PDF / fără înregistrare în `reports`). */
export const maxDuration = 60;

type Params = { params: Promise<{ testId: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { testId } = await params;
    const baseUrl = normalizeReportServiceBaseUrl(process.env.REPORT_SERVICE_URL);
    const secret = normalizeReportServiceSecret(process.env.REPORT_SERVICE_SECRET);
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

    const url = `${baseUrl.replace(/\/$/, "")}/reports/preview`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-report-secret": secret,
        },
        body: JSON.stringify({ testId }),
        signal: AbortSignal.timeout(55_000),
      });
    } catch (e) {
      return NextResponse.json(
        {
          error: `${toErrorMessage(e)}. Verificați că report-service rulează public (HTTPS), că URL-ul e accesibil din rețeaua unde rulează Next și că secretul coincide.${vercelReportDurationHint()}`,
        },
        { status: 502 },
      );
    }

    const json = (await res.json()) as { ok?: boolean; html?: string; error?: string };
    if (!res.ok) {
      return NextResponse.json(
        { error: typeof json.error === "string" ? json.error : "Eroare report-service" },
        { status: res.status },
      );
    }
    if (!json.html || typeof json.html !== "string") {
      return NextResponse.json({ error: "Răspuns previzualizare invalid." }, { status: 502 });
    }

    return new NextResponse(json.html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
