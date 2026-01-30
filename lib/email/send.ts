/**
 * Email Sending Module
 * 
 * Uses Nodemailer with SMTP (Mailgun) to send emails.
 * Templates are React Email components rendered to HTML.
 */

import { render } from "@react-email/render"
import { env } from "@/lib/env"
import { getEmailTransporter, getFromAddress } from "./client"
import { WorkspaceInvitationEmail } from "./templates/workspace-invitation"
import { PartnerInvitationEmail } from "./templates/partner-invitation"
import { PartnerRequestNotificationEmail } from "./templates/partner-request-notification"
import { PartnerRequestApprovedEmail } from "./templates/partner-request-approved"
import { PartnerRequestRejectedEmail } from "./templates/partner-request-rejected"
import { PaymentFailedEmail } from "./templates/payment-failed"
import { LowBalanceAlertEmail } from "./templates/low-balance-alert"
import { AgencyCheckoutLinkEmail } from "./templates/agency-checkout-link"

interface SendEmailOptions {
  to: string | string[]
  subject: string
  react: React.ReactElement
}

interface SendEmailResult {
  success: boolean
  data?: { id: string }
  error?: string
}

/**
 * Send an email using SMTP
 */
async function sendEmail({ to, subject, react }: SendEmailOptions): Promise<SendEmailResult> {
  console.log("[Email] Attempting to send email:", { to, subject })
  
  const transporter = getEmailTransporter()
  
  if (!transporter) {
    console.warn("[Email] SMTP not configured. Email not sent.")
    return { success: false, error: "Email service not configured" }
  }

  try {
    const recipients = Array.isArray(to) ? to : [to]
    const fromAddress = getFromAddress()
    
    console.log("[Email] Sending via SMTP to:", recipients, "from:", fromAddress)
    
    // Render React Email template to HTML
    const html = await render(react)
    
    // Generate plain text version (strip HTML tags for fallback)
    const text = html
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/\s+/g, ' ')
      .trim()
    
    // Send the email
    const info = await transporter.sendMail({
      from: fromAddress,
      to: recipients.join(", "),
      subject,
      html,
      text,
    })

    console.log("[Email] Successfully sent email, Message ID:", info.messageId)
    return { 
      success: true, 
      data: { id: info.messageId } 
    }
  } catch (error) {
    console.error("[Email] Send exception:", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }
  }
}

// Test email for development mode
// Can be configured via TEST_EMAIL environment variable
const TEST_EMAIL = env.testEmail || "drewcarter112233@gmail.com"

// =============================================================================
// EMAIL SENDING FUNCTIONS
// =============================================================================

/**
 * Partner organization invitation
 */
export async function sendPartnerInvitation(
  recipientEmail: string,
  partnerName: string,
  inviterName: string,
  inviteLink: string,
  role: string,
  expiresAt: string,
  workspaceAssignments?: { name: string; role: string }[],
  message?: string,
  primaryColor?: string,
  logoUrl?: string
) {
  // Use test email in development, real email in production
  const to = env.isDev ? TEST_EMAIL : recipientEmail

  return sendEmail({
    to,
    subject: `You've been invited to join ${partnerName}`,
    react: PartnerInvitationEmail({
      partnerName,
      inviterName,
      inviteLink,
      role,
      message,
      expiresAt,
      workspaceAssignments,
      primaryColor,
      logoUrl,
    }),
  })
}

/**
 * Client invitation (for partner's clients who get their own workspace)
 */
export async function sendClientInvitation(
  recipientEmail: string,
  partnerName: string,
  inviterName: string,
  inviteLink: string,
  planName: string,
  expiresAt: string,
  message?: string,
  primaryColor?: string,
  logoUrl?: string
) {
  // Use test email in development, real email in production
  const to = env.isDev ? TEST_EMAIL : recipientEmail

  // Reuse the partner invitation template with client-specific messaging
  return sendEmail({
    to,
    subject: `You've been invited to ${partnerName}`,
    react: PartnerInvitationEmail({
      partnerName,
      inviterName,
      inviteLink,
      role: "client",
      message: message || `You've been invited to join ${partnerName}. Your workspace will be set up with the ${planName} plan.`,
      expiresAt,
      primaryColor,
      logoUrl,
    }),
  })
}

/**
 * Workspace invitation
 */
export async function sendWorkspaceInvitation(
  recipientEmail: string,
  workspaceName: string,
  inviterName: string,
  inviteLink: string,
  role: string,
  expiresAt: string,
  partnerName: string,
  message?: string
) {
  // Use test email in development, real email in production
  const to = env.isDev ? TEST_EMAIL : recipientEmail

  return sendEmail({
    to,
    subject: `You've been invited to join ${workspaceName}`,
    react: WorkspaceInvitationEmail({
      workspaceName,
      inviterName,
      inviteLink,
      role,
      message,
      expiresAt,
      partnerName,
    }),
  })
}

