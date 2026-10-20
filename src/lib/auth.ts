import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireCompanyContext() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: membership, error: membershipError } = await supabase
    .from("memberships")
    .select("organization_id, role, organizations(name, status)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`Não foi possível carregar seu acesso: ${membershipError.message}`);
  }

  if (!membership || !membership.organizations) {
    redirect("/access-pending");
  }

  const organization = Array.isArray(membership.organizations)
    ? membership.organizations[0]
    : membership.organizations;

  if (!organization || !["active", "trial"].includes(organization.status)) {
    redirect("/access-pending?status=inactive");
  }

  return {
    supabase,
    user,
    membership,
    organization,
  };
}
