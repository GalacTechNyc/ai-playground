"use client";
import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTH_ENABLED, SUPABASE_KEY, SUPABASE_URL } from "./config";
let client: SupabaseClient | null = null;
export function supabaseBrowser(): SupabaseClient | null {
  if (!AUTH_ENABLED) return null;
  return (client ??= createBrowserClient(SUPABASE_URL, SUPABASE_KEY));
}
