import Link from "next/link";
import { recordIdeaDecision } from "@/app/ideas/actions";
import { SubmitButton } from "@/app/components/submit-button";
import type { ReactNode } from "react";
import { AI_AGREEMENT_LABELS, ideaStatusLabel, isDecisionOffered, PRIORITY_LABELS } from "@/lib/idea-status";
import { memberDisplayName } from "@/lib/members";

type Transition = { to_status: string; action_label: string };
type Member = { user_id: string; email: string | null; status: string };

type DecisionPanelProps = {
  ideaId: string;
  status: string;
  transitions: Transition[];
  members: Member[];
  responsibleId: string | null;
  followUpDate: string | null;
  priority: string | null;
  projectsEnabled: boolean;
  /** Título curto da ideia. */
  title: string;
  /** Seções de apoio à decisão (resumo, retorno, plano e recomendação). */
  summary: ReactNode;
};

/** O que cada ação faz, na linguagem da gestão (o fluxo é validado no banco). */
const ACTION_HINTS: Record<string, string> = {
  in_review: "Aceita a ideia e abre a avaliação da gestão.",
  technical_review: "Pede a análise de uma área técnica antes de decidir.",
  prioritized: "Coloca a ideia na fila de implantação.",
  approved: "Aprova a execução da ideia.",
  in_progress: "Registra que a implantação começou.",
  implemented: "Encerra a implantação como concluída.",
  rejected: "Não segue agora; o motivo fica no histórico.",
  archived: "Guarda a ideia fora da lista de trabalho.",
};

/** Ações que encerram ou recusam a ideia aparecem com destaque de atenção. */
const NEGATIVE = new Set(["rejected", "archived"]);
const POSITIVE = new Set(["approved", "implemented", "in_progress"]);

/**
 * Decisão da gestão em três passos: escolher a ação, dizer o porquê e, se
 * quiser, ajustar prioridade e acompanhamento. Regras de fluxo validadas no banco;
 * responsável, prazo e prioridade vêm preenchidos para não serem apagados sem querer.
 */
export function DecisionPanel({
  ideaId,
  status,
  transitions,
  members,
  responsibleId,
  followUpDate,
  priority,
  projectsEnabled,
  title,
  summary,
}: DecisionPanelProps) {
  const activeMembers = members.filter((member) => member.status === "active");
  const responsible = members.find((member) => member.user_id === responsibleId);
  const actions = transitions.filter((transition) => isDecisionOffered(transition.to_status));
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" });
  const followUp = [
    responsible && `Responsável: ${memberDisplayName(responsible)}`,
    followUpDate && `prazo ${dateFormat.format(new Date(followUpDate))}`,
  ].filter(Boolean).join(" · ");

  return (
    <section className="decision-sheet" id="decision">
      <p className="eyebrow">DECISÃO DA GESTÃO</p>
      <h2 id="decision-title">{title}</h2>
      {summary}
      <h3 className="brief-decision-title"><span>5</span> Sua decisão</h3>
      <p className="decision-current">
        <span className={`status-badge status-badge-${status}`}>{ideaStatusLabel(status)}</span>
        {priority && <span className="subtle-tag">Prioridade {PRIORITY_LABELS[priority]?.toLowerCase()}</span>}
      </p>
      {followUp && <p className="small-copy muted">{followUp}</p>}

      {status === "approved" && projectsEnabled && (
        <Link className="button button-secondary button-full" href={`/projects/new?ideaId=${ideaId}`}>
          Criar projeto a partir desta ideia
        </Link>
      )}

      <form className="status-form decision-form" action={recordIdeaDecision}>
        <input type="hidden" name="ideaId" value={ideaId} />

        <fieldset className="decision-options">
          <legend className="plan-question-label">O que você decide?</legend>
          {actions.map((transition) => {
            const tone = NEGATIVE.has(transition.to_status) ? " decision-option-negative" : POSITIVE.has(transition.to_status) ? " decision-option-positive" : "";
            return (
              <label key={transition.to_status} className={`decision-option${tone}`}>
                <input type="radio" name="toStatus" value={transition.to_status} required />
                <span>
                  <strong>{transition.action_label}</strong>
                  <span className="small-copy muted"> → {ideaStatusLabel(transition.to_status)}</span>
                  {ACTION_HINTS[transition.to_status] && <span className="decision-option-hint">{ACTION_HINTS[transition.to_status]}</span>}
                </span>
              </label>
            );
          })}
          <label className="decision-option decision-option-quiet">
            <input type="radio" name="toStatus" value={status} required />
            <span>
              Só atualizar prioridade ou acompanhamento
              <span className="decision-option-hint">A situação continua {ideaStatusLabel(status).toLowerCase()}.</span>
            </span>
          </label>
        </fieldset>

        <label htmlFor="justification">Por quê? <span aria-hidden="true">*</span></label>
        <textarea
          id="justification"
          name="justification"
          rows={2}
          minLength={10}
          maxLength={2000}
          required
          aria-describedby="justification-hint"
          placeholder="Ex.: retorno em menos de 2 anos e investimento baixo."
        />
        <p id="justification-hint" className="field-hint">Só a gestão vê. Mínimo de 10 caracteres.</p>

        <fieldset className="decision-priority">
          <legend className="plan-question-label">Prioridade</legend>
          <label className="plan-option">
            <input type="radio" name="priority" value="" defaultChecked={!priority} /> Sem
          </label>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
            <label key={value} className="plan-option">
              <input type="radio" name="priority" value={value} defaultChecked={priority === value} /> {label}
            </label>
          ))}
        </fieldset>

        <details className="decision-more">
          <summary className="small-copy">Responsável e prazo de acompanhamento</summary>
          <label htmlFor="responsibleId">Responsável</label>
          <select id="responsibleId" name="responsibleId" defaultValue={responsibleId ?? ""}>
            <option value="">Sem responsável</option>
            {activeMembers.map((member) => (
              <option key={member.user_id} value={member.user_id}>{memberDisplayName(member)}</option>
            ))}
          </select>
          <label htmlFor="followUpDate">Prazo</label>
          <input id="followUpDate" name="followUpDate" type="date" defaultValue={followUpDate ?? ""} />
        </details>

        <details className="decision-more">
          <summary className="small-copy">Sua avaliação em relação à IA (opcional)</summary>
          <label htmlFor="aiAgreement">Avaliação da IA</label>
          <select id="aiAgreement" name="aiAgreement" defaultValue="">
            <option value="">Não informar</option>
            {Object.entries(AI_AGREEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="humanPotential">Potencial, na sua avaliação</label>
          <select id="humanPotential" name="humanPotential" defaultValue="">
            <option value="">Não informar</option>
            <option value="baixo">Baixo</option>
            <option value="médio">Médio</option>
            <option value="alto">Alto</option>
          </select>
          <span className="field-label" id="human-dimensions-label">Dimensões ESG</span>
          <div className="checkbox-group" role="group" aria-labelledby="human-dimensions-label">
            {[["E", "Ambiental"], ["S", "Social"], ["G", "Governança"]].map(([value, label]) => (
              <label key={value} className="checkbox-row">
                <input type="checkbox" name="humanDimensions" value={value} /> {label}
              </label>
            ))}
          </div>
        </details>

        <SubmitButton className="button button-primary button-full" pendingLabel="Registrando…">Registrar decisão</SubmitButton>
        <p className="small-copy muted">Fica no histórico com seu nome. A recomendação da IA não muda a situação sozinha.</p>
      </form>
    </section>
  );
}
