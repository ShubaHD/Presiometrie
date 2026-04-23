import { AdminUsersClient } from "@/components/admin/admin-users-client";

export default function AdminUsersPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Utilizatori</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Adăugați conturi noi pentru laborator și consultați lista din Supabase Auth.
        </p>
      </div>
      <AdminUsersClient />
    </div>
  );
}
