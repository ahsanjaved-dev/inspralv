import { BarChart3 } from "lucide-react"

export default function WorkspaceAnalyticsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Analytics</h1>
      <p className="text-muted-foreground">Workspace analytics and insights.</p>
      <div className="flex items-center justify-center py-20 border-2 border-dashed rounded-lg">
        <div className="text-center">
          <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Analytics page coming soon</p>
        </div>
      </div>
    </div>
  )
}
