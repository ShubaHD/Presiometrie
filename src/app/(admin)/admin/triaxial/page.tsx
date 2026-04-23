import { AdminTriaxialClient } from "@/components/admin/admin-triaxial-client";

export default function AdminTriaxialPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Triaxial rocă (Hoek cell)</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          QC pentru mărci tensiometrice (Ch6–Ch8) + calcul parametri: E, ν și fit Mohr–Coulomb (c, φ) din 3 probe.
        </p>
      </div>
      <AdminTriaxialClient />
    </div>
  );
}

