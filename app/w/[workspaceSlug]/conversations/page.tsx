import { MessageSquare } from "lucide-react"

export default function WorkspaceConversationsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Conversations</h1>
      <p className="text-muted-foreground">
        Conversations will be scoped to this workspace in Milestone 5.
      </p>
      <div className="flex items-center justify-center py-20 border-2 border-dashed rounded-lg">
        <div className="text-center">
          <MessageSquare className="h-12 w-12 mx-auto text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">Conversations page coming in Milestone 5</p>
        </div>
      </div>
    </div>
  )
}
