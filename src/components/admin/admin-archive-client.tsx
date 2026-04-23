"use client";

import { purgeConfirmationPhrase } from "@/lib/admin/year-archive";
import { useState } from "react";

export function AdminArchiveClient() {
  const yearNow = new Date().getUTCFullYear();
  const [year, setYear] = useState(yearNow);
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState<"export" | "purge" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const phrase = purgeConfirmationPhrase(year);

  async function exportYear() {
    setError(null);
    setMessage(null);
    setBusy("export");
    try {
      const res = await fetch(`/api/admin/export-year?year=${year}`, { credentials: "include" });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `roca-export-${year}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      setMessage("Export descărcat.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare export.");
    } finally {
      setBusy(null);
    }
  }

  async function purgeYear() {
    setError(null);
    setMessage(null);
    setBusy("purge");
    try {
      const res = await fetch("/api/admin/purge-year", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year, confirmation }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; deletedProjects?: number };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setMessage(
        `Golire finalizată: ${j.deletedProjects ?? 0} proiecte șterse pentru anul ${year}. Verificați Storage dacă lipsește ceva.`,
      );
      setConfirmation("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Eroare la golire.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6 rounded-lg border p-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor="archive-year" className="text-sm font-medium">
            An (UTC)
          </label>
          <input
            id="archive-year"
            type="number"
            min={1970}
            max={2100}
            value={year}
            onChange={(e) => setYear(parseInt(e.target.value, 10) || yearNow)}
            className="border-input bg-background focus-visible:ring-ring w-28 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
          />
        </div>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => void exportYear()}
          className="bg-secondary text-secondary-foreground hover:bg-secondary/90 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
        >
          {busy === "export" ? "Se exportă…" : "Descarcă export JSON"}
        </button>
      </div>

      <div className="border-t pt-4">
        <h2 className="text-sm font-semibold">Golire aplicație (ireversibil)</h2>
        <p className="text-muted-foreground mt-1 text-xs">
          Șterge proiectele din an (cascade: foraje, probe, teste, rapoarte) și fișierele Storage asociate din bucket-urile lab-files,
          reports, lab-imports. Nu modifică <code className="bg-muted rounded px-1">lab_profile</code>.
        </p>
        <p className="text-muted-foreground mt-2 text-xs">
          Confirmați tastând exact: <code className="bg-muted rounded px-1">{phrase}</code>
        </p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={phrase}
            className="border-input bg-background focus-visible:ring-ring min-w-0 flex-1 rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
            autoComplete="off"
          />
          <button
            type="button"
            disabled={busy !== null || confirmation.trim() !== phrase}
            onClick={() => void purgeYear()}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 rounded-md px-4 py-2 text-sm font-medium disabled:opacity-50"
          >
            {busy === "purge" ? "Se șterge…" : "Șterge datele anului"}
          </button>
        </div>
      </div>

      {message ? <p className="text-sm text-green-700 dark:text-green-400">{message}</p> : null}
      {error ? <p className="text-destructive text-sm">{error}</p> : null}
    </div>
  );
}
