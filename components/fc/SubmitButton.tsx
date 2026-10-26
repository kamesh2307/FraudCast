"use client";
// A submit button that shows "Running…" while its form's server action is working.

import { useFormStatus } from "react-dom";

export default function SubmitButton({
  label,
  pendingLabel = "Running…",
  variant = "primary",
}: {
  label: string;
  pendingLabel?: string;
  variant?: "primary" | "secondary";
}) {
  const { pending } = useFormStatus();
  const style =
    variant === "primary"
      ? "bg-blue-700 text-white hover:bg-blue-800 disabled:bg-blue-400"
      : "border border-slate-300 bg-white text-slate-800 hover:bg-slate-50 disabled:text-slate-400";
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className={`rounded px-4 py-2 text-sm font-medium focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait ${style}`}
    >
      <span aria-live="polite">{pending ? pendingLabel : label}</span>
    </button>
  );
}
