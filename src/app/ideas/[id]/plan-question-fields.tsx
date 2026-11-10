import { answerOptions, NOT_KNOWN, TO_EVALUATE, type IdeaPlan, type PlanQuestion } from "@/lib/idea-planning";
import type { StoredProposal } from "@/lib/idea-proposal";

/** Lista das perguntas exibidas: o servidor só altera as respostas destas. */
export function ShownQuestionsInput({ questions }: { questions: PlanQuestion[] }) {
  return <input type="hidden" name="shown" value={questions.map((question) => question.id).join(",")} />;
}

function StatusSelect({ question, status }: { question: PlanQuestion; status: string | undefined }) {
  return (
    <label className="plan-mark">
      Ou marque:
      <select name={`status:${question.id}`} defaultValue={status === "unknown" || status === "to_evaluate" ? status : ""}>
        <option value="">—</option>
        <option value="unknown">{NOT_KNOWN}</option>
        <option value="to_evaluate">{TO_EVALUATE}</option>
      </select>
    </label>
  );
}

/**
 * Campos das perguntas de planejamento. Respostas já salvas aparecem preenchidas;
 * sem resposta, campos ligados à proposta mostram o texto da própria pessoa.
 */
export function PlanQuestionFields({
  questions,
  plan,
  proposal,
  highlightUnanswered = false,
}: {
  questions: PlanQuestion[];
  plan: IdeaPlan;
  proposal: StoredProposal | null;
  highlightUnanswered?: boolean;
}) {
  return (
    <>
      {questions.map((question) => {
        const answer = plan.answers[question.id];
        const prefill = !answer && question.prefillFrom ? proposal?.[question.prefillFrom] ?? null : null;
        const value = answer?.status === "answered" ? answer.value ?? "" : prefill ?? "";
        const inputId = `q-${question.id}`;
        const hintId = `${inputId}-hint`;
        const isNew = highlightUnanswered && !answer;
        return (
          <div key={question.id} className={`plan-question${isNew ? " plan-question-new" : ""}`}>
            {question.kind === "choice" || question.kind === "multi" ? (
              <fieldset className="plan-options" aria-describedby={question.hint ? hintId : undefined}>
                <legend className="plan-question-label">
                  {question.text}
                  {answer?.by === "management" && <span className="source-chip source-chip-gestao">Gestão</span>}
                </legend>
                {(question.hint || question.kind === "multi") && (
                  <p id={hintId} className="field-hint">{question.hint ?? "Pode marcar mais de uma opção."}</p>
                )}
                {[...(question.options ?? []), NOT_KNOWN, TO_EVALUATE].map((option) => {
                  const checked =
                    (answer?.status === "answered" && answerOptions(answer.value).includes(option)) ||
                    (answer?.status === "unknown" && option === NOT_KNOWN) ||
                    (answer?.status === "to_evaluate" && option === TO_EVALUATE);
                  const muted = option === NOT_KNOWN || option === TO_EVALUATE;
                  return (
                    <label key={option} className={`plan-option${muted ? " plan-option-muted" : ""}`}>
                      <input
                        type={question.kind === "multi" ? "checkbox" : "radio"}
                        name={`answer:${question.id}`}
                        value={option}
                        defaultChecked={checked}
                      />
                      {option}
                    </label>
                  );
                })}
              </fieldset>
            ) : (
              <>
                <label className="plan-question-label" htmlFor={inputId}>
                  {question.text}
                  {answer?.by === "management" && <span className="source-chip source-chip-gestao">Gestão</span>}
                </label>
                {(question.hint || prefill) && (
                  <p id={hintId} className="field-hint">
                    {question.hint}
                    {prefill ? `${question.hint ? " " : ""}Trouxemos o que você já escreveu; ajuste se quiser.` : ""}
                  </p>
                )}
                {question.kind === "number" ? (
                  <div className="plan-number">
                    <input
                      id={inputId}
                      name={`answer:${question.id}`}
                      type="text"
                      inputMode="decimal"
                      maxLength={30}
                      defaultValue={value}
                      aria-describedby={question.hint ? hintId : undefined}
                      placeholder="Ex.: 12"
                    />
                    {question.unit && <span className="plan-unit">{question.unit}</span>}
                  </div>
                ) : (
                  <textarea
                    id={inputId}
                    name={`answer:${question.id}`}
                    rows={2}
                    maxLength={1500}
                    defaultValue={value}
                    aria-describedby={question.hint || prefill ? hintId : undefined}
                  />
                )}
                <StatusSelect question={question} status={answer?.status} />
              </>
            )}
          </div>
        );
      })}
    </>
  );
}
