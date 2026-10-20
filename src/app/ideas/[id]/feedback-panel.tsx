import { respondToInfoRequest } from "@/app/ideas/actions";
import { SubmitButton } from "@/app/components/submit-button";

export type FeedbackRow = {
  id: string;
  kind: "manager_message" | "author_response";
  content: string;
  created_at: string;
};

type FeedbackPanelProps = {
  ideaId: string;
  feedback: FeedbackRow[];
  canRespond: boolean;
  viewerIsAuthor: boolean;
};

/** Comunicação entre gestão e autor (o que o colaborador está autorizado a ver). */
export function FeedbackPanel({ ideaId, feedback, canRespond, viewerIsAuthor }: FeedbackPanelProps) {
  if (!feedback.length && !canRespond) return null;

  return (
    <section className="panel detail-panel" id="feedback" aria-labelledby="feedback-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">RETORNO DA GESTÃO</p>
          <h2 id="feedback-title">{viewerIsAuthor ? "Mensagens sobre sua ideia" : "Mensagens com o autor"}</h2>
        </div>
      </div>
      {!viewerIsAuthor && <p className="muted small-copy">O autor da ideia vê estas mensagens.</p>}

      {feedback.length > 0 && (
        <ol className="chat-log chat-log-readonly">
          {feedback.map((item) => (
            <li key={item.id} className={`chat-message ${item.kind === "manager_message" ? "chat-message-manager" : "chat-message-user"}`}>
              <span className="chat-author">
                {item.kind === "manager_message" ? "Gestão da empresa" : viewerIsAuthor ? "Você" : "Autor da ideia"}
                {" · "}
                {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(item.created_at))}
              </span>
              <p className="preserve-lines">{item.content}</p>
            </li>
          ))}
        </ol>
      )}

      {canRespond && (
        <form className="idea-form" action={respondToInfoRequest}>
          <input type="hidden" name="ideaId" value={ideaId} />
          <label htmlFor="content">Sua resposta <span aria-hidden="true">*</span></label>
          <p id="content-hint" className="field-hint">
            Ao responder, a ideia volta para avaliação da gestão e uma nova avaliação por IA é solicitada. Seu texto original não muda.
          </p>
          <textarea id="content" name="content" rows={4} minLength={2} maxLength={4000} required aria-describedby="content-hint" />
          <div className="form-actions">
            <SubmitButton pendingLabel="Enviando resposta…">Enviar resposta</SubmitButton>
          </div>
        </form>
      )}
    </section>
  );
}
