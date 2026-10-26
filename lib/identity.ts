// FraudCast – synthetic account-holder identity (Phase 8). All values are fictional and cannot be real:
// Aadhaar numbers start with 0/1 and fail the check digit; PAN numbers use "Z" as the holder-type letter.
// Identity is shown to the analyst only. It is never sent to the AI (lib/ai/facts.ts does not include it).

export type Identity = { holder_name: string | null; aadhaar_synthetic: string | null; pan_synthetic: string | null };

export function identityOf(a: unknown): Identity {
  const o = (a ?? {}) as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === "string" && (o[k] as string).trim() ? (o[k] as string).trim() : null);
  return { holder_name: s("holder_name"), aadhaar_synthetic: s("aadhaar_synthetic"), pan_synthetic: s("pan_synthetic") };
}

const digits = (v: string) => v.replace(/\D/g, "");

/** XXXX XXXX 1234 (standard masked-Aadhaar style). */
export function maskAadhaar(v: string | null): string {
  if (!v) return "Not available";
  const d = digits(v);
  return d.length === 12 ? `XXXX XXXX ${d.slice(8)}` : "Invalid";
}

export function formatAadhaar(v: string | null): string | null {
  if (!v) return null;
  const d = digits(v);
  return d.length === 12 ? `${d.slice(0, 4)} ${d.slice(4, 8)} ${d.slice(8)}` : null;
}

/** XXXXX1234F */
export function maskPan(v: string | null): string {
  if (!v) return "Not available";
  return /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v) ? `XXXXX${v.slice(5)}` : "Invalid";
}
