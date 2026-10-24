import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
export async function GET(req: Request) {
  const u = new URL(req.url); const code = u.searchParams.get("code");
  const next = u.searchParams.get("next") ?? "/approvals";
  const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/approvals";
  if (code) {
    const { error } = await (await supabaseServer()).auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(safe, u.origin));
  }
  return NextResponse.redirect(new URL("/signin?error=link", u.origin));
}
