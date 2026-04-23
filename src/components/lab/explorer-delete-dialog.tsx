"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { jsonLabHeaders } from "@/lib/lab-client-user";
import { Loader2, Trash2 } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState, type MouseEvent } from "react";

export function ExplorerDeleteDialog(props: {
  apiUrl: string;
  title: string;
  description: string;
  /** Dacă `pathname` e egal sau începe cu acest prefix, navigăm după ștergere. */
  pathPrefix: string;
  redirectHref: string;
  disabled?: boolean;
  onDeleted: () => void;
  /** Stop propagation către rândul părinte (expand / link). */
  stopRowEvent?: boolean;
  /** `icon` = doar coș (explorer); `inline` = buton cu text pe pagini de detaliu. */
  layout?: "icon" | "inline";
  /** Cu `layout="inline"` — text pe buton (ex. „Șterge proiectul”). */
  inlineLabel?: string;
}) {
  const {
    apiUrl,
    title,
    description,
    pathPrefix,
    redirectHref,
    disabled,
    onDeleted,
    stopRowEvent = true,
    layout = "icon",
    inlineLabel = "Mută la coș",
  } = props;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const router = useRouter();
  const pathname = usePathname();

  const runDelete = async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch(apiUrl, { method: "DELETE", headers: jsonLabHeaders() });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Ștergere eșuată");
      onDeleted();
      setOpen(false);
      router.refresh();
      if (pathname === pathPrefix || pathname.startsWith(`${pathPrefix}/`)) {
        router.push(redirectHref);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const openDialog = (e: MouseEvent<HTMLButtonElement>) => {
    if (stopRowEvent) {
      e.preventDefault();
      e.stopPropagation();
    }
    setOpen(true);
    setErr(null);
  };

  return (
    <>
      {layout === "inline" ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="border-destructive/50 text-destructive hover:bg-destructive/10"
          disabled={disabled}
          onClick={openDialog}
        >
          <Trash2 className="size-4" />
          {inlineLabel}
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className="border-sidebar-border bg-sidebar-accent/40 text-sidebar-foreground hover:bg-destructive/15 hover:text-destructive size-7 shrink-0 shadow-sm"
          disabled={disabled}
          aria-label={`Șterge: ${title}`}
          title={title}
          onClick={openDialog}
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" showCloseButton={!busy}>
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="text-left">{description}</DialogDescription>
          </DialogHeader>
          {err && <p className="text-destructive text-sm">{err}</p>}
          <DialogFooter className="gap-2 sm:justify-end">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>
              Anulează
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={() => void runDelete()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Mută la coș
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
