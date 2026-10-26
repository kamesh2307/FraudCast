import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";
import "./apple-theme.css";
import NavBar from "../components/fc/NavBar";
import { aiStatus } from "../lib/ai/config";
import { demoNow } from "../lib/demo-time";
import { dt } from "../lib/format";

export const metadata: Metadata = {
  title: "FraudCast – Fraud Intervention Intelligence (Synthetic Demo)",
  description: "Buildathon demo. Synthetic data only.",
};

export const viewport: Viewport = { themeColor: "#f5f5f7" };

export default function RootLayout({ children }: { children: ReactNode }) {
  const ai = aiStatus();
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <header className="sticky top-0 z-[1100] border-b border-black/[0.06] bg-white/70 backdrop-blur-xl backdrop-saturate-150">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
              <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight text-slate-900">
                <span aria-hidden="true" className="grid h-7 w-7 place-items-center rounded-[8px] bg-gradient-to-br from-[#0a84ff] to-[#5e5ce6] text-[13px] font-bold text-white shadow-sm">F</span>
                FraudCast
              </Link>
              <NavBar />
              <div className="ml-auto flex items-center gap-2 text-[12px]">
                <span title={ai.reason} className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium ${ai.ready ? "bg-[#5e5ce6]/10 text-[#3634a3]" : "bg-black/[0.05] text-slate-600"}`}>
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${ai.ready ? "bg-[#5e5ce6]" : "bg-slate-400"}`} />
                  {ai.ready ? "AI on" : "Template mode"}
                </span>
                <span className="hidden rounded-full bg-black/[0.05] px-2.5 py-1 text-slate-600 sm:inline">Analyst · DEMO-USER-ANALYST-01</span>
              </div>
            </div>
          </header>
          <div role="note" className="mx-auto mt-3 flex max-w-7xl justify-center px-5">
            <span className="rounded-full bg-[#ff9f0a]/[0.12] px-3 py-1 text-[12px] font-medium text-[#8a4b00]">
              Synthetic demonstration data · Not for operational use · Demo clock {dt(demoNow().toISOString())}
            </span>
          </div>
          <main className="mx-auto max-w-7xl px-5 pb-12 pt-5">{children}</main>
        </div>
      </body>
    </html>
  );
}
