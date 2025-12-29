"use client"

import { SuperAdmin } from "@/types/database.types"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Shield, LogOut, User } from "lucide-react"
import { useRouter } from "next/navigation"
import { createClient } from "@/lib/supabase/client"

interface SuperAdminHeaderProps {
  superAdmin: SuperAdmin
}

export function SuperAdminHeader({ superAdmin }: SuperAdminHeaderProps) {
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push("/login")
  }

  const initials =
    superAdmin.first_name && superAdmin.last_name
      ? `${superAdmin.first_name[0]}${superAdmin.last_name[0]}`
      : (superAdmin.email[0] ?? "A").toUpperCase()

  return (
    <header className="h-16 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-8 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <Shield className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Genius365 Admin</h1>
          <p className="text-xs text-muted-foreground">Super Administrator</p>
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-3 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg px-3 py-2 transition-colors">
            <div className="text-right">
              <p className="text-sm font-medium">
                {superAdmin.first_name && superAdmin.last_name
                  ? `${superAdmin.first_name} ${superAdmin.last_name}`
                  : superAdmin.email}
              </p>
              <p className="text-xs text-muted-foreground">Super Admin</p>
            </div>
            <Avatar>
              <AvatarImage src={superAdmin.avatar_url || undefined} />
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>My Account</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600">
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  )
}
