"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { readCreateLinkForm } from "@/lib/access-links";
import { requireCompanyContext } from "@/lib/auth";

async function requireCompanyAdmin() {
  const context = await requireCompanyContext();
  if (context.membership.role !== "company_admin") {
    redirect("/dashboard?error=Apenas%20a%20gest%C3%A3o%20da%20empresa%20pode%20gerenciar%20a%20equipe.");
  }
  return context;
}

export async function createCompanyAccessLink(formData: FormData) {
  const { supabase, membership } = await requireCompanyAdmin();
  const form = readCreateLinkForm(formData);
  if ("error" in form) redirect(`/equipe?error=${encodeURIComponent(form.error ?? "Dados inválidos.")}`);

  // A empresa vem da sessão, nunca do formulário.
  const { error } = await supabase.rpc("create_access_link", {
    target_org_id: membership.organization_id,
    p_label: form.label,
    p_expires_at: form.expiresAt,
  });
  if (error) redirect("/equipe?error=N%C3%A3o%20foi%20poss%C3%ADvel%20gerar%20o%20link.");

  revalidatePath("/equipe");
  redirect("/equipe?linkCreated=1");
}

export async function revokeCompanyAccessLink(formData: FormData) {
  const { supabase } = await requireCompanyAdmin();
  const linkId = z.guid().safeParse(formData.get("linkId"));
  if (!linkId.success) redirect("/equipe?error=Link%20inv%C3%A1lido.");

  const { error } = await supabase.rpc("revoke_access_link", { link_id: linkId.data });
  if (error) redirect("/equipe?error=N%C3%A3o%20foi%20poss%C3%ADvel%20revogar%20o%20link.");

  revalidatePath("/equipe");
  redirect("/equipe?linkRevoked=1");
}

/** Bloqueia ou reativa um colaborador da própria empresa (nunca a si mesmo nem outro gestor). */
export async function setCollaboratorStatus(formData: FormData) {
  const { supabase, user, membership } = await requireCompanyAdmin();
  const parsed = z
    .object({ userId: z.guid(), status: z.enum(["active", "blocked"]) })
    .safeParse({ userId: formData.get("userId"), status: formData.get("status") });
  if (!parsed.success || parsed.data.userId === user.id) redirect("/equipe?error=Opera%C3%A7%C3%A3o%20inv%C3%A1lida.");

  const { data: updated, error } = await supabase
    .from("memberships")
    .update({ status: parsed.data.status })
    .eq("organization_id", membership.organization_id)
    .eq("user_id", parsed.data.userId)
    .eq("role", "member")
    .select("id");
  if (error || !updated?.length) redirect("/equipe?error=N%C3%A3o%20foi%20poss%C3%ADvel%20atualizar%20o%20colaborador.");

  revalidatePath("/equipe");
  redirect("/equipe?memberUpdated=1");
}
