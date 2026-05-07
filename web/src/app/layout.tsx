import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import "./globals.css";
import { AgentStatusProvider } from "@/lib/agentStatus";
import { GlobalAgentOverlay } from "@/components/GlobalAgentOverlay";
import { LiveAgentStatusBadge } from "@/components/LiveAgentStatusBadge";

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
        <AgentStatusProvider>
          <header className="border-b border-line bg-bg/80 backdrop-blur-sm">
            <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2 group">
                <span className="text-xl">◖</span>
                <span className="font-mono text-sm tracking-tight group-hover:text-sage-deep transition">
                  waiting-lounge
                </span>
              </Link>
              <div className="flex items-center gap-4">
                <LiveAgentStatusBadge />
                <nav className="flex items-center gap-5 text-sm text-muted">
                  <Link href="/join" className="hover:text-ink">Join</Link>
                  <Link href="/board" className="hover:text-ink">Board</Link>
                  <Link href="/settings" className="hover:text-ink">About</Link>
                </nav>
              </div>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-line text-xs text-muted">
            <div className="max-w-5xl mx-auto px-6 py-5 flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <span>No code, prompts, repo paths, transcripts, or file names are uploaded.</span>
              <span className="font-mono">temporary · anonymous · low-pressure</span>
            </div>
          </footer>
          <GlobalAgentOverlay />
        </AgentStatusProvider>
      </body>
    </html>
  );
}
