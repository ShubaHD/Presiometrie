/**
 * Etichete pentru rezultate presiometrie: notație scurtă + ce reprezintă (UI / raport).
 * GL = gamă liniară (încărcare), GU = descărcare, GR = reîncărcare, GUR = modul pe buclă (Program B).
 */
const S = " — ";

export function labelGl1Slope(axisLabel: string, isManual: boolean): string {
  const left = isManual ? `GL1: |Δp/Δ${axisLabel}|` : `GL1 (30–70%): |Δp/Δ${axisLabel}|`;
  const right = isManual
    ? `modul pantei |Δp/Δ${axisLabel}| pe prima încărcare, interval ales manual; folosit la modulul presiometric Ep`
    : `modul pantei |Δp/Δ${axisLabel}| pe prima încărcare, în fereastra automată 30–70% din creșterea de presiune; folosit la Ep`;
  return `${left}${S}${right}`;
}

export function labelGl1R2(): string {
  return `GL1: R²${S}coeficient de determinare al regresiei liniare pe GL1 (1 = potrivire perfectă)`;
}

export function labelGl1N(): string {
  return `GL1: N puncte${S}număr de puncte din serie folosite la regresia liniară GL1`;
}

/** Modul Menard Em din GL1 (ν = 0,33). */
export function labelMenardEmGl1(xKind: "radius_mm" | "volume_cm3", axisLabel: string): string {
  if (xKind === "volume_cm3") {
    return `Em (Menard, GL1)${S}E = 2(1+ν)·V_mediu·|Δp/Δ${axisLabel}|, V (cm³) din GL1; ν = 0,33 (uzual drenat)`;
  }
  return `Em (Menard, GL1)${S}E = (1+ν)·R_mediu·|Δp/Δ${axisLabel}|, R (mm) din GL1; ν = 0,33 (uzual drenat)`;
}

export function labelGuSlope(i: number, axisLabel: string, isManual: boolean): string {
  const mode = isManual ? " (manual)" : " (30–70%)";
  const mid = isManual ? "interval manual" : "fereastră automată 30–70%";
  return `GU${i}: |Δp/Δ${axisLabel}|${mode}${S}modul pantei |Δp/Δ${axisLabel}| pe ramura de descărcare, bucla ${i} (${mid}); rigiditate la descărcare`;
}

export function labelGuR2(i: number): string {
  return `GU${i}: R²${S}calitatea regresiei liniare pe descărcare (bucla ${i})`;
}

export function labelGrSlope(i: number, axisLabel: string, isManual: boolean): string {
  const mode = isManual ? " (manual)" : " (30–70%)";
  const mid = isManual ? "interval manual" : "fereastră automată 30–70%";
  return `GR${i}: |Δp/Δ${axisLabel}|${mode}${S}modul pantei |Δp/Δ${axisLabel}| pe ramura de reîncărcare, bucla ${i} (${mid}); rigiditate la reîncărcare`;
}

export function labelGrR2(i: number): string {
  return `GR${i}: R²${S}calitatea regresiei liniare pe reîncărcare (bucla ${i})`;
}

export function labelGurSlope(i: number, axisLabel: string, isManual: boolean): string {
  const mode = isManual ? " (manual)" : " (mijloc buclă)";
  const right = isManual
    ? `modul |Δp/Δ${axisLabel}| pe ramura de reîncărcare, bucla ${i}, interval ales manual (Program B; Ep pe buclă)`
    : `modul |Δp/Δ${axisLabel}| în banda de presiune la mijlocul buclei (reîncărcare), bucla ${i} (Program B; Ep pe buclă)`;
  return `GUR${i}: |Δp/Δ${axisLabel}|${mode}${S}${right}`;
}

export function labelGurR2(i: number): string {
  return `GUR${i}: R²${S}calitatea regresiei liniare pentru GUR (bucla ${i})`;
}

export function labelGurN(i: number): string {
  return `GUR${i}: N puncte${S}număr de puncte folosite la regresia GUR (bucla ${i})`;
}
