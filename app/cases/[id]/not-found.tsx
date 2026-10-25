import Link from "next/link";

export default function CaseNotFound() {
  return (
    <div className="mx-auto max-w-xl rounded-lg border border-slate-200 bg-white p-6">
      <h1 className="text-lg font-semibold">Case not found</h1>
      <p className="mt-2 text-sm text-slate-600">This case ID does not exist in the synthetic dataset.</p>
      <Link href="/cases" className="mt-4 inline-block text-sm font-medium text-blue-700 underline">
        Back to the case queue
      </Link>
    </div>
  );
}
