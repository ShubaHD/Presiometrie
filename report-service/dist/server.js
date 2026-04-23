import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import express from "express";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPresiometryPayload } from "./payload.js";
import { htmlToPdf } from "./pdf.js";
import { loadTemplateConfig, renderUcsHtml } from "./render.js";
import { toErrorMessage } from "./to-error-message.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const templatesRoot = process.env.TEMPLATES_DIR?.trim() || path.join(process.cwd(), "templates");
const app = express();
/** CORS înainte de body parser — răspuns rapid la OPTIONS (browser → report-service). */
app.use((req, res, next) => {
    const origin = process.env.REPORT_SERVICE_CORS_ORIGIN?.trim() || "*";
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, x-report-secret, x-report-token, x-report-token-exp");
    res.setHeader("Access-Control-Max-Age", "86400");
    if (req.method === "OPTIONS") {
        res.status(204).end();
        return;
    }
    next();
});
app.use(express.json({ limit: "1mb" }));
/** Trim + zero-width + ghilimele + `sb_sb_` duplicat pe cheie; URL → `origin`. */
function supabaseProjectUrlAndKey() {
    const strip = (s) => s.trim().replace(/[\u200b-\u200d\ufeff]/g, "");
    const rawUrl = strip(process.env.SUPABASE_URL ?? "").replace(/\s+/g, "");
    let key = strip(process.env.SUPABASE_SERVICE_ROLE_KEY ?? "");
    key = key.replace(/\u201c|\u201d/g, '"').replace(/\u2018|\u2019/g, "'");
    while ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
        key = strip(key.slice(1, -1));
    }
    while (key.startsWith("sb_sb_")) {
        key = key.slice(3);
    }
    if (!rawUrl || !key) {
        throw new Error("Configurați SUPABASE_URL și SUPABASE_SERVICE_ROLE_KEY.");
    }
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY pare un UUID, nu cheia API. În Supabase → Settings → API Keys folosiți Secret (service_role): sb_secret_… sau eyJ….");
    }
    if (key.startsWith("sb_publishable_")) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY este cheia Publishable. Folosiți Secret key (service_role) pe Railway.");
    }
    let url;
    try {
        const u = new URL(rawUrl);
        if (u.protocol !== "https:") {
            throw new Error("SUPABASE_URL trebuie să folosească https://.");
        }
        url = u.origin;
    }
    catch (e) {
        if (e instanceof Error && e.message.startsWith("SUPABASE_URL"))
            throw e;
        throw new Error("SUPABASE_URL invalid în variabilele de mediu (Railway). Copiați Project URL din Supabase → Settings → API (https://….supabase.co), fără spații sau ghilimele.");
    }
    return { url, key };
}
function timingSafeEqualHex(a, b) {
    try {
        const ba = Buffer.from(a, "utf8");
        const bb = Buffer.from(b, "utf8");
        if (ba.length !== bb.length)
            return false;
        return timingSafeEqual(ba, bb);
    }
    catch {
        return false;
    }
}
/** Acceptă x-report-secret (server) sau x-report-token + x-report-token-exp (browser, legat de testId). */
function requireSecretOrToken(req, res, testId) {
    const shared = process.env.REPORT_SERVICE_SECRET;
    if (!shared) {
        res.status(503).json({ error: "Configurați REPORT_SERVICE_SECRET." });
        return false;
    }
    const hdrSecretRaw = req.headers["x-report-secret"];
    const hdrSecret = Array.isArray(hdrSecretRaw) ? hdrSecretRaw[0] : hdrSecretRaw;
    if (hdrSecret === shared)
        return true;
    const tokenRaw = req.headers["x-report-token"];
    const expRawHdr = req.headers["x-report-token-exp"];
    const token = String(Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw ?? "").trim();
    const expRaw = String(Array.isArray(expRawHdr) ? expRawHdr[0] : expRawHdr ?? "").trim();
    const expSec = expRaw ? parseInt(expRaw, 10) : NaN;
    if (!token || !Number.isFinite(expSec)) {
        res.status(401).json({ error: "Neautorizat." });
        return false;
    }
    const now = Math.floor(Date.now() / 1000);
    if (expSec < now - 60 || expSec > now + 20 * 60) {
        res.status(401).json({ error: "Token expirat sau invalid." });
        return false;
    }
    const payload = `${testId}\n${expSec}`;
    const expected = createHmac("sha256", shared).update(payload).digest("hex");
    if (!timingSafeEqualHex(expected, token)) {
        res.status(401).json({ error: "Neautorizat." });
        return false;
    }
    return true;
}
/** Valoare din Postgres enum / JSON — normalizată pentru comparații sigure. */
function normalizeTestTypeForReport(raw) {
    if (raw == null)
        return "";
    return String(raw)
        .trim()
        .toLowerCase()
        .replace(/[\u200b-\u200d\ufeff]/g, "");
}
/** Ultimul segment al căii în Storage — compatibil cu fișiere / URL (fără `/`, `:`, etc.). */
function sanitizeStorageFileSegment(raw) {
    const s = String(raw ?? "")
        .trim()
        .replace(/[\u200b-\u200d\ufeff]/g, "");
    if (!s)
        return "fara-cod-proba";
    let out = s
        .replace(/[/\\:*?"<>|]+/g, "-")
        .replace(/[\x00-\x1f\x7f]+/g, "")
        .replace(/\s+/g, "_")
        .replace(/_+/g, "_")
        .replace(/^-+|-+$/g, "");
    if (!out)
        return "fara-cod-proba";
    if (out.length > 120)
        out = out.slice(0, 120);
    return out;
}
async function buildHtmlForTest(testId) {
    const { url: supabaseUrl, key: supabaseKey } = supabaseProjectUrlAndKey();
    const supabase = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: tRow, error: tErr } = await supabase.from("tests").select("test_type").eq("id", testId).single();
    if (tErr)
        throw tErr;
    const testTypeRaw = tRow.test_type;
    const testType = normalizeTestTypeForReport(testTypeRaw);
    const templateFolder = testType === "presiometry_program_a" || testType === "presiometry_program_b" || testType === "presiometry_program_c"
        ? "iso22476-5-presiometry"
        : "";
    if (!templateFolder) {
        const display = testType || String(testTypeRaw ?? "").trim() || "(lipsă)";
        throw new Error(`Tip test nesuportat pentru raport: ${display}. Permis: presiometry_program_a|b|c.`);
    }
    const cfg = await loadTemplateConfig(templatesRoot, templateFolder);
    let reportFileTag;
    if (testType === "presiometry_program_a")
        reportFileTag = "presiometry_program_a";
    else if (testType === "presiometry_program_b")
        reportFileTag = "presiometry_program_b";
    else
        reportFileTag = "presiometry_program_c";
    const payload = await buildPresiometryPayload(supabase, testId, cfg.templateCode, cfg.version, cfg.sections);
    const html = await renderUcsHtml(templatesRoot, templateFolder, payload, cfg);
    const sampleCode = typeof payload.sample?.code === "string" ? payload.sample.code : "";
    return {
        html,
        templateCode: cfg.templateCode,
        templateVersion: cfg.version,
        reportFileTag,
        sampleCode,
    };
}
app.get("/", (_req, res) => {
    res.type("application/json").json({
        ok: true,
        service: "presiometrie-report-service",
        hint: "Stare: GET /health — PDF: POST /reports (cu antet x-report-secret sau token).",
    });
});
app.get("/health", (_req, res) => {
    res.json({ ok: true, service: "presiometrie-report-service" });
});
/** Previzualizare HTML (același conținut ca PDF-ul), fără salvare. */
app.post("/reports/preview", async (req, res) => {
    try {
        const testId = req.body?.testId;
        if (!testId) {
            res.status(400).json({ error: "Lipsește testId." });
            return;
        }
        if (!requireSecretOrToken(req, res, testId))
            return;
        const { html, templateCode, templateVersion } = await buildHtmlForTest(testId);
        res.json({ ok: true, html, templateCode, templateVersion });
    }
    catch (e) {
        res.status(500).json({ error: toErrorMessage(e) });
    }
});
app.post("/reports", async (req, res) => {
    try {
        const testId = req.body?.testId;
        if (!testId) {
            res.status(400).json({ error: "Lipsește testId." });
            return;
        }
        if (!requireSecretOrToken(req, res, testId))
            return;
        let supabaseUrl;
        let supabaseKey;
        try {
            const env = supabaseProjectUrlAndKey();
            supabaseUrl = env.url;
            supabaseKey = env.key;
        }
        catch (e) {
            res.status(503).json({ error: toErrorMessage(e) });
            return;
        }
        const bucket = process.env.REPORTS_BUCKET?.trim() || "reports";
        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { html, templateCode, templateVersion, reportFileTag, sampleCode } = await buildHtmlForTest(testId);
        const pdfBuf = await htmlToPdf(html);
        const nameSeg = sanitizeStorageFileSegment(sampleCode);
        const pdfPath = `${testId}/${nameSeg}-${reportFileTag}-report-${Date.now()}.pdf`;
        const { error: upErr } = await supabase.storage.from(bucket).upload(pdfPath, pdfBuf, {
            contentType: "application/pdf",
            upsert: false,
        });
        if (upErr) {
            res.status(500).json({ error: `Storage: ${upErr.message}` });
            return;
        }
        const { data: rep, error: repErr } = await supabase
            .from("reports")
            .insert({
            test_id: testId,
            template_code: templateCode,
            template_version: templateVersion,
            report_number: null,
            pdf_path: pdfPath,
        })
            .select("id")
            .single();
        if (repErr) {
            res.status(500).json({ error: repErr.message });
            return;
        }
        const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(pdfPath, 3600);
        res.json({
            ok: true,
            reportId: rep.id,
            pdfPath,
            signedUrl: signed?.signedUrl ?? null,
            templateCode,
            templateVersion,
        });
    }
    catch (e) {
        res.status(500).json({ error: toErrorMessage(e) });
    }
});
const port = Number(process.env.PORT) || 4000;
app.listen(port, () => {
    console.log(`report-service listening on :${port}`);
    console.log(`templates: ${templatesRoot}`);
});
