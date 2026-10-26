import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";
import { aiStatus } from "../lib/ai/config";
import { demoNow } from "../lib/demo-time";
import { dt } from "../lib/format";

export const metadata: Metadata = {
  title: "FraudCast – Fraud Intervention Intelligence (Synthetic Demo)",
  description: "Buildathon demo. Synthetic data only.",
};

const NAV = [
  { href: "/", label: "Overview" },
  { href: "/cases", label: "Case queue" },
  { href: "/evaluation", label: "Evaluation" },
  { href: "/knowledge", label: "Knowledge" },
];

export default function RootLayout({ children }: { children: ReactNode }) {
  const ai = aiStatus();
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen bg-slate-50 text-slate-900">
          <div role="note" className="bg-amber-100 px-4 py-1.5 text-center text-xs font-medium text-amber-900">
            Synthetic demonstration data. Not for operational use. · Demo clock: {dt(demoNow().toISOString())}
          </div>
          <header className="border-b border-slate-200 bg-white">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
              <Link href="/" className="text-lg font-bold text-slate-900">
                Fraud<span className="text-blue-700">Cast</span>
              </Link>
              <nav aria-label="Main" className="flex flex-wrap gap-4 text-sm">
                {NAV.map((n) => (
                  <Link key={n.href} href={n.href} className="rounded px-1 text-slate-700 hover:text-blue-700 focus-visible:ring-2 focus-visible:ring-blue-500">
                    {n.label}
                  </Link>
                ))}
              </nav>
              <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                <span title={ai.reason} className={`rounded-full px-2 py-0.5 font-medium ${ai.ready ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600"}`}>
                  {ai.ready ? "AI on" : "AI off · template mode"}
                </span>
                Analyst view · DEMO-USER-ANALYST-01
              </span>
            </div>
          </header>
          <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
