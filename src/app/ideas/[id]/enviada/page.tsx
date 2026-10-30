import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { AppShell } from "@/app/components/app-shell";
import { requireCompanyContext } from "@/lib/auth";
import { isEmailConfigured } from "@/lib/email";
import { ideaProtocol } from "@/lib/email-messages";

export const metadata: Metadata = { title: "Ideia enviada" };

export default async function IdeaSentPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();

  const { supabase, user, membership, organization } = await requireCompanyContext();
  const { data: idea } = await supabase
    .from("ideas")
    .select("id, status, author_id")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!idea || idea.author_id !== user.id) notFound();
  if (idea.status === "draft") redirect(`/ideas/${idea.id}/review`);

  const { data: contact } = await supabase.from("ideas").select("author_email").eq("id", idea.id).maybeSingle();
  const willEmail = isEmailConfigured() && Boolean(contact?.author_email);

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <section className="panel chat-standalone sent-panel" aria-labelledby="sent-title">
        <span className="sent-icon" aria-hidden="true">✓</span>
        <h1 id="sent-title">Ideia enviada!</h1>
        <p>Obrigado por contribuir. A gestão de {organization.name} vai analisar sua proposta.</p>
        <p className="sent-protocol">Protocolo <strong>{ideaProtocol(idea.id)}</strong></p>
        <p className="muted small-copy">
          {willEmail
            ? "Enviamos uma confirmação para o seu e-mail, e você será avisado quando houver uma decisão."
            : "Guarde o protocolo para consultar a gestão sobre esta ideia."}
        </p>
        <Link className="button button-primary" href="/ideas/new">Enviar outra ideia</Link>
      </section>
    </AppShell>
  );
}
