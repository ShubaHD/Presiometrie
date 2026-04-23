import { createHash } from "crypto";

export interface LabActor {
  userId: string;
  displayName: string;
}

/**
 * Identitatea „lucrătorului” pentru audit și lock.
 * Prioritate: header X-ROCA-User-Id + X-ROCA-User, apoi variabile server, apoi fallback.
 */
export function getLabActorFromRequest(req: Request): LabActor {
  const headerId = req.headers.get("x-roca-user-id")?.trim();
  const headerName = req.headers.get("x-roca-user")?.trim();
  const envId = process.env.ROCA_LAB_USER_ID?.trim();
  const envName = process.env.ROCA_LAB_USER_NAME?.trim();

  const displayName = headerName || envName || headerId || envId || "laborator";
  const userId = headerId || envId || slugUserId(displayName);

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
