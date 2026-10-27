"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendCopilotMessage, type CopilotFormState } from "@/app/ideas/actions";

const initialState: CopilotFormState = { error: null, sentAt: null };

export function CopilotChatForm({ ideaId, awaitingReply }: { ideaId: string; awaitingReply: boolean }) {
  const [state, formAction, pending] = useActionState(sendCopilotMessage, initialState);
  const composerRef = useRef<HTMLDivElement>(null);

  // Mantém a última mensagem e o campo de resposta à vista, como em um chat.
  useEffect(() => {
    composerRef.current?.scrollIntoView({ block: "end" });
  }, [state.sentAt, pending]);

  return (
    <div className="chat-composer" ref={composerRef}>
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
          <label htmlFor="message" className="sr-only">Sua resposta ao copiloto</label>
          <textarea
            id="message"
            name="message"
            rows={3}
            maxLength={2000}
            required
            disabled={pending}
            placeholder="Escreva sua resposta ou dúvida… (Enter envia, Shift+Enter quebra a linha)"
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <div className="form-actions">
            <button className="button button-primary" type="submit" disabled={pending} aria-disabled={pending}>
              {pending ? "Enviando…" : "Enviar"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
