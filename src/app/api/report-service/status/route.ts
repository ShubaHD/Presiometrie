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

  const rawReportUrl = process.env.REPORT_SERVICE_URL;
  const rawUrlTrim = String(rawReportUrl ?? "").trim();
  const baseUrl = normalizeReportServiceBaseUrl(rawReportUrl);
  const secretSet = Boolean(normalizeReportServiceSecret(process.env.REPORT_SERVICE_SECRET));

  if (!secretSet && !rawUrlTrim) {
    return NextResponse.json({
      ok: false,
      configured: false,
      reportServiceUrlSet: false,
      reportServiceSecretSet: false,
      deployedOnVercel: isRunningOnVercel(),
      hint: isRunningOnVercel()
        ? "În Vercel → Settings → Environment Variables setați REPORT_SERVICE_URL (URL public https://… către report-service) și REPORT_SERVICE_SECRET, apoi redeploy."
        : "În .env.local setați REPORT_SERVICE_URL (ex. http://127.0.0.1:4000) și REPORT_SERVICE_SECRET (același string ca în report-service), apoi reporniți Next.",
    });
  }
  if (!secretSet) {
    return NextResponse.json({
      ok: false,
      configured: false,
      reportServiceUrlSet: Boolean(rawUrlTrim),
      reportServiceSecretSet: false,
      deployedOnVercel: isRunningOnVercel(),
      hint: "Setați REPORT_SERVICE_SECRET (identic cu cel din report-service / Railway).",
    });
  }
  if (!baseUrl) {
    if (!rawUrlTrim) {
      return NextResponse.json({
        ok: false,
        configured: false,
        reportServiceUrlSet: false,
        reportServiceSecretSet: true,
        deployedOnVercel: isRunningOnVercel(),
        hint: "Setați REPORT_SERVICE_URL (baza publică https://… a report-service).",
      });
    }
    return NextResponse.json({
      ok: false,
      configured: true,
      reportServiceUrlSet: true,
      reportServiceUrlInvalid: true,
      reportServiceSecretSet: true,
      deployedOnVercel: isRunningOnVercel(),
      hint:
        "REPORT_SERVICE_URL nu poate fi interpretat ca URL valid. În Vercel: copiați din Railway doar https://….up.railway.app, fără spații sau ghilimele; Redeploy." +
        vercelReportDurationHint(),
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
