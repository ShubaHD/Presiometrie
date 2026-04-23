"use client";

import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AccountPasswordCard } from "@/components/lab/account-password-card";
import { jsonLabHeaders, labUserFetchHeaders } from "@/lib/lab-client-user";
import { cn } from "@/lib/utils";
import { Loader2, Upload } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

export function LabSettingsPageClient() {
  const [companyName, setCompanyName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [website, setWebsite] = useState("");
  const [logoPath, setLogoPath] = useState<string | null>(null);
  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [logoPickName, setLogoPickName] = useState<string | null>(null);
  const [logoLoading, setLogoLoading] = useState(false);

  const load = useCallback(async () => {
    setMsg(null);
    try {
      const res = await fetch("/api/lab/profile");
      const j = (await res.json()) as {
        companyName?: string;
        address?: string;
        phone?: string;
        website?: string;
        logoPath?: string | null;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error ?? "Încărcare eșuată");
      setCompanyName(j.companyName ?? "");
      setAddress(j.address ?? "");
      setPhone(j.phone ?? "");
      setWebsite(j.website ?? "");
      setLogoPath(j.logoPath ?? null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!logoPath) {
      setLogoPreviewUrl(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/storage/signed-url?bucket=${encodeURIComponent("lab-files")}&path=${encodeURIComponent(logoPath)}`,
        );
        const j = (await res.json()) as { signedUrl?: string };
        if (!cancelled) setLogoPreviewUrl(j.signedUrl ?? null);
      } catch {
        if (!cancelled) setLogoPreviewUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [logoPath]);

  const onSaveText = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/lab/profile", {
        method: "PATCH",
        headers: jsonLabHeaders(),
        body: JSON.stringify({
          companyName,
          address,
          phone,
          website,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Salvare eșuată");
      setMsg("Date salvate. Vor apărea în antetul rapoartelor la următoarea generare / previzualizare.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  const onLogo = async (list: FileList | null) => {
    const file = list?.[0];
    if (!file) return;
    setLogoLoading(true);
    setBusy(true);
    setMsg(null);
    try {
      const fd = new FormData();
      fd.set("file", file);
      const res = await fetch("/api/lab/profile/logo", {
        method: "POST",
        headers: labUserFetchHeaders(),
        body: fd,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Upload eșuat");
      setLogoPath(j.logoPath ?? null);
      setMsg("Logo actualizat.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
      setLogoLoading(false);
    }
  };

  const onRemoveLogo = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/lab/profile/logo", { method: "DELETE" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Eroare");
      setLogoPath(null);
      setLogoPickName(null);
      setMsg("Logo eliminat.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-foreground text-xl font-semibold tracking-tight">Laborator — antet rapoarte</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Denumire, adresă, contact și logo apar în antetul tuturor rapoartelor PDF (ex. UCS). Puteți modifica
          oricând; schimbările se văd la următoarea previzualizare sau generare PDF.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Date firmă</CardTitle>
          <CardDescription>Text afișat lângă logo în raport.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="lab-company">Denumire firmă / laborator</Label>
            <Input
              id="lab-company"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={busy}
              placeholder="Ex.: S.C. Geoteh Lab S.R.L."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lab-address">Adresă</Label>
            <Textarea
              id="lab-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={busy}
              rows={3}
              placeholder="Str., nr., localitate, județ"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lab-phone">Telefon / contact</Label>
            <Input
              id="lab-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              disabled={busy}
              placeholder="+40 …"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="lab-web">Pagină web</Label>
            <Input
              id="lab-web"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              disabled={busy}
              placeholder="https://…"
            />
          </div>
          <Button type="button" onClick={() => void onSaveText()} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Salvează datele
          </Button>
        </CardContent>
      </Card>

      <AccountPasswordCard />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Logo</CardTitle>
          <CardDescription>PNG, JPEG sau SVG; max. 4 MB. Se afișează în stânga antetului.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {logoPreviewUrl ? (
            <div className="bg-muted/40 flex items-center justify-center rounded-md border p-4">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoPreviewUrl} alt="Logo laborator" className="max-h-24 max-w-full object-contain" />
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">Niciun logo încărcat.</p>
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <input
              id="lab-logo-file"
              type="file"
              accept="image/*"
              className="sr-only"
              disabled={busy}
              aria-label="Alege o imagine de logo (PNG, JPEG, SVG)"
              onChange={(e) => {
                const list = e.target.files;
                setLogoPickName(list?.[0]?.name ?? null);
                void onLogo(list);
              }}
            />
            <label
              htmlFor="lab-logo-file"
              className={cn(
                buttonVariants({ variant: "default", size: "default" }),
                "cursor-pointer gap-1.5 disabled:pointer-events-none disabled:opacity-50",
              )}
            >
              {logoLoading ? (
                <Loader2 className="size-4 shrink-0 animate-spin" />
              ) : (
                <Upload className="size-4 shrink-0" />
              )}
              {logoLoading ? "Se încarcă…" : "Alege logo"}
            </label>
            {logoPickName ? (
              <span className="text-muted-foreground min-w-0 max-w-full truncate text-sm" title={logoPickName}>
                {logoPickName}
              </span>
            ) : null}
            {logoPath ? (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void onRemoveLogo()}>
                Elimină logo
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {msg ? <p className="text-sm">{msg}</p> : null}
    </div>
  );
}
