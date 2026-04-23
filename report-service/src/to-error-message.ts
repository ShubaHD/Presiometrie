/**
 * Extract a readable message from any error-like value.
 * PostgREST errors can be plain objects, not instances of Error.
 */
export function toErrorMessage(e: unknown): string {
  if (e === null || e === undefined) return "Eroare necunoscută";
  if (typeof e === "string") return e;
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.length > 0) {
      const parts = [o.message];
      if (typeof o.details === "string" && o.details.length > 0) parts.push(o.details);
      if (typeof o.hint === "string" && o.hint.length > 0) parts.push(o.hint);
      if (typeof o.code === "string" && o.code.length > 0) parts.push(`[${o.code}]`);
      return parts.join(" — ");
    }
  }
  if (e instanceof Error) {
    const parts = [e.message];
    let c: unknown = e.cause;
    let depth = 0;
    while (c instanceof Error && depth < 4) {
      if (c.message) parts.push(c.message);
      c = c.cause;
      depth += 1;
    }
    return parts.join(" — ");
  }
  try {
    return JSON.stringify(e);
  } catch {
    return "Eroare necunoscută";
  }
}

