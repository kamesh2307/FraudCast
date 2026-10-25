// FraudCast – server-only Supabase client.
// This file is only imported by server components, so the secret key never reaches the browser.
// NEVER rename SUPABASE_SERVICE_ROLE_KEY to start with NEXT_PUBLIC_.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function db(): SupabaseClient {
  if (client) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Missing Supabase settings. Add NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to .env.local (and to Vercel → Settings → Environment Variables).",
    );
  }
  client = createClient(url, key, { auth: { persistSession: false } });
  return client;
}
