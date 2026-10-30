import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { saveGuidedAnswers } from "@/app/ideas/actions";
import { ChatGreeting } from "@/app/ideas/chat-greeting";
import { AppShell } from "@/app/components/app-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";
import { classifyText } from "@/lib/esg-classifier";
import { selectQuestions } from "@/lib/esg-questions";

export const metadata: Metadata = { title: "Algumas perguntas" };

/** Perguntas por regras, conforme o que falta no texto. Todas podem ficar em branco. */
export default async function GuidedQuestionsPage({
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
    .select("id, original_description, status, author_id, author_name")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!idea) notFound();
  if (idea.author_id !== user.id || idea.status !== "draft") redirect(`/ideas/${idea.id}`);

  const questions = selectQuestions(classifyText(idea.original_description ?? ""));
  if (!questions.length) redirect(`/ideas/${idea.id}/review`);

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <section className="panel chat-panel chat-standalone" aria-labelledby="questions-title">
        <h1 id="questions-title" className="chat-title">Só mais alguns detalhes</h1>
        {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
        <ol className="chat-log" aria-label="Sua ideia">
          <ChatGreeting aiAvailable={false} name={idea.author_name} />
          <li className="chat-message chat-message-user">
            <span className="chat-author">Você</span>
            <p className="preserve-lines">{idea.original_description}</p>
          </li>
        </ol>
        <form className="idea-form" action={saveGuidedAnswers}>
          <input type="hidden" name="ideaId" value={idea.id} />
          <p className="small-copy muted">Responda o que souber. Se não souber, deixe em branco.</p>
          {questions.map((question) => (
            <div key={question.id} className="proposal-field">
              <label htmlFor={question.id}>{question.text}</label>
              <textarea id={question.id} name={`answer:${question.id}`} rows={2} maxLength={1000} placeholder="Não sei" />
            </div>
          ))}
          <div className="form-actions">
            <SubmitButton className="button button-primary" pendingLabel="Salvando…">
              Revisar e enviar <span aria-hidden="true">→</span>
            </SubmitButton>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
