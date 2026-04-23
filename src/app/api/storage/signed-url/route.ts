import { requireAuth } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { reportsStorageBucket } from "@/lib/reports-bucket";
import { toErrorMessage } from "@/lib/to-error-message";
import { NextResponse } from "next/server";

export async function GET(req: Request) {
  try {
    const auth = await requireAuth();
    if (!auth.ok) return auth.res;
    const { supabase } = auth;
    const { searchParams } = new URL(req.url);
    const bucket = searchParams.get("bucket");
    const pathRaw = searchParams.get("path");
    if (!bucket || !pathRaw) {
      return NextResponse.json({ error: "Parametri bucket și path obligatorii." }, { status: 400 });
    }
    const path = decodeURIComponent(pathRaw).replace(/^\/+/, "");

    const reportsBucket = reportsStorageBucket();
    const isReportsBucket = bucket === reportsBucket || bucket === "reports";

    if (isReportsBucket) {
      let admin;
      try {
        admin = createAdminClient();
      } catch (e) {
        return NextResponse.json(
          {
            error: toErrorMessage(e),
            hint: "Pentru deschiderea PDF-urilor din bucketul rapoarte, setați SUPABASE_SERVICE_ROLE_KEY pe serverul Next (Vercel), identic cu cel folosit de report-service.",
          },
          { status: 503 },
        );
      }

      const { data: rep, error: repErr } = await admin
        .from("reports")
        .select("test_id")
        .eq("pdf_path", path)
        .maybeSingle();
      if (repErr) throw repErr;
      if (!rep) {
        return NextResponse.json(
          {
            error: "Nu există înregistrare de raport pentru acest fișier.",
            hint: "Reîncărcați pagina sau ștergeți rândul orfan din listă și generați din nou PDF-ul.",
          },
          { status: 404 },
        );
      }

      const { data: testRow, error: testErr } = await supabase
        .from("tests")
        .select("id")
        .eq("id", rep.test_id)
        .is("deleted_at", null)
        .maybeSingle();
      if (testErr) throw testErr;
      if (!testRow) {
        return NextResponse.json({ error: "Acces refuzat la acest raport." }, { status: 403 });
      }

      const { data, error } = await admin.storage.from(reportsBucket).createSignedUrl(path, 3600);
      if (error) {
        const msg = error.message?.toLowerCase() ?? "";
        if (msg.includes("not found") || msg.includes("object not found")) {
          return NextResponse.json(
            {
              error: "Fișierul PDF lipsește din storage (probabil șters manual sau neîncărcat).",
              hint: "Ștergeți rândul din „Rapoarte generate” și generați din nou raportul. Verificați că report-service și Next folosesc același proiect Supabase și același nume de bucket (REPORTS_BUCKET).",
            },
            { status: 404 },
          );
        }
        throw error;
      }
      return NextResponse.json({ signedUrl: data.signedUrl });
    }

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 3600);
    if (error) throw error;
    return NextResponse.json({ signedUrl: data.signedUrl });
  } catch (e) {
    return NextResponse.json({ error: toErrorMessage(e) }, { status: 500 });
  }
}
