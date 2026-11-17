import type { Metadata } from "next";
import { Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

// Self-hosted at build time by next/font; the adjusted fallback keeps metrics stable while it loads.
const sans = Schibsted_Grotesk({ subsets: ["latin"], display: "swap", variable: "--font-ocular" });

export const metadata: Metadata = {
  title: "Ocular — Head movement, in context",
  description: "Meet Ocular, a local computer vision research prototype that organizes visible head movements for instructor review. Human judgment stays central.",
  applicationName: "Ocular",
  icons: { icon: "/brand/ocular-logo-256.png", apple: "/brand/ocular-logo-180.png" },
  openGraph: {
    title: "Ocular — Head movement, in context",
    description: "A clearer view of visible head movement. A thoughtful place for human review.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" className={sans.variable}><body>{children}</body></html>;
}
