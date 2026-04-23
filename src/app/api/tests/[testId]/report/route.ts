import {
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
): Promise<ForwardResult> {
  const url = `${baseUrl.replace(/\/$/, "")}/reports`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-report-secret": secret,
      },
      body: JSON.stringify({ testId }),
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
    const baseUrl = process.env.REPORT_SERVICE_URL;
    const secret = process.env.REPORT_SERVICE_SECRET;
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

    const { data: test, error: tErr } = await supabase.from("tests").select("test_type").eq("id", testId).single();
    if (tErr) throw tErr;

    if (
      test.test_type !== "ucs" &&
      test.test_type !== "young" &&
      test.test_type !== "point_load" &&
      test.test_type !== "triaxial_rock" &&
      test.test_type !== "unconfined_soil" &&
      test.test_type !== "absorption_porosity_rock" &&
      test.test_type !== "presiometry"
    ) {
      return NextResponse.json(
        {
          error:
            "Generarea PDF este disponibilă pentru testele UCS, Young, Triaxial (ASTM D7012), Point load (ASTM D5731), Compresiune monoaxială (ISO 17892-7), Absorbție/Porozitate (ISO 13755) și Presiometrie (ISO 22476-5).",
        },
        { status: 400 },
      );
    }

    const sync = req.headers.get("x-roca-report-sync") === "1";

    if (sync) {
      const out = await forwardToReportService(testId, baseUrl, secret);
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
          const out = await forwardToReportService(testId, baseUrl, secret);
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
