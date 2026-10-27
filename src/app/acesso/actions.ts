"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

const joinErrors: Record<string, string> = {
  invalid_link: "Este link é inválido, expirou ou foi desativado. Peça um novo link à sua empresa.",
  linked_to_other_org: "Este navegador já está vinculado a outra empresa. Saia do acesso atual para usar este link.",
  membership_blocked: "Seu acesso a esta empresa está bloqueado. Fale com a gestão da sua empresa.",
  platform_admin_cannot_join: "Administradores da plataforma não podem entrar como colaboradores.",
};

/**
 * Entra como colaborador pelo link da empresa: cria (se necessário) uma
 * sessão anônima e vincula esse usuário à empresa do link, no banco.
 */
export async function joinWithLink(formData: FormData) {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) redirect("/acesso/invalido");
  const linkUrl = `/acesso/${token.data}`;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let createdSession = false;
  if (!user) {
    const { error } = await supabase.auth.signInAnonymously();
    if (error) {
      redirect(
        `${linkUrl}?error=${encodeURIComponent(
          "O acesso por link não está disponível no momento. Avise a gestão da sua empresa.",
        )}`,
      );
    }
    createdSession = true;
  }

  const { error } = await supabase.rpc("join_organization_with_link", { p_token: token.data });
  if (error) {
    // Não deixa uma sessão anônima órfã quando o vínculo falha.
    if (createdSession) await supabase.auth.signOut();
    const code = Object.keys(joinErrors).find((key) => error.message.includes(key));
    redirect(`${linkUrl}?error=${encodeURIComponent(code ? joinErrors[code] : "Não foi possível entrar. Tente novamente.")}`);
  }

  redirect("/ideas/new");
}

/** Encerra a sessão atual (de outra empresa) e volta para o link. */
export async function leaveAndReturn(formData: FormData) {
  const token = tokenSchema.safeParse(formData.get("token"));
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect(token.success ? `/acesso/${token.data}` : "/login");
}
