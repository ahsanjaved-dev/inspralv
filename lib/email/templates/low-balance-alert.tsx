import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

interface LowBalanceAlertEmailProps {
  recipientName: string
  accountName: string
  accountType: "partner" | "workspace"
  currentBalance: string
  threshold: string
  topupUrl: string
  contactEmail?: string
}

export const LowBalanceAlertEmail = ({
  recipientName,
  accountName,
  accountType,
  currentBalance,
  threshold,
  topupUrl,
  contactEmail = "support@yourplatform.com",
}: LowBalanceAlertEmailProps) => {
  const accountLabel = accountType === "partner" ? "organization" : "workspace"
  
  return (
    <Html>
      <Head />
      <Preview>Low Credit Balance Alert - {accountName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>⚠️ Low Credit Balance</Heading>

          <Text style={text}>Hi {recipientName},</Text>

          <Text style={text}>
            The credit balance for your {accountLabel}{" "}
            <strong>{accountName}</strong> has dropped below the alert threshold.
          </Text>

          <Section style={alertBox}>
            <Text style={alertText}>
              <strong>Current Balance:</strong> {currentBalance}
            </Text>
            <Text style={alertText}>
              <strong>Alert Threshold:</strong> {threshold}
            </Text>
          </Section>

          <Text style={text}>
            To avoid any interruption to your services, we recommend adding credits
            to your account soon.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={topupUrl}>
              Add Credits Now
            </Button>
          </Section>

          <Text style={text}>
            If you have any questions, please contact our support team at{" "}
            <a href={`mailto:${contactEmail}`} style={link}>
              {contactEmail}
            </a>
            .
          </Text>

          <Text style={footer}>
            This is an automated alert. You can adjust your low balance threshold
            in your billing settings.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default LowBalanceAlertEmail

// Styles
const main = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Ubuntu,sans-serif',
}

const container = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "20px 0 48px",
  marginBottom: "64px",
  maxWidth: "600px",
}

const h1 = {
  color: "#d97706",
  fontSize: "28px",
  fontWeight: "bold",
  margin: "40px 0",
  padding: "0 40px",
  textAlign: "center" as const,
}

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "26px",
  padding: "0 40px",
  marginBottom: "16px",
}

const alertBox = {
  backgroundColor: "#fffbeb",
  border: "1px solid #fde68a",
  borderRadius: "6px",
  margin: "24px 40px",
  padding: "20px",
}

const alertText = {
  color: "#92400e",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "8px 0",
}

const buttonContainer = {
  padding: "24px 40px",
}

const button = {
  backgroundColor: "#7c3aed",
  borderRadius: "6px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 20px",
}

const link = {
  color: "#2563eb",
  textDecoration: "underline",
}

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  padding: "0 40px",
  marginTop: "32px",
}

