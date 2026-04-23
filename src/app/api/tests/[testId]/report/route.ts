import {
  normalizeReportServiceBaseUrl,
  normalizeReportServiceSecret,
  vercelInvalidReportUrlMessage,
  vercelReportDurationHint,
} from "@/lib/report-service-vercel";
import { requireAuth } from "@/lib/auth/session";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

/**
 * Generarea PDF poate dura mult (Puppeteer). Varianta implicită folosește SSE cu
 * keepalive. Dacă browserul/proxy-ul întrerupe fluxul, clientul poate reîncerca cu
 * header X-ROCA-Report-Sync: 1 (răspuns JSON unic la final).
 */
export const maxDuration = 300;
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ testId: string }> };

const UPSTREAM_REPORT_MS = 240_000;
const KEEPALIVE_MS = 12_000;

type ForwardResult = { ok: boolean; status: number; body: Record<string, unknown> };

async function forwardToReportService(
  testId: string,
  baseUrl: string,
  secret: string,
  opts?: { locale?: "ro" | "en" },
): Promise<ForwardResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/reports`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-report-secret": secret,
      },
      body: JSON.stringify({ testId, locale: opts?.locale === "en" ? "en" : "ro" }),
      signal: AbortSignal.timeout(UPSTREAM_REPORT_MS),
    });
    let json: Record<string, unknown>;
    try {
      json = (await res.json()) as Record<string, unknown>;
    } catch {
      return {
        ok: false,
        status: 502,
        body: { error: "Răspuns invalid de la report-service (non-JSON)." },
      };
    }
    return { ok: res.ok, status: res.status, body: json };
  } catch (e) {
    const msg = toErrorMessage(e);
    return {
      ok: false,
      status: 502,
      body: {
        error: `${msg}. Verificați că report-service rulează public, că REPORT_SERVICE_URL este corect (HTTPS) și că REPORT_SERVICE_SECRET coincide. Din rețeaua Vercel trebuie să fie accesibil (nu localhost).${vercelReportDurationHint()}`,
      },
    };
  }
}

export async function POST(req: Request, { params }: Params) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { testId } = await params;
    const rawReportUrl = process.env.REPORT_SERVICE_URL;
    const baseUrl = normalizeReportServiceBaseUrl(rawReportUrl);
    const secret = normalizeReportServiceSecret(process.env.REPORT_SERVICE_SECRET);
    const rawUrlTrim = String(rawReportUrl ?? "").trim();
    if (!secret && !rawUrlTrim) {
      return NextResponse.json(
        { error: "Configurați REPORT_SERVICE_URL și REPORT_SERVICE_SECRET." },
        { status: 503 },
      );
    }
    if (!secret) {
      return NextResponse.json(
        { error: "Configurați REPORT_SERVICE_SECRET (același ca pe report-service / Railway)." },
        { status: 503 },
      );
    }
    if (!baseUrl) {
      if (!rawUrlTrim) {
        return NextResponse.json(
          { error: "Configurați REPORT_SERVICE_URL (URL public https://… către report-service, ex. Railway)." },
          { status: 503 },
        );
      }
      return NextResponse.json(
        {
          error:
            "REPORT_SERVICE_URL nu poate fi interpretat ca URL valid. În Vercel: copiați din Railway doar baza https://….up.railway.app (fără spații, fără ghilimele, fără text în plus). Salvați și Redeploy.",
        },
        { status: 503 },
      );
    }

    const badUrl = vercelInvalidReportUrlMessage(baseUrl);
    if (badUrl) {
      return NextResponse.json({ error: badUrl + vercelReportDurationHint() }, { status: 503 });
    }

    const { data: test, error: tErr } = await supabase.from("tests").select("test_type").eq("id", testId).single();
    if (tErr) throw tErr;

    if (
      test.test_type !== "presiometry_program_a" &&
      test.test_type !== "presiometry_program_b" &&
      test.test_type !== "presiometry_program_c"
    ) {
      return NextResponse.json(
        {
          error: "Generarea PDF este disponibilă doar pentru Presiometrie (SR EN ISO 22476-5) Program A/B/C.",
        },
        { status: 400 },
      );
    }

    const sync = req.headers.get("x-roca-report-sync") === "1";

    let reportLocale: "ro" | "en" = "ro";
    try {
      const b = (await req.json()) as { locale?: string } | null;
      if (b?.locale === "en") reportLocale = "en";
    } catch {
      /* fără corp JSON */
    }

    if (sync) {
      const out = await forwardToReportService(testId, baseUrl, secret, { locale: reportLocale });
      const errMsg =
        typeof out.body.error === "string" ? out.body.error : "Eroare report-service";
      if (!out.ok) {
        const st = out.status >= 400 && out.status < 600 ? out.status : 502;
        return NextResponse.json({ error: errMsg }, { status: st });
      }
      return NextResponse.json(out.body);
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const ping = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(": keepalive\n\n"));
          } catch {
            /* stream închis */
          }
        }, KEEPALIVE_MS);
        try {
          const out = await forwardToReportService(testId, baseUrl, secret, { locale: reportLocale });
          if (!out.ok) {
            const errMsg =
              typeof out.body.error === "string" ? out.body.error : "Eroare report-service";
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errMsg })}\n\n`));
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(out.body)}\n\n`));
          }
          controller.close();
        } catch (e) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ error: toErrorMessage(e) })}\n\n`),
          );
          controller.close();
        } finally {
          clearInterval(ping);
        }
      },
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
