"use client";
// FraudCast – Step 23: countdown to the simulated acknowledgement. When it reaches zero it refreshes
// the page; the server then runs the simulation and marks the alert Acknowledged.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AlertCountdown({ approvedRealAt, delaySeconds }: { approvedRealAt: string; delaySeconds: number }) {
  const router = useRouter();
  const [left, setLeft] = useState<number | null>(null);

  useEffect(() => {
    const target = Date.parse(approvedRealAt) + delaySeconds * 1000;
    if (!Number.isFinite(target)) return;
    let refreshes = 0;
    let lastRefresh = 0;
    const tick = () => {
      const l = Math.max(0, Math.ceil((target - Date.now()) / 1000));
      setLeft(l);
      if (l === 0 && refreshes < 6 && Date.now() - lastRefresh > 3000) {
        refreshes++;
        lastRefresh = Date.now();
        router.refresh();
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [approvedRealAt, delaySeconds, router]);

  if (left === null) return null;
  return (
    <span aria-live="polite" className="text-xs text-slate-600">
      {left > 0 ? `⏳ Simulated acknowledgement in ${left}s…` : "Checking for acknowledgement…"}
    </span>
  );
}
