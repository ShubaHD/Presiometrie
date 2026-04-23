/** Avertismente când Next rulează pe Vercel și report-service trebuie accesibil din cloud. */

export function isRunningOnVercel(): boolean {
  return process.env.VERCEL === "1";
}

/** Pe Vercel, localhost nu e PC-ul dezvoltatorului — apelul către report-service eșuează. */
export function vercelInvalidReportUrlMessage(baseUrl: string): string | null {
  if (!isRunningOnVercel()) return null;
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return "Pe Vercel, REPORT_SERVICE_URL nu poate fi localhost sau 127.0.0.1. Deploy report-service separat (ex. Railway/Render, vezi report-service/README.md) și în Vercel → Settings → Environment Variables setați URL public https://…";
    }
  } catch {
    return "REPORT_SERVICE_URL nu este un URL valid. Folosiți https://… către report-service.";
  }
  return null;
}

export function vercelReportDurationHint(): string {
  if (!isRunningOnVercel()) return "";
  return " PDF și previzualizarea merg din browser direct la report-service (token scurt); nu depind de limita ~10s a funcției Next pe Hobby. Redeploy report-service pentru CORS + autentificare token.";
}
