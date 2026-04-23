import { AdminArchiveClient } from "@/components/admin/admin-archive-client";

export default function AdminArchivePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Arhivare an calendaristic</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Se filtrează proiectele după <code className="bg-muted rounded px-1">created_at</code> în UTC (
          <code className="bg-muted rounded px-1">YYYY-01-01</code> … <code className="bg-muted rounded px-1">YYYY+1-01-01</code>
          ). Exportați înainte de golire; confirmați cu textul exact indicat.
        </p>
      </div>
      <AdminArchiveClient />
    </div>
  );
}
