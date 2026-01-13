import type { Metadata } from "next"
import { Geist, Geist_Mono } from "next/font/google"
import "./globals.css"
import { Toaster } from "sonner"
import { QueryProvider } from "@/lib/providers/query-provider"
import { ThemeProvider } from "@/context/theme-context"
import { generatePartnerMetadata } from "@/lib/metadata"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
})

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
})

export async function generateMetadata(): Promise<Metadata> {
  return generatePartnerMetadata()
}

// Blocking script to apply theme class BEFORE React hydration to prevent white flash
// This runs synchronously and blocks rendering until complete
const themeInitScript = `
(function() {
  try {
    var theme = localStorage.getItem('genius365-theme') || 'system';
    var resolvedTheme = theme;
    if (theme === 'system') {
      resolvedTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(resolvedTheme);
  } catch (e) {
    // localStorage may not be available
    document.documentElement.classList.add('dark');
  }
})();
`

// Inline script to suppress Vapi/Daily SDK "ejection" errors before React hydration
const suppressSdkErrorsScript = `
(function() {
  var patterns = ['meeting has ended', 'ejection', 'ended due to ejection'];
  function shouldSuppress(msg) {
    if (!msg) return false;
    var str = String(msg).toLowerCase();
    return patterns.some(function(p) { return str.indexOf(p) !== -1; });
  }
  var origError = console.error;
  console.error = function() {
    for (var i = 0; i < arguments.length; i++) {
      if (shouldSuppress(arguments[i]) || (arguments[i] && shouldSuppress(arguments[i].message))) {
        return;
      }
    }
    return origError.apply(console, arguments);
  };
  window.addEventListener('error', function(e) {
    if (shouldSuppress(e.message) || shouldSuppress(e.error)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }
  }, true);
  window.addEventListener('unhandledrejection', function(e) {
    if (shouldSuppress(e.reason)) {
      e.preventDefault();
      e.stopImmediatePropagation();
      return false;
    }
  }, true);
})();
`

// Global loading styles - CSS-only approach using pseudo-element on body
// This avoids hydration mismatches by not adding extra DOM nodes
const globalLoadingStyles = `
  /* Loading spinner using body::before - no extra DOM nodes */
  body:not(.hydrated)::before {
    content: '';
    position: fixed;
    inset: 0;
    z-index: 9999;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  body:not(.hydrated)::after {
    content: '';
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 40px;
    height: 40px;
    border: 3px solid transparent;
    border-top-color: hsl(262 83% 58%);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    z-index: 10000;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  /* Hide spinner when hydrated */
  body.hydrated::before,
  body.hydrated::after {
    display: none !important;
  }
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Apply theme BEFORE anything renders to prevent white flash */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        {/* Global loading styles */}
        <style dangerouslySetInnerHTML={{ __html: globalLoadingStyles }} />
        {/* Suppress Vapi/Daily SDK errors before React/Next.js error overlay initializes */}
        <script dangerouslySetInnerHTML={{ __html: suppressSdkErrorsScript }} />
      </head>
      <body 
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background`}
        suppressHydrationWarning
      >
        <ThemeProvider defaultTheme="system" storageKey="genius365-theme">
          <QueryProvider>
            {children}
            <Toaster position="top-right" />
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
