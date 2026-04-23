import { requireAuth } from "@/lib/auth/session";
import {
  isRunningOnVercel,
  normalizeReportServiceBaseUrl,
  normalizeReportServiceSecret,
  vercelInvalidReportUrlMessage,
  vercelReportDurationHint,
} from "@/lib/report-service-vercel";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

/** Verifică din serverul Next dacă report-service e configurat și răspunde la GET /health. */
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireAuth();
  if (!auth.ok) return auth.res;

  const baseUrl = normalizeReportServiceBaseUrl(process.env.REPORT_SERVICE_URL);
  const secretSet = Boolean(normalizeReportServiceSecret(process.env.REPORT_SERVICE_SECRET));

  if (!baseUrl || !secretSet) {
    return NextResponse.json({
      ok: false,
      configured: false,
      reportServiceUrlSet: Boolean(baseUrl),
      reportServiceSecretSet: secretSet,
      deployedOnVercel: isRunningOnVercel(),
      hint: isRunningOnVercel()
        ? "În Vercel → Settings → Environment Variables setați REPORT_SERVICE_URL (URL public https://… către report-service) și REPORT_SERVICE_SECRET, apoi redeploy."
        : "În web/.env.local setați REPORT_SERVICE_URL (ex. http://localhost:4000) și REPORT_SERVICE_SECRET (același string ca în report-service), apoi reporniți Next.",
    });
  }

  const vercelBad = vercelInvalidReportUrlMessage(baseUrl);
  if (vercelBad) {
    return NextResponse.json({
      ok: false,
      configured: true,
      deployedOnVercel: true,
      reportServiceUrlInvalidOnVercel: true,
      reportServiceUrl: baseUrl,
      hint: vercelBad + vercelReportDurationHint(),
    });
  }

  const healthUrl = `${baseUrl.replace(/\/$/, "")}/health`;
  try {
    const res = await fetch(healthUrl, { signal: AbortSignal.timeout(8000) });
    const text = await res.text();
    let healthBody: unknown = null;
    try {
      healthBody = text ? JSON.parse(text) : null;
    } catch {
      healthBody = text.slice(0, 160);
    }
    if (!res.ok) {
      return NextResponse.json({
        ok: false,
        configured: true,
        deployedOnVercel: isRunningOnVercel(),
        reportServiceUrl: baseUrl,
        reachable: false,
        httpStatus: res.status,
        healthBody,
        hint:
          "report-service a răspuns cu eroare la /health. Verificați că serviciul rulează și că URL-ul din REPORT_SERVICE_URL indică acel serviciu." +
          vercelReportDurationHint(),
      });
    }
    return NextResponse.json({
      ok: true,
      configured: true,
      deployedOnVercel: isRunningOnVercel(),
      reportServiceUrl: baseUrl,
      reachable: true,
      health: healthBody,
      hint:
        "Next poate contacta report-service. PDF/previzualizare din aplicație folosesc apel direct din browser (token); dacă eșuează: redeploy report-service recent, bucket „reports” în Supabase, loguri Railway." +
        vercelReportDurationHint(),
    });
  } catch (e) {
    return NextResponse.json({
      ok: false,
      configured: true,
      deployedOnVercel: isRunningOnVercel(),
      reportServiceUrl: baseUrl,
      reachable: false,
      error: toErrorMessage(e),
      hint: isRunningOnVercel()
        ? "Next (Vercel) nu poate deschide această adresă. Folosiți un URL public https:// către report-service; localhost nu funcționează din cloud." +
          vercelReportDurationHint()
        : "Next nu poate deschide această adresă. Porniți report-service (report-service: npm run dev — port 4000) și folosiți http://127.0.0.1:4000 în REPORT_SERVICE_URL.",
    });
  }
}
