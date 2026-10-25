export default function Loading() {
  return (
    <div role="status" aria-live="polite" className="animate-pulse space-y-3">
      <div className="h-6 w-48 rounded bg-slate-200" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-lg bg-slate-200" />
        ))}
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
