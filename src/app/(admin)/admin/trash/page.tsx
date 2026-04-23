import { AdminTrashClient } from "@/components/admin/admin-trash-client";

export default function AdminTrashPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Recycle Bin</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Elementele din coș nu apar în aplicație. Le puteți restaura sau șterge definitiv (purge).
        </p>
      </div>
      <AdminTrashClient />
    </div>
  );
}

