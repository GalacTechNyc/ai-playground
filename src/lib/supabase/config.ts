export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
export const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
/** Owner auth is on only when the app runs against Supabase; mock mode needs no sign-in. */
export const AUTH_ENABLED = process.env.NEXT_PUBLIC_BACKEND === "supabase" && !!SUPABASE_URL && !!SUPABASE_KEY;
