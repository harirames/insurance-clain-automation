import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SessionProviderWrapper } from "@/components/layout/SessionProviderWrapper";

import "./globals.css";

const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Plum Claims",
  description: "AI-powered health insurance claims processing",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistMono.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <SessionProviderWrapper>
          <TooltipProvider>
            {children}
          </TooltipProvider>
        </SessionProviderWrapper>
      </body>
    </html>
  );
}
