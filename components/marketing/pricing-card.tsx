import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Check } from "lucide-react"
import Link from "next/link"

interface PricingCardProps {
  name: string
  price: number | null
  description: string
  features: string[]
  ctaText: string
  ctaHref: string
  highlighted?: boolean
  primaryColor?: string
}

export function PricingCard({
  name,
  price,
  description,
  features,
  ctaText,
  ctaHref,
  highlighted = false,
  primaryColor = "#7c3aed",
}: PricingCardProps) {
  return (
    <Card
      className={`relative ${highlighted ? "border-2 shadow-lg scale-105" : ""}`}
      style={highlighted ? { borderColor: primaryColor } : undefined}
    >
      {highlighted && (
        <div
          className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full text-white text-sm font-medium"
          style={{ backgroundColor: primaryColor }}
        >
          Most Popular
        </div>
      )}
      <CardHeader>
        <CardTitle className="text-2xl">{name}</CardTitle>
        <CardDescription>{description}</CardDescription>
        <div className="mt-4">
          {price === null ? (
            <div className="text-4xl font-bold">Custom</div>
          ) : (
            <div>
              <span className="text-4xl font-bold">${price}</span>
              <span className="text-muted-foreground">/month</span>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <Button
          asChild
          className="w-full"
          variant={highlighted ? "default" : "outline"}
          style={highlighted ? { backgroundColor: primaryColor } : undefined}
        >
          <Link href={ctaHref}>{ctaText}</Link>
        </Button>
        <ul className="space-y-3">
          {features.map((feature, index) => (
            <li key={index} className="flex items-start gap-2">
              <Check className="h-5 w-5 shrink-0 mt-0.5" style={{ color: primaryColor }} />
              <span className="text-sm">{feature}</span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}
