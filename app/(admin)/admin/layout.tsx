import { redirect } from "next/navigation";
import Link from "next/link";
import { getStaffSession } from "@/lib/fichaje/auth";
import { AdminNav } from "@/components/admin/AdminNav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getStaffSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-dvh">
      <header className="border-b border-muted/15 bg-bg-card">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/admin" className="font-heading text-2xl text-accent">
            MÍTICO · Admin
          </Link>
          <AdminNav rol={session.rol} email={session.email} />
        </div>
      </header>
      <div className="mx-auto max-w-5xl px-4 py-8">{children}</div>
    </div>
  );
}
