"use client";

import { type LabLocale, isLabLocale, readLabLocaleFromStorage, writeLabLocaleToStorage } from "@/lib/lab-locale";
import { createContext, useCallback, useContext, useEffect, useState } from "react";

type LabLocaleContextValue = { locale: LabLocale; setLocale: (l: LabLocale) => void };

const LabLocaleContext = createContext<LabLocaleContextValue | null>(null);

export function LabLocaleProvider({ children }: { children: React.ReactNode }) {
  const [locale, setState] = useState<LabLocale>("ro");

  useEffect(() => {
    setState(readLabLocaleFromStorage());
  }, []);

  const setLocale = useCallback((l: LabLocale) => {
    if (!isLabLocale(l)) return;
    writeLabLocaleToStorage(l);
    setState(l);
  }, []);

  return <LabLocaleContext.Provider value={{ locale, setLocale }}>{children}</LabLocaleContext.Provider>;
}

export function useLabLocale() {
  const c = useContext(LabLocaleContext);
  if (!c) {
    return { locale: "ro" as const, setLocale: (_: LabLocale) => {} };
  }
  return c;
}
