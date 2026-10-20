"use client";

import { useActionState } from "react";
import { sendCopilotMessage, type CopilotFormState } from "@/app/ideas/actions";

const initialState: CopilotFormState = { error: null, sentAt: null };

export function CopilotChatForm({ ideaId, awaitingReply }: { ideaId: string; awaitingReply: boolean }) {
  const [state, formAction, pending] = useActionState(sendCopilotMessage, initialState);

  return (
    <div className="chat-composer">
      {pending && (
        <p className="chat-pending" role="status">
          <span className="chat-pending-dot" aria-hidden="true" /> O copiloto está escrevendo…
        </p>
      )}
      {state.error && !pending && <p className="alert alert-error" role="alert">{state.error}</p>}

      {awaitingReply && !pending ? (
        <form action={formAction} className="chat-retry">
          <input type="hidden" name="ideaId" value={ideaId} />
          <p className="small-copy muted">O copiloto ainda não respondeu à última mensagem.</p>
          <button className="button button-secondary button-small" type="submit">Pedir resposta novamente</button>
        </form>
      ) : (
        <form action={formAction} className="idea-form">
          <input type="hidden" name="ideaId" value={ideaId} />
          <label htmlFor="message">Sua resposta ao copiloto</label>
          <textarea
            id="message"
            name="message"
            rows={3}
            maxLength={2000}
            required
            disabled={pending}
            placeholder="Escreva sua resposta ou dúvida…"
          />
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={pending} aria-disabled={pending}>
              {pending ? "Enviando…" : "Enviar mensagem"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
