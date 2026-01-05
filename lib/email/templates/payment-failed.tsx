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

interface PaymentFailedEmailProps {
  partnerName: string
  planName: string
  amountDue: string
  attemptDate: string
  updatePaymentUrl: string
  contactEmail?: string
}

export const PaymentFailedEmail = ({
  partnerName,
  planName,
  amountDue,
  attemptDate,
  updatePaymentUrl,
  contactEmail = "support@yourplatform.com",
}: PaymentFailedEmailProps) => {
  return (
    <Html>
      <Head />
      <Preview>Payment Failed for Your {planName} Subscription</Preview>
      <Body style={main}>
        <Container style={container}>
          <Heading style={h1}>Payment Failed</Heading>

          <Text style={text}>Hi {partnerName},</Text>

          <Text style={text}>
            We were unable to process the payment for your <strong>{planName}</strong> subscription
            on {attemptDate}.
          </Text>

          <Section style={alertBox}>
            <Text style={alertText}>
              <strong>Amount Due:</strong> ${amountDue}
            </Text>
            <Text style={alertText}>
              Your subscription is currently marked as <strong>Past Due</strong>.
            </Text>
          </Section>

          <Text style={text}>
            To avoid any disruption to your service, please update your payment method or retry
            the payment as soon as possible.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={updatePaymentUrl}>
              Update Payment Method
            </Button>
          </Section>

          <Text style={text}>
            If you believe this is an error or need assistance, please contact our support team at{" "}
            <a href={`mailto:${contactEmail}`} style={link}>
              {contactEmail}
            </a>
            .
          </Text>

          <Text style={footer}>
            This is an automated notification from your subscription management system.
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

export default PaymentFailedEmail

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
  color: "#e74c3c",
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
  backgroundColor: "#fef2f2",
  border: "1px solid #fee2e2",
  borderRadius: "6px",
  margin: "24px 40px",
  padding: "20px",
}

const alertText = {
  color: "#991b1b",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "8px 0",
}

const buttonContainer = {
  padding: "24px 40px",
}

const button = {
  backgroundColor: "#e74c3c",
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
