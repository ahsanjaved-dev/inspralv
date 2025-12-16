import Link from "next/link"
import { Button } from "@/components/ui/button"
import { siteConfig } from "@/config/site"

export default function Home() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-linear-to-br from-blue-50 to-indigo-100">
      <div className="text-center space-y-6 p-8">
        <h1 className="text-6xl font-bold">{siteConfig.name}</h1>
        <p className="text-2xl text-gray-600">{siteConfig.description}</p>
        <div className="flex gap-4 justify-center mt-8">
          <Link href="/login">
            <Button size="lg" variant="outline">
              Sign In Now
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}
