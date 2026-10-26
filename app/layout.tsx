import type { Metadata, Viewport } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";

import "./globals.css";
import "./apple-theme.css";
import "./futuristic-theme.css";

import NavBar from "../components/fc/NavBar";
import ThemeToggle from "../components/fc/ThemeToggle";
import { aiStatus } from "../lib/ai/config";
import { demoNow } from "../lib/demo-time";
import { dt } from "../lib/format";

export const metadata: Metadata = {
  title: "FraudCast – Fraud Intervention Intelligence (Synthetic Demo)",
  description: "Buildathon demo. Synthetic data only.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0d14" },
    { media: "(prefers-color-scheme: light)", color: "#f5f5f7" },
  ],
};

// Runs before the page paints, so there is no flash of the wrong theme.
const THEME_SCRIPT = `
try {
  var t = localStorage.getItem("fc-theme");
  document.documentElement.dataset.theme = t === "light" ? "light" : "dark";
} catch (e) {
  document.documentElement.dataset.theme = "dark";
}
`;

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const ai = aiStatus();

  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }}
        />
      </head>

      <body>
        <div className="min-h-screen">
          <header className="fc-header sticky top-0 z-[1100] backdrop-blur-xl backdrop-saturate-150">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-5 gap-y-2 px-5 py-2.5">
              <Link
                href="/"
                className="flex items-center gap-2.5 text-[17px] font-semibold tracking-tight"
              >
                <span
                  aria-hidden="true"
                  className="grid h-7 w-7 place-items-center rounded-[9px] bg-gradient-to-br from-[#f0b8d8] via-[#c4b5fb] to-[#8bd9f0] text-[13px] font-bold text-[#0d1018] shadow-[0_0_18px_rgba(196,181,251,0.45)]"
                >
                  F
                </span>

                <span className="fc-title">
                  Fraud
                  <span className="bg-gradient-to-r from-[#d48ab8] via-[#9b87f0] to-[#4fb8d6] bg-clip-text text-transparent">
                    Cast
                  </span>
                </span>
              </Link>

              <Suspense fallback={null}>
                <NavBar />
              </Suspense>

              <div className="ml-auto flex items-center gap-2 text-[12px]">
                <span
                  title={ai.reason}
                  data-tone={ai.ready ? "purple" : "slate"}
                  className="fc-pill flex items-center gap-1.5 rounded-full px-2.5 py-1 font-medium"
                >
                  <span
                    aria-hidden="true"
                    className="fc-dot h-1.5 w-1.5 rounded-full"
                  />
                  {ai.ready ? "AI on" : "Template mode"}
                </span>

                <ThemeToggle />

                <span className="hidden rounded-full bg-black/[0.05] px-2.5 py-1 text-slate-500 lg:inline">
                  Analyst · DEMO-USER-ANALYST-01
                </span>
              </div>
            </div>
          </header>

          <div
            role="note"
            className="mx-auto mt-3 flex max-w-7xl justify-center px-5"
          >
            <span
              data-tone="amber"
              className="fc-pill rounded-full px-3 py-1 text-[12px] font-medium"
            >
              Synthetic demonstration data · Not for operational use · Demo clock{" "}
              {dt(demoNow().toISOString())}
            </span>
          </div>

          <main className="mx-auto max-w-7xl px-5 pb-12 pt-5">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}