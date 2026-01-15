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

interface AgencyCheckoutLinkEmailProps {
  companyName: string
  contactName: string
  planName: string
  planPrice: string // e.g., "$299/month"
  maxWorkspaces: string // e.g., "30" or "Unlimited"
  checkoutUrl: string
  expiresAt: string // e.g., "January 21, 2026"
}

export function AgencyCheckoutLinkEmail({
  companyName,
  contactName,
  planName,
  planPrice,
  maxWorkspaces,
  checkoutUrl,
  expiresAt,
}: AgencyCheckoutLinkEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Complete your {planName} subscription for {companyName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🎉 Your Partnership Request is Approved!</Heading>

          <Text style={text}>
            Hi {contactName},
          </Text>

          <Text style={text}>
            Great news! Your white-label partnership request for <strong>{companyName}</strong>{" "}
            has been approved. You're just one step away from launching your own branded AI voice platform.
          </Text>

          <Section style={planBox}>
            <Text style={planLabel}>Selected Plan</Text>
            <Text style={planName_style}>{planName}</Text>
            <Text style={planPrice_style}>{planPrice}</Text>
            <Text style={planFeature}>
              ✓ {maxWorkspaces} workspaces included
            </Text>
            <Text style={planFeature}>
              ✓ Your own branded domain
            </Text>
            <Text style={planFeature}>
              ✓ Full white-label customization
            </Text>
            <Text style={planFeature}>
              ✓ Stripe Connect for billing your clients
            </Text>
          </Section>

          <Section style={buttonContainer}>
            <Button style={button} href={checkoutUrl}>
              Complete Payment & Activate
            </Button>
          </Section>

          <Text style={expiryText}>
            ⏰ This link expires on <strong>{expiresAt}</strong>. Please complete your payment before then.
          </Text>

          <Section style={nextSteps}>
            <Heading style={h2}>What happens next?</Heading>
            <Text style={listItem}>1. Click the button above to complete payment</Text>
            <Text style={listItem}>2. Your platform will be automatically provisioned</Text>
            <Text style={listItem}>3. You'll receive login credentials via email</Text>
            <Text style={listItem}>4. Start customizing your brand and inviting clients!</Text>
          </Section>

          <Text style={footer}>
            Questions? Reply to this email or contact support@genius365.ai
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

const planBox = {
  backgroundColor: "#7c3aed10",
  borderRadius: "12px",
  border: "2px solid #7c3aed30",
  margin: "24px 40px",
  padding: "24px",
  textAlign: "center" as const,
}

const planLabel = {
  color: "#7c3aed",
  fontSize: "12px",
  fontWeight: "600",
  textTransform: "uppercase" as const,
  letterSpacing: "1px",
  marginBottom: "8px",
}

const planName_style = {
  color: "#18181b",
  fontSize: "28px",
  fontWeight: "bold",
  marginTop: "0",
  marginBottom: "4px",
}

const planPrice_style = {
  color: "#7c3aed",
  fontSize: "24px",
  fontWeight: "bold",
  marginTop: "0",
  marginBottom: "16px",
}

const planFeature = {
  color: "#52525b",
  fontSize: "14px",
  marginTop: "8px",
  marginBottom: "0",
}

const buttonContainer = {
  padding: "27px 40px",
}

const button = {
  backgroundColor: "#7c3aed",
  borderRadius: "8px",
  color: "#fff",
  fontSize: "18px",
  fontWeight: "bold",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "block",
  padding: "16px 24px",
}

const expiryText = {
  color: "#71717a",
  fontSize: "14px",
  padding: "0 40px",
  textAlign: "center" as const,
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
