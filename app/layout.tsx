import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import Script from "next/script";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

export const metadata: Metadata = {
  metadataBase: new URL("https://app.runex.cloud"),
  title: "Projects · Runex",
  description: "Deploy web apps, servers, and services on Runex",
  applicationName: "Runex",
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "48x48", type: "image/x-icon" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/runex.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    shortcut: ["/favicon.ico"],
  },
  openGraph: {
    title: "Runex",
    description: "Deploy web apps, servers, and services on Runex",
    siteName: "Runex",
    type: "website",
    url: "/",
    images: [
      {
        url: "/opengraph.png",
        width: 1200,
        height: 630,
        alt: "Runex",
        type: "image/png",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Runex",
    description: "Deploy web apps, servers, and services on Runex",
    images: ["/opengraph.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.className} h-full antialiased`} suppressHydrationWarning>
      <body suppressHydrationWarning className="h-full overflow-hidden bg-background text-foreground">
        <Script id="runex-theme" strategy="beforeInteractive">
          {`try{if(localStorage.getItem("runex.theme")==="dark"){document.documentElement.classList.add("dark");document.documentElement.style.colorScheme="dark"}}catch(e){}`}
        </Script>
        {children}
      </body>
    </html>
  );
}
