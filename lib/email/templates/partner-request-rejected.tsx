import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components"

interface PartnerRequestRejectedEmailProps {
  companyName: string
  contactName: string
  reason: string
}

export function PartnerRequestRejectedEmail({
  companyName,
  contactName,
  reason,
}: PartnerRequestRejectedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Update on your white-label partnership request</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Partnership Request Update</Heading>

          <Text style={text}>Dear {contactName},</Text>

          <Text style={text}>
            Thank you for your interest in our white-label partnership program for {companyName}.
          </Text>

          <Text style={text}>
            After careful review, we regret to inform you that we are unable to approve your
            partnership request at this time.
          </Text>

          <Section style={reasonBox}>
            <Text style={reasonLabel}>Reason:</Text>
            <Text style={reasonText}>{reason}</Text>
          </Section>

          <Text style={text}>
            We encourage you to explore our other plans that might better suit your needs:
          </Text>

          <Section style={alternativeBox}>
            <Text style={alternativeText}>
              <strong>Professional Plan</strong> - Includes custom branding, advanced analytics, and
              API access without the full white-label setup.
            </Text>
          </Section>

          <Text style={text}>
            If you have any questions or would like to discuss alternative options, please don't
            hesitate to reach out to our team at support@inspralv.com
          </Text>

          <Text style={footer}>
            Best regards,
            <br />
            The Inspralv Team
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

const text = {
  color: "#333",
  fontSize: "16px",
  lineHeight: "26px",
  padding: "0 40px",
  marginBottom: "16px",
}

const reasonBox = {
  backgroundColor: "#fef2f2",
  borderLeft: "4px solid #ef4444",
  borderRadius: "8px",
  margin: "24px 40px",
  padding: "20px",
}

const reasonLabel = {
  color: "#991b1b",
  fontSize: "14px",
  fontWeight: "600",
  marginBottom: "8px",
}

const reasonText = {
  color: "#7f1d1d",
  fontSize: "16px",
  lineHeight: "24px",
  marginTop: "0",
}

const alternativeBox = {
  backgroundColor: "#f0fdf4",
  borderRadius: "8px",
  margin: "24px 40px",
  padding: "20px",
}

const alternativeText = {
  color: "#166534",
  fontSize: "14px",
  lineHeight: "22px",
  margin: "0",
}

const footer = {
  color: "#8898aa",
  fontSize: "14px",
  lineHeight: "22px",
  padding: "0 40px",
  marginTop: "32px",
}
