import { redirect } from "next/navigation";
import type { Json } from "@/lib/supabase/database.types";
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
    .select("organization_id, role, access_link_id, organizations(name, status, enabled_modules)")
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    throw new Error(`Não foi possível carregar seu acesso: ${membershipError.message}`);
  }

  if (!membership || !membership.organizations) {
    const { data: isPlatformAdmin } = await supabase.rpc("is_platform_admin");
    if (isPlatformAdmin) {
      redirect("/admin");
    }
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

/** Lista de chaves de módulo reconhecidas pela aplicação. */
export const COMPANY_MODULES = ["ideas", "projects"] as const;
export type CompanyModule = (typeof COMPANY_MODULES)[number];

export function parseEnabledModules(enabledModules: Json): string[] {
  return Array.isArray(enabledModules)
    ? enabledModules.filter((item): item is string => typeof item === "string")
    : [];
}

/** Redireciona para o painel com um aviso quando o módulo não está habilitado para a empresa. */
export function assertModuleEnabled(
  enabledModules: Json,
  moduleKey: CompanyModule,
  moduleLabel: string,
) {
  if (!parseEnabledModules(enabledModules).includes(moduleKey)) {
    redirect(`/dashboard?moduleDisabled=${encodeURIComponent(moduleLabel)}`);
  }
}

/** Garante que o usuário autenticado é um administrador da plataforma (fornecedora do SaaS). */
export async function requirePlatformAdmin() {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    redirect("/login");
  }

  const { data: isPlatformAdmin, error: adminError } = await supabase.rpc("is_platform_admin");

  if (adminError) {
    throw new Error(`Não foi possível verificar suas permissões: ${adminError.message}`);
  }

  if (!isPlatformAdmin) {
    redirect("/access-pending?status=forbidden");
  }

  return { supabase, user };
}
