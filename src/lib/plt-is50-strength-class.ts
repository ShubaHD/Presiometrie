/**
 * Clasificare orientativă a rezistenței rocii după indicele Is(50) (MPa), corectat la De = 50 mm.
 * Praguri aliniate uzului ISRM / literatură de geotehnică (Broch & Franklin, tabele echivalente UCS–PLT).
 * Nu înlocuiește clasificarea din norme naționale specifice; este ghid pentru raportare tehnică.
 */
export function classifyIs50MpaStrengthRo(is50Mpa: number): string {
  if (!Number.isFinite(is50Mpa) || is50Mpa < 0) {
    return "—";
  }
  if (is50Mpa < 0.3) {
    return "Foarte slabă (Is(50) < 0,3 MPa)";
  }
  if (is50Mpa < 1) {
    return "Slabă (0,3 ≤ Is(50) < 1 MPa)";
  }
  if (is50Mpa < 3) {
    return "Medie (1 ≤ Is(50) < 3 MPa)";
  }
  if (is50Mpa < 6) {
    return "Ridicată (3 ≤ Is(50) < 6 MPa)";
  }
  if (is50Mpa < 10) {
    return "Foarte ridicată (6 ≤ Is(50) < 10 MPa)";
  }
  return "Extrem de ridicată (Is(50) ≥ 10 MPa)";
}

export function classifyIs50MpaStrengthRoOrDash(is50Mpa: number | null | undefined): string {
  if (is50Mpa == null || !Number.isFinite(is50Mpa)) return "—";
  return classifyIs50MpaStrengthRo(is50Mpa);
}
