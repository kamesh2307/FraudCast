import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";
import { demoNow } from "../lib/demo-time";
import { dt } from "../lib/format";

export const metadata: Metadata = {
  title: "FraudCast – Fraud Intervention Intelligence (Synthetic Demo)",
  description: "Buildathon demo. Synthetic data only.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Wrapper forces a light theme regardless of the template's globals.css */}
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <div role="note" className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            Synthetic demonstration data. Not for operational use. · Demo clock: {dt(demoNow().toISOString())}
          </div>
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/" className="text-lg font-bold text-slate-900">
                Fraud<span className="text-blue-700">Cast</span>
              </Link>
              <nav aria-label="Main" className="flex gap-4 text-sm">
                <Link href="/" className="rounded px-1 text-slate-700 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500">
                  Overview
                </Link>
                <Link href="/cases" className="rounded px-1 text-slate-700 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500">
                  Case queue
                </Link>
              </nav>
              <span className="ml-auto text-xs text-slate-500">Analyst view · DEMO-USER-ANALYST-01</span>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
