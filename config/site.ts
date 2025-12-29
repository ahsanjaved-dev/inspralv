export const siteConfig = {
  name: "Genius365",
  description: "AI Voice Integration Platform",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  links: {
    github: "https://github.com/yourusername/genius365",
  },
}

export const navItems = [
  { title: "Dashboard", href: "/dashboard" },
  { title: "Agents", href: "/agents" },
  { title: "Conversations", href: "/conversations" },
  { title: "Integrations", href: "/integrations" },
  { title: "Analytics", href: "/analytics" },
  { title: "Billing", href: "/billing" },
  { title: "Settings", href: "/settings" },
]
