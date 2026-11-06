import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ocular — Head movement, in context",
  description: "Meet Ocular, a local computer vision research prototype that organizes visible head movements for instructor review. Human judgment stays central.",
  applicationName: "Ocular",
  icons: { icon: "/brand/ocular-logo-yellow.png", apple: "/brand/ocular-logo-yellow.png" },
  openGraph: {
    title: "Ocular — Head movement, in context",
    description: "A clearer view of visible head movement. A thoughtful place for human review.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
