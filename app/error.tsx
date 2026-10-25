"use client";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-2xl rounded-lg border border-red-300 bg-red-50 p-6 text-red-900">
      <h1 className="text-lg font-semibold">Something went wrong loading this page</h1>
      <p className="mt-2 text-sm">{error.message}</p>
      <ul className="mt-3 list-disc pl-5 text-sm">
        <li>Check that NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set (.env.local locally, Vercel settings online).</li>
        <li>Check that schema.sql and seed.sql were both run in Supabase.</li>
        <li>If you changed environment variables in Vercel, redeploy.</li>
      </ul>
      <button type="button" onClick={() => reset()} className="mt-4 rounded bg-red-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-800">
        Try again
      </button>
    </div>
  );
}
