import { Settings } from "lucide-react"

export default function WorkspaceSettingsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>
      <p className="text-muted-foreground">Workspace settings and configuration.</p>
      <div className="flex items-center justify-center py-20 border-2 border-dashed rounded-lg">
        <div className="text-center">
          <Settings className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Settings page coming soon</p>
        </div>
      </div>
    </div>
  )
}
