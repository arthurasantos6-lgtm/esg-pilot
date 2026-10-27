import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const next = request.nextUrl.searchParams.get("next");
  const destination =
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.includes("\\")
      ? next
      : "/dashboard";

  if (!code) {
    return NextResponse.redirect(new URL("/forgot-password?error=Link%20inv%C3%A1lido%20ou%20expirado.", request.url));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/forgot-password?error=Link%20inv%C3%A1lido%20ou%20expirado.", request.url));
  }

  return NextResponse.redirect(new URL(destination, request.url));
}