/**
 * Partner request notification to super admin
 */
export async function sendPartnerRequestNotification(requestData: {
  id: string
  company_name: string
  contact_name: string
  contact_email: string
  desired_subdomain: string
  custom_domain?: string
}) {
  const reviewUrl = `${env.appUrl}/super-admin/partner-requests/${requestData.id}`
  // Use test email in development, real super admin email in production
  const to = env.isDev ? TEST_EMAIL : env.superAdminEmail

  return sendEmail({
    to,
    subject: `New White-Label Partner Request: ${requestData.company_name}`,
    react: PartnerRequestNotificationEmail({
      companyName: requestData.company_name,
      contactName: requestData.contact_name,
      contactEmail: requestData.contact_email,
      desiredSubdomain: requestData.desired_subdomain,
      customDomain: requestData.custom_domain,
      reviewUrl,
    }),
  })
}

/**
 * Partner request approved notification (with login credentials)
 */
export async function sendPartnerApprovalEmail(
  email: string,
  partnerData: {
    company_name: string
    subdomain: string
    login_url: string
    temporary_password: string | null
    contact_email?: string
  }
) {
  // Use test email in development, real email in production
  const to = env.isDev ? TEST_EMAIL : email

  return sendEmail({
    to,
    subject: `Welcome to Your White-Label Platform - ${partnerData.company_name}`,
    react: PartnerRequestApprovedEmail({
      companyName: partnerData.company_name,
      subdomain: partnerData.subdomain,
      loginUrl: partnerData.login_url,
      temporaryPassword: partnerData.temporary_password || "",
      contactEmail: partnerData.contact_email || email,
    }),
  })
}

/**
 * Partner request rejected notification
 */
export async function sendPartnerRejectionEmail(
  email: string,
  data: {
    company_name: string
    contact_name: string
    reason: string
  }
) {
  // Use test email in development, real email in production
  const to = env.isDev ? TEST_EMAIL : email

  return sendEmail({
    to,
    subject: `Update on Your White-Label Partnership Request`,
    react: PartnerRequestRejectedEmail({
      companyName: data.company_name,
      contactName: data.contact_name,
      reason: data.reason,
    }),
  })
}

/**
 * Payment failed notification
 */
export async function sendPaymentFailedEmail(
  recipientEmails: string[],
  partnerData: {
    partner_name: string
    plan_name: string
    amount_due: string
    attempt_date: string
    update_payment_url: string
  }
) {
  // Use test email in development, real emails in production
  const to = env.isDev ? [TEST_EMAIL] : recipientEmails

  return sendEmail({
    to,
    subject: `Payment Failed for Your ${partnerData.plan_name} Subscription`,
    react: PaymentFailedEmail({
      partnerName: partnerData.partner_name,
      planName: partnerData.plan_name,
      amountDue: partnerData.amount_due,
      attemptDate: partnerData.attempt_date,
      updatePaymentUrl: partnerData.update_payment_url,
    }),
  })
}

/**
 * Low balance alert notification
 */
export async function sendLowBalanceAlertEmail(
  recipientEmails: string[],
  alertData: {
    recipient_name: string
    account_name: string
    account_type: "partner" | "workspace"
    current_balance: string
    threshold: string
    topup_url: string
  }
) {
  // Use test email in development, real emails in production
  const to = env.isDev ? [TEST_EMAIL] : recipientEmails

  return sendEmail({
    to,
    subject: `Low Credit Balance Alert - ${alertData.account_name}`,
    react: LowBalanceAlertEmail({
      recipientName: alertData.recipient_name,
      accountName: alertData.account_name,
      accountType: alertData.account_type,
      currentBalance: alertData.current_balance,
      threshold: alertData.threshold,
      topupUrl: alertData.topup_url,
    }),
  })
}

/**
 * Agency checkout link email (sent after super admin approves request)
 */
export async function sendAgencyCheckoutEmail(
  email: string,
  data: {
    company_name: string
    contact_name: string
    plan_name: string
    plan_price: string // e.g., "$299/month"
    max_workspaces: string // e.g., "30" or "Unlimited"
    checkout_url: string
    expires_at: string // e.g., "January 21, 2026"
  }
) {
  // Use test email in development, real email in production
  const to = env.isDev ? TEST_EMAIL : email

  return sendEmail({
    to,
    subject: `Complete Your ${data.plan_name} Subscription - ${data.company_name}`,
    react: AgencyCheckoutLinkEmail({
      companyName: data.company_name,
      contactName: data.contact_name,
      planName: data.plan_name,
      planPrice: data.plan_price,
      maxWorkspaces: data.max_workspaces,
      checkoutUrl: data.checkout_url,
      expiresAt: data.expires_at,
    }),
  })
}

