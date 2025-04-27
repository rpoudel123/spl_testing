/* eslint-disable */
// @ts-nocheck
import type { Metadata } from "next";
import { Space_Grotesk } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { SolanaProvider } from "@/lib/solana/SolanaProvider";
import { SpinGameProvider } from "@/lib/supabase/gameContext";
import { WebSocketGameProvider } from '@/lib/websocket/gameContext';
import { SoundProvider } from '@/lib/sound/soundContext';
import { Header } from '@/components/Header';
import { MobileBottomBar } from '@/components/MobileBottomBar';

const spaceGrotesk = Space_Grotesk({ 
  subsets: ["latin"],
  weight: ['300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: "Solana Spin",
  description: "Spin the wheel and win SOL",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${spaceGrotesk.className} bg-[#111927] text-white min-h-screen`}>
        <Toaster position="top-right" theme="dark" />
        <SolanaProvider>
          <WebSocketGameProvider>
            <SpinGameProvider>
              <SoundProvider>
                <Header />
                <main className="min-h-screen pb-[80px] md:pb-0">
                  {children}
                </main>
                <MobileBottomBar />
              </SoundProvider>
            </SpinGameProvider>
          </WebSocketGameProvider>
        </SolanaProvider>
      </body>
    </html>
  );
}
