/** Avertismente când Next rulează pe Vercel și report-service trebuie accesibil din cloud. */

export function isRunningOnVercel(): boolean {
  return process.env.VERCEL === "1";
}

const ZW = /[\u200b-\u200d\ufeff]/g;

/** Curăță REPORT_SERVICE_URL din env (Vercel/Railway): spații, zero-width, ghilimele, prefix https lipsă. */
export function normalizeReportServiceBaseUrl(raw: string | undefined | null): string {
  let s = String(raw ?? "")
    .trim()
    .replace(ZW, "");
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim().replace(ZW, "");
  }
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s.replace(/^\/+/, "")}`;
  }
  return s.replace(/\/+$/, "");
}

export function normalizeReportServiceSecret(raw: string | undefined | null): string {
  let s = String(raw ?? "")
    .trim()
    .replace(ZW, "");
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim().replace(ZW, "");
  }
  return s;
}

/**
 * `baseUrl` deja normalizat cu `normalizeReportServiceBaseUrl`.
 * Pe Vercel: obligatoriu https și nu localhost.
 */
export function vercelInvalidReportUrlMessage(baseUrl: string): string | null {
  if (!isRunningOnVercel()) return null;
  if (!baseUrl.trim()) {
    return "REPORT_SERVICE_URL lipsește sau e gol. În Vercel: URL public https://… către report-service (ex. …up.railway.app).";
  }
  try {
    const u = new URL(baseUrl);
    if (u.protocol !== "https:") {
      return "Pe Vercel, REPORT_SERVICE_URL trebuie să înceapă cu https:// (nu http).";
    }
    const host = u.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
      return "Pe Vercel, REPORT_SERVICE_URL nu poate fi localhost sau 127.0.0.1. Deploy report-service separat (ex. Railway/Render, vezi report-service/README.md) și în Vercel → Environment Variables setați URL public https://…";
    }
  } catch {
    return "REPORT_SERVICE_URL nu este un URL valid. Exemplu: https://nume-serviciu.up.railway.app — fără spații la început/sfârșit, fără ghilimele în valoarea din Vercel.";
  }
  return null;
}

export function vercelReportDurationHint(): string {
  if (!isRunningOnVercel()) return "";
  return " PDF și previzualizarea merg din browser direct la report-service (token scurt); nu depind de limita ~10s a funcției Next pe Hobby. Redeploy report-service pentru CORS + autentificare token.";
}
