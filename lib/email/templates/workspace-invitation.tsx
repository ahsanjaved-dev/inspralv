import {
  Html,
  Head,
  Body,
  Container,
  Section,
  Text,
  Button,
  Heading,
  Hr,
  Preview,
  Img,
} from "@react-email/components"

interface WorkspaceInvitationEmailProps {
  workspaceName: string
  inviterName?: string
  inviteLink: string
  role: string
  message?: string
  expiresAt: string
  partnerName: string
  primaryColor?: string
  logoUrl?: string
}

export function WorkspaceInvitationEmail({
  workspaceName,
  inviterName,
  inviteLink,
  role,
  message,
  expiresAt,
  partnerName,
  primaryColor = "#7c3aed",
  logoUrl,
}: WorkspaceInvitationEmailProps) {
  const previewText = `You're invited to join ${workspaceName} on ${partnerName}`

  return (
    <Html>
      <Head />
      <Preview>{previewText}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Partner Logo */}
          {logoUrl && (
            <Section style={{ textAlign: "center", marginBottom: "24px" }}>
              <Img src={logoUrl} alt={partnerName} height="40" style={{ margin: "0 auto" }} />
            </Section>
          )}

          <Heading style={h1}>You're invited to join {workspaceName}</Heading>

          <Text style={text}>
            {inviterName
              ? `${inviterName} has invited you to join the "${workspaceName}" workspace on ${partnerName} as a ${role}.`
              : `You've been invited to join the "${workspaceName}" workspace on ${partnerName} as a ${role}.`}
          </Text>

          {message && (
            <Section style={{ ...messageBox, borderLeftColor: primaryColor }}>
              <Text style={messageText}>"{message}"</Text>
            </Section>
          )}

          <Section style={buttonContainer}>
            <Button style={{ ...button, backgroundColor: primaryColor }} href={inviteLink}>
              Accept Invitation
            </Button>
          </Section>

          <Hr style={hr} />

          <Text style={footer}>
            This invitation expires on {new Date(expiresAt).toLocaleDateString()}. If you didn't
            expect this invitation, you can safely ignore this email.
          </Text>

          <Text style={footerLink}>
            Or copy and paste this link into your browser:{" "}
            <span style={{ color: primaryColor }}>{inviteLink}</span>
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif',
  padding: "40px 0",
}

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "40px 20px",
  maxWidth: "560px",
  borderRadius: "8px",
  boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
}

const h1 = {
  color: "#1f2937",
  fontSize: "24px",
  fontWeight: "600" as const,
  lineHeight: "1.3",
  margin: "0 0 20px",
  textAlign: "center" as const,
}

const text = {
  color: "#4b5563",
  fontSize: "16px",
  lineHeight: "1.6",
  margin: "0 0 20px",
}

const messageBox = {
  backgroundColor: "#f3f4f6",
  borderRadius: "6px",
  padding: "16px",
  margin: "0 0 24px",
  borderLeft: "4px solid #7c3aed",
}

const messageText = {
  color: "#6b7280",
  fontSize: "14px",
  fontStyle: "italic" as const,
  margin: "0",
}

const buttonContainer = {
  textAlign: "center" as const,
  margin: "32px 0",
}

const button = {
  backgroundColor: "#7c3aed",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "16px",
  fontWeight: "600" as const,
  textDecoration: "none",
  textAlign: "center" as const,
  padding: "14px 28px",
  display: "inline-block",
}

const hr = {
  borderColor: "#e5e7eb",
  margin: "24px 0",
}

const footer = {
  color: "#9ca3af",
  fontSize: "12px",
  lineHeight: "1.5",
  margin: "0 0 8px",
}

const footerLink = {
  color: "#9ca3af",
  fontSize: "11px",
  lineHeight: "1.5",
  margin: "0",
  wordBreak: "break-all" as const,
}

export default WorkspaceInvitationEmail
