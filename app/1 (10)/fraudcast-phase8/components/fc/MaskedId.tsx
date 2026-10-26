"use client";
// Shows a masked synthetic ID with a Show/Hide toggle.

import { useState } from "react";

export default function MaskedId({ label, masked, full }: { label: string; masked: string; full: string | null }) {
  const [show, setShow] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="font-mono text-[13px] tabular-nums">{show && full ? full : masked}</span>
      {full && (
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={`${show ? "Hide" : "Show"} full ${label}`}
          className="rounded-full px-2 py-0.5 text-[11px] font-medium text-blue-700 hover:bg-blue-50 focus-visible:ring-2 focus-visible:ring-blue-500"
        >
          {show ? "Hide" : "Show"}
        </button>
      )}
    </span>
  );
}
