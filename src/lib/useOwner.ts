"use client";
import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabase/client";
import { AUTH_ENABLED } from "@/lib/supabase/config";
/** Owner session. In mock mode `ready` is true and no auth headers are needed. */
export function useOwner() {
  const [session, setSession] = useState<Session | null>(null);
  const [loaded, setLoaded] = useState(!AUTH_ENABLED);
  useEffect(() => {
    const sb = supabaseBrowser(); if (!sb) return;
    sb.auth.getSession().then(({ data }) => { setSession(data.session); setLoaded(true); });
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);
  const headers = (): Record<string, string> => (session ? { Authorization: `Bearer ${session.access_token}` } : {});
  return {
    authEnabled: AUTH_ENABLED, loaded, session, email: session?.user.email ?? null,
    ready: !AUTH_ENABLED || !!session, headers,
    signOut: () => supabaseBrowser()?.auth.signOut(),
  };
}
