"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { COMPANY_MODULES, requirePlatformAdmin } from "@/lib/auth";
import { readCreateLinkForm } from "@/lib/access-links";
import { logAudit } from "@/lib/platform-audit";

const organizationSchema = z.object({
  name: z.string().trim().min(2, "Informe o nome da empresa.").max(160),
  displayName: z.string().trim().max(160).optional(),
  sector: z.string().trim().max(100).optional(),
  companySize: z.string().trim().max(100).optional(),
  status: z.enum(["trial", "active", "suspended", "inactive"]),
  modules: z.array(z.enum(COMPANY_MODULES)).optional(),
});

export async function createOrganization(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const parsed = organizationSchema.safeParse({
    name: formData.get("name"),
    displayName: formData.get("displayName") || undefined,
    sector: formData.get("sector") || undefined,
    companySize: formData.get("companySize") || undefined,
    status: formData.get("status") || "trial",
    modules: formData.getAll("modules"),
  });

  if (!parsed.success) {
    redirect(`/admin/companies/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { data, error } = await supabase
    .from("organizations")
    .insert({
      name: parsed.data.name,
      display_name: parsed.data.displayName || null,
      sector: parsed.data.sector || null,
      company_size: parsed.data.companySize || null,
      status: parsed.data.status,
      enabled_modules: parsed.data.modules ?? [],
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/admin/companies/new?error=${encodeURIComponent("Não foi possível criar a empresa. Tente novamente.")}`);
  }

  await logAudit(supabase, user.id, "organization_created", "organization", data.id, {
    name: parsed.data.name,
    status: parsed.data.status,
  });

  revalidatePath("/admin/companies");
  redirect(`/admin/companies/${data.id}`);
}

const updateOrganizationSchema = organizationSchema.extend({
  organizationId: z.string().uuid(),
});

