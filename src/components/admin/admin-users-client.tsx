"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

type ListedUser = {
  id: string;
  email: string | undefined;
  createdAt: string | undefined;
  lastSignInAt: string | null | undefined;
  bannedUntil?: string | null;
};

export function AdminUsersClient() {
  const [users, setUsers] = useState<ListedUser[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(true);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [formMsg, setFormMsg] = useState<string | null>(null);

  const [editEmailById, setEditEmailById] = useState<Record<string, string>>({});
  const [editPwdById, setEditPwdById] = useState<Record<string, string>>({});
  const [rowBusyById, setRowBusyById] = useState<Record<string, boolean>>({});
  const [rowMsgById, setRowMsgById] = useState<Record<string, string | null>>({});

  const loadUsers = useCallback(async () => {
    setLoadErr(null);
    setLoadingList(true);
    try {
      const res = await fetch("/api/admin/users", { credentials: "include" });
      const j = (await res.json()) as { users?: ListedUser[]; error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setUsers(j.users ?? []);
    } catch (e) {
      setLoadErr(e instanceof Error ? e.message : "Nu s-a putut încărca lista.");
      setUsers([]);
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function patchUser(
    userId: string,
    patch: { email?: string; password?: string; disabled?: boolean },
  ): Promise<void> {
    setRowMsgById((m) => ({ ...m, [userId]: null }));
    setRowBusyById((b) => ({ ...b, [userId]: true }));
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setRowMsgById((m) => ({ ...m, [userId]: "Salvat." }));
      await loadUsers();
    } catch (e) {
      setRowMsgById((m) => ({
        ...m,
        [userId]: e instanceof Error ? e.message : "Eroare la actualizare.",
      }));
    } finally {
      setRowBusyById((b) => ({ ...b, [userId]: false }));
    }
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setFormMsg(null);
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim(),
          password,
          displayName: displayName.trim() || undefined,
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error ?? `HTTP ${res.status}`);
      setFormMsg("Utilizator creat. Poate intra cu emailul și parola setate.");
      setEmail("");
      setPassword("");
      setDisplayName("");
      await loadUsers();
    } catch (e) {
      setFormMsg(e instanceof Error ? e.message : "Eroare la creare.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilizator nou</CardTitle>
          <CardDescription>
            Se creează cont în Supabase Auth cu parolă. Rol implicit: <strong>lab_user</strong>. Pentru administrator,
            promovați în SQL (vezi docs/BACKUP.md).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => void onCreate(e)} className="space-y-4 max-w-md">
            <div className="space-y-2">
              <Label htmlFor="new-email">Email</Label>
              <Input
                id="new-email"
                type="email"
                autoComplete="off"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-name">Nume afișat (opțional)</Label>
              <Input
                id="new-name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                disabled={busy}
                placeholder="Ex.: Post laborator 2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-password">Parolă inițială</Label>
              <Input
                id="new-password"
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={busy}
                required
                minLength={8}
                placeholder="Minim 8 caractere"
              />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              Creează utilizator
            </Button>
            {formMsg ? <p className="text-muted-foreground text-sm">{formMsg}</p> : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Utilizatori înregistrați</CardTitle>
          <CardDescription>Până la 100 de conturi (pagina 1). Lista vine din Supabase Auth.</CardDescription>
        </CardHeader>
        <CardContent>
          {loadingList ? (
            <p className="text-muted-foreground text-sm">Se încarcă…</p>
          ) : loadErr ? (
            <p className="text-destructive text-sm">{loadErr}</p>
          ) : users.length === 0 ? (
            <p className="text-muted-foreground text-sm">Niciun utilizator.</p>
          ) : (
            <ul className="divide-border divide-y rounded-md border text-sm">
              {users.map((u) => {
                const rowBusy = !!rowBusyById[u.id];
                const msg = rowMsgById[u.id];
                const bannedUntil = u.bannedUntil ?? null;
                const disabled = !!(bannedUntil && new Date(bannedUntil).getTime() > Date.now());
                const editEmail = editEmailById[u.id] ?? (u.email ?? "");
                const editPwd = editPwdById[u.id] ?? "";

                return (
                  <li key={u.id} className="flex flex-col gap-3 px-3 py-3">
                    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-medium break-all">{u.email ?? u.id}</p>
                        <p className="text-muted-foreground text-xs break-all">{u.id}</p>
                      </div>
                      <div className="text-muted-foreground text-xs">
                        creat: {u.createdAt ? new Date(u.createdAt).toLocaleString("ro-RO") : "—"}
                        {disabled ? (
                          <span className="text-destructive ml-2">blocat</span>
                        ) : (
                          <span className="ml-2">activ</span>
                        )}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label htmlFor={`email-${u.id}`}>Email (user)</Label>
                        <Input
                          id={`email-${u.id}`}
                          type="email"
                          value={editEmail}
                          onChange={(e) => setEditEmailById((m) => ({ ...m, [u.id]: e.target.value }))}
                          disabled={rowBusy}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={rowBusy || !editEmail.trim()}
                          onClick={() => void patchUser(u.id, { email: editEmail.trim() })}
                        >
                          {rowBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                          Salvează email
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor={`pwd-${u.id}`}>Parolă nouă</Label>
                        <Input
                          id={`pwd-${u.id}`}
                          type="password"
                          value={editPwd}
                          onChange={(e) => setEditPwdById((m) => ({ ...m, [u.id]: e.target.value }))}
                          disabled={rowBusy}
                          placeholder="Minim 8 caractere"
                          minLength={8}
                        />
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={rowBusy || editPwd.trim().length < 8}
                          onClick={async () => {
                            await patchUser(u.id, { password: editPwd });
                            setEditPwdById((m) => ({ ...m, [u.id]: "" }));
                          }}
                        >
                          {rowBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                          Resetează parola
                        </Button>
                      </div>

                      <div className="space-y-2">
                        <Label>Status cont</Label>
                        <div className="flex flex-col gap-2">
                          <Button
                            type="button"
                            variant={disabled ? "secondary" : "destructive"}
                            disabled={rowBusy}
                            onClick={() => void patchUser(u.id, { disabled: !disabled })}
                          >
                            {rowBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                            {disabled ? "Deblochează" : "Blochează"}
                          </Button>
                          {bannedUntil ? (
                            <p className="text-muted-foreground text-xs break-all">
                              banned până la: {new Date(bannedUntil).toLocaleString("ro-RO")}
                            </p>
                          ) : (
                            <p className="text-muted-foreground text-xs">—</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {msg ? (
                      <p className={msg === "Salvat." ? "text-muted-foreground text-xs" : "text-destructive text-xs"}>{msg}</p>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
