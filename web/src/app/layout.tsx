import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { AgentStatusProvider } from "@/lib/agentStatus";
import { AuthProvider } from "@/lib/auth";
import { PointsProvider } from "@/lib/points";
import { InGameProvider } from "@/lib/inGame";
import { SocketAuthBridge } from "@/components/SocketAuthBridge";
import { GlobalAgentOverlay } from "@/components/GlobalAgentOverlay";
import { HeaderNav } from "@/components/HeaderNav";
import { IncomingInviteBanner } from "@/components/IncomingInviteBanner";
import { GameStartRedirect } from "@/components/GameStartRedirect";

const geistSans = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist-sans",
  weight: "100 900",
});
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});

export const metadata: Metadata = {
  title: "Waiting Lounge",
  description: "A tiny lounge for agent downtime.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen flex flex-col`}>
        <AuthProvider>
          <SocketAuthBridge />
          <PointsProvider>
            <AgentStatusProvider>
              <InGameProvider>
                <HeaderNav />
                <main className="flex-1">{children}</main>
                <footer className="border-t border-line text-xs text-muted">
                  <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
                    <span>No code, prompts, repo paths, transcripts, or file names are uploaded.</span>
                    <span className="font-mono">temporary · anonymous · low-pressure</span>
                  </div>
                </footer>
                <GlobalAgentOverlay />
                <IncomingInviteBanner />
                <GameStartRedirect />
              </InGameProvider>
            </AgentStatusProvider>
          </PointsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
