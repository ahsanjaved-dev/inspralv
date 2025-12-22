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

interface PartnerRequestApprovedEmailProps {
  companyName: string
  subdomain: string
  loginUrl: string
  temporaryPassword: string
}

export function PartnerRequestApprovedEmail({
  companyName,
  subdomain,
  loginUrl,
  temporaryPassword,
}: PartnerRequestApprovedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your white-label platform is ready!</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🎉 Welcome to Your White-Label Platform!</Heading>

          <Text style={text}>
            Congratulations! Your white-label partnership request for <strong>{companyName}</strong>{" "}
            has been approved. Your platform is now provisioned and ready to use.
          </Text>

          <Section style={infoBox}>
            <Text style={infoLabel}>Your Platform URL:</Text>
            <Text style={infoValue}>
              <a href={`https://${subdomain}.inspralv.com`} style={link}>
                {subdomain}.inspralv.com
              </a>
            </Text>

            <Text style={infoLabel}>Temporary Password:</Text>
            <Text style={codeText}>{temporaryPassword}</Text>

            <Text style={warningText}>
              ⚠️ Please change this password immediately after your first login.
            </Text>
          </Section>

          <Section style={buttonContainer}>
            <Button style={button} href={loginUrl}>
              Access Your Platform
            </Button>
          </Section>

          <Section style={nextSteps}>
            <Heading style={h2}>Next Steps:</Heading>
            <Text style={listItem}>1. Log in to your platform using the credentials above</Text>
            <Text style={listItem}>2. Change your temporary password</Text>
            <Text style={listItem}>3. Complete your branding setup (logo, colors)</Text>
            <Text style={listItem}>4. Configure your custom domain (if applicable)</Text>
            <Text style={listItem}>5. Invite your team members</Text>
            <Text style={listItem}>6. Create your first workspace and AI agent</Text>
          </Section>

          <Text style={footer}>
            Need help? Contact your dedicated account manager or reach out to support@inspralv.com
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

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
}

const h1 = {
  color: "#333",
  fontSize: "24px",
  fontWeight: "bold",
  margin: "40px 0",
  padding: "0 40px",
}

const h2 = {
  color: "#333",
  fontSize: "20px",
  fontWeight: "bold",
  marginBottom: "16px",
}

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "26px",
  padding: "0 40px",
}

const infoBox = {
  backgroundColor: "#f4f4f5",
  borderRadius: "8px",
  margin: "24px 40px",
  padding: "24px",
}

const infoLabel = {
  color: "#71717a",
  fontSize: "14px",
  fontWeight: "600",
  marginBottom: "4px",
  marginTop: "16px",
}

const infoValue = {
  color: "#18181b",
  fontSize: "16px",
  marginTop: "0",
  marginBottom: "0",
}

const link = {
  color: "#7c3aed",
  textDecoration: "none",
}

const codeText = {
  backgroundColor: "#18181b",
  color: "#fff",
  padding: "8px 12px",
  borderRadius: "4px",
  fontFamily: "monospace",
  fontSize: "14px",
  display: "inline-block",
  marginTop: "8px",
}

const warningText = {
  color: "#ea580c",
  fontSize: "14px",
  marginTop: "12px",
  marginBottom: "0",
}

const buttonContainer = {
  padding: "27px 40px",
}

const button = {
  backgroundColor: "#7c3aed",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "16px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "12px 20px",
}

const nextSteps = {
  padding: "0 40px",
  marginTop: "32px",
}

const listItem = {
  color: "#333",
  fontSize: "14px",
  lineHeight: "24px",
  margin: "8px 0",
}

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  padding: "0 40px",
  marginTop: "32px",
}
