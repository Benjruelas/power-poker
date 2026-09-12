import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0a",
  colorScheme: "light",
};

export const metadata: Metadata = {
  title: "Power Poker · US ISOs",
  description:
    "Power Poker — map US ISO substations, transmission lines, and interconnection queues (ERCOT, SPP, MISO, PJM, CAISO, NYISO, ISO-NE) to screen battery storage development sites.",
  applicationName: "Power Poker",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Power Poker",
    // Extends content under the status bar; header uses safe-area-inset-top.
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  // Next may emit only mobile-web-app-capable; keep the Apple-prefixed tag for
  // older iOS Safari “Add to Home Screen” detection.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full font-sans overscroll-none">
        <TooltipProvider>{children}</TooltipProvider>
      </body>
    </html>
  );
}
