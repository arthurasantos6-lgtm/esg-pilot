import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { organizeProposal } from "@/app/ideas/actions";
import { CopilotChatForm } from "@/app/ideas/[id]/copilot/chat-form";
import { AppShell } from "@/app/components/app-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";
import { isAiAvailable, MAX_USER_MESSAGES_PER_IDEA, toIdeaPromptInput } from "@/lib/idea-ai";

export const metadata: Metadata = { title: "Copiloto da ideia" };

// A organização da proposta chama a IA durante a requisição.
export const maxDuration = 120;

export default async function IdeaCopilotPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();

  const { supabase, user, membership, organization } = await requireCompanyContext();
  assertModuleEnabled(organization.enabled_modules, "ideas", "Ideias");

  const { data: idea } = await supabase
    .from("ideas")
    .select("id, title, original_description, problem, solution, area, status, author_id")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();

  if (!idea) notFound();
  if (idea.author_id !== user.id || idea.status !== "draft") redirect(`/ideas/${idea.id}`);

  const { data: messages } = await supabase
    .from("idea_copilot_messages")
    .select("id, role, content, created_at")
    .eq("idea_id", idea.id)
    .order("created_at", { ascending: true });

  const conversation = messages ?? [];
  const userMessageCount = conversation.filter((message) => message.role === "user").length;
  const awaitingReply = !conversation.length || conversation.at(-1)?.role === "user";
  const aiAvailable = isAiAvailable();
  const original = toIdeaPromptInput(idea).originalDescription;

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/ideas">← Voltar para ideias</Link>
          <p className="eyebrow">AMADURECER A IDEIA</p>
          <h1>{idea.title}</h1>
          <p className="muted">
            <span className="status-badge status-badge-draft">Rascunho</span> Visível só para você até o envio.
          </p>
        </div>
        <div className="header-actions">
          <Link className="button button-secondary" href={`/ideas/${idea.id}/review`}>Revisar proposta</Link>
        </div>
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}

      <div className="form-layout">
        <section className="panel chat-panel" aria-labelledby="chat-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">COPILOTO ESG · IA</p>
              <h2 id="chat-title">Conversa</h2>
            </div>
            <span className="subtle-tag">{userMessageCount}/{MAX_USER_MESSAGES_PER_IDEA} mensagens</span>
          </div>

          {!aiAvailable ? (
            <div className="alert alert-info" role="status">
              O copiloto de IA não está disponível nesta plataforma no momento. Você pode organizar e enviar a proposta
              sem ele. <Link className="text-link" href={`/ideas/${idea.id}/review`}>Ir para a revisão</Link>
            </div>
          ) : (
            <>
              <ol className="chat-log" role="log" aria-live="polite" aria-label="Mensagens da conversa">
                {conversation.map((message) => (
                  <li key={message.id} className={`chat-message chat-message-${message.role}`}>
                    <span className="chat-author">{message.role === "user" ? "Você" : "Copiloto (IA)"}</span>
                    <p className="preserve-lines">{message.content}</p>
                  </li>
                ))}
              </ol>
              <CopilotChatForm ideaId={idea.id} awaitingReply={awaitingReply} />
              <form action={organizeProposal} className="chat-organize">
                <input type="hidden" name="ideaId" value={idea.id} />
                <p className="small-copy muted">
                  Quando a ideia estiver clara, o copiloto organiza uma proposta estruturada. Você poderá editar tudo antes de enviar.
                </p>
                <SubmitButton pendingLabel="Organizando a proposta…" className="button button-primary">
                  Organizar proposta <span aria-hidden="true">→</span>
                </SubmitButton>
              </form>
            </>
          )}
        </section>

        <aside className="info-card">
          <span className="info-icon" aria-hidden="true">✎</span>
          <h2>Seu texto original</h2>
          <p className="preserve-lines">{original}</p>
          <p className="small-copy">Este texto fica preservado como você escreveu, para comparação. Depois do envio, a gestão da empresa poderá ver esta conversa.</p>
        </aside>
      </div>
    </AppShell>
  );
}
