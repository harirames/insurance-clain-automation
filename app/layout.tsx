import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { SessionProviderWrapper } from "@/components/layout/SessionProviderWrapper";

import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Plum Claims",
  description: "Health insurance claims processing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <SessionProviderWrapper>{children}</SessionProviderWrapper>
      </body>
    </html>
  );
}
