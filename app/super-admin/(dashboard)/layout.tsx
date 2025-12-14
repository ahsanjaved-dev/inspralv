import { redirect } from "next/navigation"
import { getSuperAdminContext } from "@/lib/api/super-admin-auth"
import { SuperAdminLayoutClient } from "@/components/super-admin/super-admin-layout-client"

export default async function SuperAdminDashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const context = await getSuperAdminContext()

  if (!context) {
    redirect("/super-admin/login")
  }

  return <SuperAdminLayoutClient superAdmin={context.superAdmin}>{children}</SuperAdminLayoutClient>
}
