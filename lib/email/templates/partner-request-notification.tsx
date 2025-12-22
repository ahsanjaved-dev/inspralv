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

interface PartnerRequestNotificationEmailProps {
  companyName: string
  contactName: string
  contactEmail: string
  desiredSubdomain: string
  reviewUrl: string
}

export function PartnerRequestNotificationEmail({
  companyName,
  contactName,
  contactEmail,
  desiredSubdomain,
  reviewUrl,
}: PartnerRequestNotificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>New white-label partner request from {companyName}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>🎉 New Partner Request</Heading>

          <Text style={text}>
            A new white-label partnership request has been submitted and is awaiting your review.
          </Text>

          <Section style={infoBox}>
            <Text style={infoLabel}>Company Name:</Text>
            <Text style={infoValue}>{companyName}</Text>

            <Text style={infoLabel}>Contact Person:</Text>
            <Text style={infoValue}>{contactName}</Text>

            <Text style={infoLabel}>Email:</Text>
            <Text style={infoValue}>{contactEmail}</Text>

            <Text style={infoLabel}>Desired Subdomain:</Text>
            <Text style={infoValue}>{desiredSubdomain}.inspralv.com</Text>
          </Section>

          <Section style={buttonContainer}>
            <Button style={button} href={reviewUrl}>
              Review Request
            </Button>
          </Section>

          <Text style={footer}>This is an automated notification from your Inspralv platform.</Text>
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

const footer = {
  color: "#8898aa",
  fontSize: "12px",
  lineHeight: "16px",
  padding: "0 40px",
  marginTop: "32px",
}
