const ZW = /[\u200b-\u200d\ufeff]/g;

/** Chei Supabase (anon / service_role): fără zero-width, ghilimele exterioare, prefix `sb_sb_` duplicat. */
export function sanitizeSupabaseKey(raw: string | undefined | null): string {
  let s = String(raw ?? "")
    .trim()
    .replace(ZW, "");
  s = s.replace(/\u201c|\u201d/g, '"').replace(/\u2018|\u2019/g, "'");
  while ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    s = s.slice(1, -1).trim().replace(ZW, "");
  }
  while (s.startsWith("sb_sb_")) {
    s = s.slice(3);
  }
  return s;
}

/** URL proiect: spații/CR, ghilimele, apoi `origin` (aceeași familie de curățare ca la report-service). */
export function sanitizeSupabaseUrl(raw: string | undefined | null): string {
  let s = sanitizeSupabaseKey(raw).replace(/\s+/g, "");
  if (!s) return "";
  if (!/^https?:\/\//i.test(s)) {
    s = `https://${s.replace(/^\/+/, "")}`;
  }
  if (/^http:\/\//i.test(s)) {
    s = `https://${s.slice(7)}`;
  }
  try {
    const u = new URL(s);
    if (!u.hostname) return "";
    return u.origin;
  } catch {
    return "";
  }
}
