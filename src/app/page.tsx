import { redirect } from "next/navigation";
import { connection } from "next/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export default async function Home() {
  await connection();
  if (!isSupabaseConfigured()) {
    redirect("/setup");
  }

  redirect("/dashboard");
}
