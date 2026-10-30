import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { startIdea } from "@/app/ideas/actions";
import { ChatGreeting } from "@/app/ideas/chat-greeting";
import { AppShell } from "@/app/components/app-shell";
import { AudioRecorder } from "@/app/components/audio-recorder";
import { SubmitButton } from "@/app/components/submit-button";
import { getTranscriptionConfig } from "@/lib/ai/transcription";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";
import { readCollaboratorName } from "@/lib/collaborator-name";
import { isAiAvailable } from "@/lib/idea-ai";
import { CANNOT_CREATE_IDEAS_MESSAGE, canCreateIdeas } from "@/lib/idea-permissions";

export const metadata: Metadata = { title: "Nova ideia" };

// Abrir o copiloto gera a primeira resposta da IA durante a requisição.
export const maxDuration = 120;

export default async function NewIdeaPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { user, membership, organization } = await requireCompanyContext();
  assertModuleEnabled(organization.enabled_modules, "ideas", "Ideias");
  if (!canCreateIdeas(membership)) {
    redirect(`/ideas?error=${encodeURIComponent(CANNOT_CREATE_IDEAS_MESSAGE)}`);
  }
  const { error } = await searchParams;
  const aiAvailable = isAiAvailable();
  const authorName = await readCollaboratorName();

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <section className="panel chat-panel chat-standalone" aria-labelledby="chat-title">
        <h1 id="chat-title" className="chat-title">Nova ideia</h1>
        <ol className="chat-log" role="log" aria-label="Mensagens da conversa">
          <ChatGreeting aiAvailable={aiAvailable} name={authorName} />
        </ol>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <form className="chat-composer idea-form" action={startIdea}>
          {!authorName && (
            <>
              <label htmlFor="authorName">Seu nome</label>
              <input id="authorName" name="authorName" type="text" minLength={2} maxLength={80} required autoComplete="name" />
              <label htmlFor="authorEmail">E-mail (opcional)</label>
              <input id="authorEmail" name="authorEmail" type="email" maxLength={254} autoComplete="email" />
            </>
          )}
          <label htmlFor="description" className="sr-only">Sua ideia</label>
          <textarea
            id="description"
            name="description"
            rows={4}
            minLength={10}
            maxLength={8000}
            required
            autoFocus={Boolean(authorName)}
            placeholder="Escreva aqui ou grave um áudio. Ex.: Na lavagem de peças usamos muita água limpa que vai direto para o esgoto…"
          />
          <div className="form-actions">
            <AudioRecorder targetId="description" serverTranscription={Boolean(getTranscriptionConfig())} />
            {aiAvailable && (
              <SubmitButton name="intent" value="review" className="button button-secondary" pendingLabel="Salvando…">
                Preencher sem o copiloto
              </SubmitButton>
            )}
            <SubmitButton
              name="intent"
              value={aiAvailable ? "copilot" : "review"}
              className="button button-primary"
              pendingLabel={aiAvailable ? "O copiloto está lendo…" : "Salvando…"}
            >
              {aiAvailable ? "Enviar" : "Continuar"} <span aria-hidden="true">→</span>
            </SubmitButton>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
