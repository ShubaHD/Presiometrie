import { createHash } from "crypto";

export interface LabActor {
  userId: string;
  displayName: string;
}

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v.trim());
}

/**
 * Identitatea „lucrătorului” pentru audit și lock.
 * Prioritate: header X-ROCA-User-Id + X-ROCA-User, apoi variabile server, apoi fallback.
 */
export function getLabActorFromRequest(req: Request, opts?: { fallbackUserId?: string | null }): LabActor {
  const headerIdRaw = req.headers.get("x-roca-user-id")?.trim();
  const headerName = req.headers.get("x-roca-user")?.trim();
  const envId = process.env.ROCA_LAB_USER_ID?.trim();
  const envName = process.env.ROCA_LAB_USER_NAME?.trim();

  const displayName = headerName || envName || headerIdRaw || envId || "laborator";

  // IMPORTANT: `created_by_user_id` / `locked_by_user_id` sunt UUID-uri în DB.
  // Browser headers may contain arbitrary strings (legacy lab UI), so ignore non-UUID ids.
  const headerId = headerIdRaw && isUuid(headerIdRaw) ? headerIdRaw : "";
  const envUuid = envId && isUuid(envId) ? envId : "";
  const fallback = opts?.fallbackUserId?.trim() && isUuid(opts.fallbackUserId.trim()) ? opts.fallbackUserId.trim() : "";

  const userId = headerId || envUuid || fallback || slugUserId(displayName);

  return { userId, displayName };
}

function slugUserId(name: string): string {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (base.length >= 3) return base;
  return `u-${createHash("sha256").update(name).digest("hex").slice(0, 8)}`;
}
