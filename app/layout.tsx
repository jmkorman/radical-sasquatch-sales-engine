import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { QuickLogButton } from "@/components/global/QuickLogButton";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Radical Sasquatch Sales Engine",
  description: "Sales CRM and daily action engine for Radical Sasquatch Dumpling Company",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} antialiased`}>
        {children}
        <QuickLogButton />
      </body>
    </html>
  );
}
