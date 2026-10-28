import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "GAZE — Head movement, in context",
  description: "Meet GAZE, a local computer vision research prototype that organizes visible head movements for instructor review. Human judgment stays central.",
  applicationName: "GAZE",
  icons: { icon: "/icon.svg" },
  openGraph: {
    title: "GAZE — Head movement, in context",
    description: "A clearer view of visible head movement. A thoughtful place for human review.",
    type: "website",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
