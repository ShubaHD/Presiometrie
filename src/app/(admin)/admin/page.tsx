import Link from "next/link";

export default function AdminHomePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Panou administrare</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Export, golire date pe an și documentație backup. Zona laborator rămâne la{" "}
          <Link href="/projects" className="text-primary underline">
            /projects
          </Link>
          .
        </p>
      </div>
      <ul className="flex flex-col gap-2 text-sm">
        <li>
          <Link href="/admin/users" className="text-primary font-medium underline">
            Utilizatori (creare cont + parolă)
          </Link>
        </li>
        <li>
          <Link href="/admin/archive" className="text-primary font-medium underline">
            Arhivare an (export JSON + golire)
          </Link>
        </li>
        <li>
          <Link href="/admin/trash" className="text-primary font-medium underline">
            Recycle Bin (restore / purge)
          </Link>
        </li>
        <li>
          <Link href="/admin/triaxial" className="text-primary font-medium underline">
            Triaxial rocă (QC mărci + c/φ + E/ν)
          </Link>
        </li>
        <li>
          <span className="text-muted-foreground">
            Ghid backup și restore: fișierul{" "}
            <code className="bg-muted rounded px-1 py-0.5 text-xs">docs/BACKUP.md</code> din rădăcina repo-ului.
          </span>
        </li>
      </ul>
    </div>
  );
}
