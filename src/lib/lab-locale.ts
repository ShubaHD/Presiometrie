export type LabLocale = "ro" | "en";

const STORAGE_KEY = "presiometrie-lab-locale";

export function isLabLocale(s: string | null | undefined): s is LabLocale {
  return s === "ro" || s === "en";
}

export function readLabLocaleFromStorage(): LabLocale {
  if (typeof window === "undefined") return "ro";
  try {
    const t = localStorage.getItem(STORAGE_KEY);
    return isLabLocale(t) ? t : "ro";
  } catch {
    return "ro";
  }
}

export function writeLabLocaleToStorage(locale: LabLocale) {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
}
