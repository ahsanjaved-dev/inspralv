import { resend, FROM_EMAIL } from "./client"
import { InvitationEmail } from "./templates/invitation"
import { WorkspaceInvitationEmail } from "./templates/workspace-invitation"

interface SendInvitationEmailParams {
  to: string
  organizationName: string
  inviterName?: string
  inviteLink: string
  role: string
  message?: string
  expiresAt: string
}

export async function sendInvitationEmail(params: SendInvitationEmailParams) {
  if (!resend) {
    console.log("[Email] Resend not configured. Would send invitation to:", params.to)
    console.log("[Email] Invite link:", params.inviteLink)
    return { success: true, simulated: true }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: `Inspralv <${FROM_EMAIL}>`,
      to: params.to,
      subject: `You're invited to join ${params.organizationName} on Inspralv`,
      react: InvitationEmail({
        organizationName: params.organizationName,
        inviterName: params.inviterName,
        inviteLink: params.inviteLink,
        role: params.role,
        message: params.message,
        expiresAt: params.expiresAt,
      }),
    })

    if (error) {
      console.error("[Email] Failed to send invitation:", error)
      throw error
    }

    return { success: true, id: data?.id }
  } catch (error) {
    console.error("[Email] Error sending invitation:", error)
    throw error
  }
}

// ============================================================================
// WORKSPACE INVITATION EMAIL (with Partner Branding)
// ============================================================================

interface SendWorkspaceInvitationParams {
  to: string
  workspaceName: string
  inviterName?: string
  inviteLink: string
  role: string
  message?: string
  expiresAt: string
  // Partner branding
  partnerName: string
  primaryColor?: string
  logoUrl?: string
}

export async function sendWorkspaceInvitationEmail(params: SendWorkspaceInvitationParams) {
  if (!resend) {
    console.log("[Email] Resend not configured. Would send workspace invitation to:", params.to)
    console.log("[Email] Invite link:", params.inviteLink)
    return { success: true, simulated: true }
  }

  try {
    const fromName = params.partnerName || "Inspralv"

    const { data, error } = await resend.emails.send({
      from: `${fromName} <${FROM_EMAIL}>`,
      to: params.to,
      subject: `You're invited to join ${params.workspaceName} on ${fromName}`,
      react: WorkspaceInvitationEmail({
        workspaceName: params.workspaceName,
        inviterName: params.inviterName,
        inviteLink: params.inviteLink,
        role: params.role,
        message: params.message,
        expiresAt: params.expiresAt,
        partnerName: params.partnerName,
        primaryColor: params.primaryColor,
        logoUrl: params.logoUrl,
      }),
    })

    if (error) {
      console.error("[Email] Failed to send workspace invitation:", error)
      throw error
    }

    return { success: true, id: data?.id }
  } catch (error) {
    console.error("[Email] Error sending workspace invitation:", error)
    throw error
  }
}
