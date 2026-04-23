"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createBrowserSupabaseClient } from "@/lib/supabase/browser";
import { Loader2 } from "lucide-react";
import { useState } from "react";

const MIN_LEN = 8;

export function AccountPasswordCard() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    if (next.length < MIN_LEN) {
      setMsg(`Parola nouă trebuie să aibă cel puțin ${MIN_LEN} caractere.`);
      return;
    }
    if (next !== again) {
      setMsg("Parolele noi nu coincid.");
      return;
    }
    setBusy(true);
    try {
      const supabase = createBrowserSupabaseClient();
      if (current.trim()) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        const email = user?.email;
        if (!email) {
          setMsg("Nu s-a putut citi emailul contului.");
          return;
        }
        const { error: signErr } = await supabase.auth.signInWithPassword({
          email,
          password: current,
        });
        if (signErr) {
          setMsg("Parola actuală este incorectă.");
          return;
        }
      }
      const { error } = await supabase.auth.updateUser({ password: next });
      if (error) {
        setMsg(error.message);
        return;
      }
      setCurrent("");
      setNext("");
      setAgain("");
      setMsg("Parola a fost actualizată.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Eroare la actualizare.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Parolă cont</CardTitle>
        <CardDescription>
          Schimbați parola pentru contul cu care sunteți autentificat. Introduceți parola actuală pentru verificare.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="pwd-current">Parola actuală</Label>
            <Input
              id="pwd-current"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              disabled={busy}
              placeholder="Obligatorie la schimbare"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd-new">Parola nouă</Label>
            <Input
              id="pwd-new"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => setNext(e.target.value)}
              disabled={busy}
              placeholder={`Minim ${MIN_LEN} caractere`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="pwd-again">Repetați parola nouă</Label>
            <Input
              id="pwd-again"
              type="password"
              autoComplete="new-password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              disabled={busy}
            />
          </div>
          <Button type="submit" disabled={busy || !current.trim() || !next.trim() || !again.trim()}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Actualizează parola
          </Button>
          {msg ? <p className="text-muted-foreground text-sm">{msg}</p> : null}
        </form>
      </CardContent>
    </Card>
  );
}