export async function updateOrganization(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const organizationId = formData.get("organizationId");
  const parsed = updateOrganizationSchema.safeParse({
    organizationId,
    name: formData.get("name"),
    displayName: formData.get("displayName") || undefined,
    sector: formData.get("sector") || undefined,
    companySize: formData.get("companySize") || undefined,
    status: formData.get("status"),
    modules: formData.getAll("modules"),
  });

  if (!parsed.success) {
    redirect(`/admin/companies/${organizationId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { error } = await supabase
    .from("organizations")
    .update({
      name: parsed.data.name,
      display_name: parsed.data.displayName || null,
      sector: parsed.data.sector || null,
      company_size: parsed.data.companySize || null,
      status: parsed.data.status,
      enabled_modules: parsed.data.modules ?? [],
    })
    .eq("id", parsed.data.organizationId);

  if (error) {
    redirect(`/admin/companies/${parsed.data.organizationId}?error=${encodeURIComponent("Não foi possível atualizar a empresa.")}`);
  }

  await logAudit(supabase, user.id, "organization_updated", "organization", parsed.data.organizationId, {
    status: parsed.data.status,
    modules: parsed.data.modules ?? [],
  });

  revalidatePath("/admin/companies");
  revalidatePath(`/admin/companies/${parsed.data.organizationId}`);
  redirect(`/admin/companies/${parsed.data.organizationId}?updated=1`);
}

const addMembershipSchema = z.object({
  organizationId: z.string().uuid(),
  email: z.string().trim().email("Informe um e-mail válido."),
  role: z.enum(["company_admin", "member"]),
});

export async function addMembership(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const organizationId = formData.get("organizationId");
  const parsed = addMembershipSchema.safeParse({
    organizationId,
    email: formData.get("email"),
    role: formData.get("role"),
  });

  if (!parsed.success) {
    redirect(`/admin/companies/${organizationId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { data: foundUsers, error: lookupError } = await supabase.rpc(
    "platform_find_user_by_email",
    { target_email: parsed.data.email },
  );

  if (lookupError) {
    redirect(`/admin/companies/${parsed.data.organizationId}?error=${encodeURIComponent("Não foi possível localizar o usuário.")}`);
  }

  const foundUser = foundUsers?.[0];
  if (!foundUser) {
    redirect(
      `/admin/companies/${parsed.data.organizationId}?error=${encodeURIComponent(
        "Nenhum usuário com esse e-mail foi encontrado. Crie o usuário em Authentication > Users no Supabase antes de vincular.",
      )}`,
    );
  }

  const { error: insertError } = await supabase.from("memberships").insert({
    organization_id: parsed.data.organizationId,
    user_id: foundUser.id,
    role: parsed.data.role,
  });

  if (insertError) {
    const message =
      insertError.code === "23505"
        ? "Esse usuário já está vinculado a uma organização."
        : "Não foi possível vincular o usuário.";
    redirect(`/admin/companies/${parsed.data.organizationId}?error=${encodeURIComponent(message)}`);
  }

  await logAudit(supabase, user.id, "membership_created", "membership", null, {
    organization_id: parsed.data.organizationId,
    user_email: parsed.data.email,
    role: parsed.data.role,
  });

  revalidatePath(`/admin/companies/${parsed.data.organizationId}`);
  redirect(`/admin/companies/${parsed.data.organizationId}?memberAdded=1`);
}

const updateMembershipSchema = z.object({
  membershipId: z.string().uuid(),
  organizationId: z.string().uuid(),
  role: z.enum(["company_admin", "member"]),
  status: z.enum(["active", "blocked"]),
});

export async function updateMembership(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const organizationId = formData.get("organizationId");
  const parsed = updateMembershipSchema.safeParse({
    membershipId: formData.get("membershipId"),
    organizationId,
    role: formData.get("role"),
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirect(`/admin/companies/${organizationId}?error=${encodeURIComponent("Dados inválidos para atualizar o vínculo.")}`);
  }

  const { error } = await supabase
    .from("memberships")
    .update({ role: parsed.data.role, status: parsed.data.status })
    .eq("id", parsed.data.membershipId);

  if (error) {
    redirect(`/admin/companies/${parsed.data.organizationId}?error=${encodeURIComponent("Não foi possível atualizar o vínculo.")}`);
  }

  await logAudit(supabase, user.id, "membership_updated", "membership", parsed.data.membershipId, {
    role: parsed.data.role,
    status: parsed.data.status,
  });

  revalidatePath(`/admin/companies/${parsed.data.organizationId}`);
  redirect(`/admin/companies/${parsed.data.organizationId}?memberUpdated=1`);
}

export async function createPlatformAccessLink(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const organizationId = z.string().uuid().safeParse(formData.get("organizationId"));
  if (!organizationId.success) redirect("/admin/companies?error=Empresa%20inv%C3%A1lida.");
  const companyUrl = `/admin/companies/${organizationId.data}`;

  const form = readCreateLinkForm(formData);
  if ("error" in form) redirect(`${companyUrl}?error=${encodeURIComponent(form.error ?? "Dados inválidos.")}`);

  const { data: linkId, error } = await supabase.rpc("create_access_link", {
    target_org_id: organizationId.data,
    p_label: form.label,
    p_expires_at: form.expiresAt,
  });
  if (error || !linkId) redirect(`${companyUrl}?error=${encodeURIComponent("Não foi possível gerar o link.")}`);

  await logAudit(supabase, user.id, "access_link_created", "access_link", linkId, {
    organization_id: organizationId.data,
    expires_at: form.expiresAt,
  });

  revalidatePath(companyUrl);
  redirect(`${companyUrl}?linkCreated=1`);
}

export async function revokePlatformAccessLink(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const linkId = z.string().uuid().safeParse(formData.get("linkId"));
  const organizationId = z.string().uuid().safeParse(formData.get("organizationId"));
  if (!linkId.success || !organizationId.success) redirect("/admin/companies?error=Link%20inv%C3%A1lido.");
  const companyUrl = `/admin/companies/${organizationId.data}`;

  const { error } = await supabase.rpc("revoke_access_link", { link_id: linkId.data });
  if (error) redirect(`${companyUrl}?error=${encodeURIComponent("Não foi possível revogar o link.")}`);

  await logAudit(supabase, user.id, "access_link_revoked", "access_link", linkId.data, {
    organization_id: organizationId.data,
  });

  revalidatePath(companyUrl);
  redirect(`${companyUrl}?linkRevoked=1`);
}
