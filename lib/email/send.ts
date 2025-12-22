import { Resend } from "resend"
import { env } from "@/lib/env"
import { WorkspaceInvitationEmail } from "./templates/workspace-invitation"
import { PartnerRequestNotificationEmail } from "./templates/partner-request-notification"
import { PartnerRequestApprovedEmail } from "./templates/partner-request-approved"
import { PartnerRequestRejectedEmail } from "./templates/partner-request-rejected"

const resend = env.resendApiKey ? new Resend(env.resendApiKey) : null

interface SendEmailOptions {
  to: string | string[]
  subject: string
  react: React.ReactElement
}

async function sendEmail({ to, subject, react }: SendEmailOptions) {
  if (!resend) {
    console.warn("Resend API key not configured. Email not sent.")
    return { success: false, error: "Email service not configured" }
  }

  try {
    const { data, error } = await resend.emails.send({
      from: env.fromEmail,
      to: Array.isArray(to) ? to : [to],
      subject,
      react,
    })

    if (error) {
      console.error("Email send error:", error)
      return { success: false, error: error.message }
    }

    return { success: true, data }
  } catch (error) {
    console.error("Email send exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// Existing function
export async function sendWorkspaceInvitation(
  workspaceName: string,
  inviterName: string,
  inviteLink: string, // Changed from invitationUrl
  role: string,
  expiresAt: string,
  partnerName: string,
  message?: string
) {
  return sendEmail({
    to: "drewcarter112233@gmail.com",
    subject: `You've been invited to join ${workspaceName}`,
    react: WorkspaceInvitationEmail({
      workspaceName,
      inviterName,
      inviteLink, // Changed from invitationUrl
      role,
      message,
      expiresAt,
      partnerName,
    }),
  })
}

// NEW: Partner request notification to super admin
export async function sendPartnerRequestNotification(requestData: {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  desired_subdomain: string
}) {
  const reviewUrl = `${env.appUrl}/super-admin/partner-requests/${requestData.id}`

  return sendEmail({
    to: env.superAdminEmail,
    subject: `New White-Label Partner Request: ${requestData.company_name}`,
    react: PartnerRequestNotificationEmail({
      companyName: requestData.company_name,
      contactName: requestData.contact_name,
      contactEmail: requestData.contact_email,
      desiredSubdomain: requestData.desired_subdomain,
      reviewUrl,
    }),
  })
}

// NEW: Partner request approved notification
export async function sendPartnerApprovalEmail(
  email: string,
  partnerData: {
    company_name: string
    subdomain: string
    login_url: string
    temporary_password: string
  }
) {
  return sendEmail({
    to: email,
    subject: `Welcome to Your White-Label Platform - ${partnerData.company_name}`,
    react: PartnerRequestApprovedEmail({
      companyName: partnerData.company_name,
      subdomain: partnerData.subdomain,
      loginUrl: partnerData.login_url,
      temporaryPassword: partnerData.temporary_password,
    }),
  })
}

// NEW: Partner request rejected notification
export async function sendPartnerRejectionEmail(
  email: string,
  data: {
    company_name: string
    contact_name: string
    reason: string
  }
) {
  return sendEmail({
    to: email,
    subject: `Update on Your White-Label Partnership Request`,
    react: PartnerRequestRejectedEmail({
      companyName: data.company_name,
      contactName: data.contact_name,
      reason: data.reason,
    }),
  })
}
