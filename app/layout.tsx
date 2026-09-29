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
  title: "Projects · Runex",
  description: "Deploy web apps, servers, and services on Runex",
  icons: {
    icon: "/runex.svg",
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
