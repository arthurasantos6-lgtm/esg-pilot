import Link from "next/link";
import { recordIdeaDecision } from "@/app/ideas/actions";
import { SubmitButton } from "@/app/components/submit-button";
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
};

/** Formulário de decisão humana da gestão. Regras de fluxo validadas no banco. */
export function DecisionPanel({
  ideaId,
  status,
  transitions,
  members,
  responsibleId,
  followUpDate,
  priority,
  projectsEnabled,
}: DecisionPanelProps) {
  const activeMembers = members.filter((member) => member.status === "active");
  const responsible = members.find((member) => member.user_id === responsibleId);

  return (
    <section className="panel workflow-panel" id="decision" aria-labelledby="decision-title">
      <p className="eyebrow">DECISÃO DA GESTÃO</p>
      <h2 id="decision-title">Registrar decisão</h2>
      <p className="muted small-copy">
        Decisões são humanas e ficam no histórico com sua identificação. A recomendação da IA não altera a situação.
      </p>

      <dl className="follow-up-summary">
        <div><dt>Situação</dt><dd>{ideaStatusLabel(status)}</dd></div>
        <div><dt>Responsável</dt><dd>{responsible ? memberDisplayName(responsible) : "Não definido"}</dd></div>
        <div>
          <dt>Prazo de acompanhamento</dt>
          <dd>{followUpDate ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeZone: "UTC" }).format(new Date(followUpDate)) : "Não definido"}</dd>
        </div>
        <div><dt>Prioridade</dt><dd>{priority ? PRIORITY_LABELS[priority] : "Não definida"}</dd></div>
      </dl>

      {status === "approved" && projectsEnabled && (
        <Link className="button button-secondary button-full" href={`/projects/new?ideaId=${ideaId}`}>
          Criar projeto a partir desta ideia
        </Link>
      )}

      <form className="status-form decision-form" action={recordIdeaDecision}>
        <input type="hidden" name="ideaId" value={ideaId} />

        <label htmlFor="toStatus">Ação</label>
        <select id="toStatus" name="toStatus" defaultValue={status}>
          <option value={status}>Manter situação ({ideaStatusLabel(status)}) e atualizar acompanhamento</option>
          {transitions.filter((transition) => isDecisionOffered(transition.to_status)).map((transition) => (
            <option key={transition.to_status} value={transition.to_status}>
              {transition.action_label} → {ideaStatusLabel(transition.to_status)}
            </option>
          ))}
        </select>

        <label htmlFor="justification">Justificativa interna <span aria-hidden="true">*</span></label>
        <p id="justification-hint" className="field-hint">Visível apenas para a gestão.</p>
        <textarea id="justification" name="justification" rows={3} minLength={10} maxLength={2000} required aria-describedby="justification-hint" />

        <label htmlFor="responsibleId">Responsável pelo acompanhamento</label>
        <select id="responsibleId" name="responsibleId" defaultValue={responsibleId ?? ""}>
          <option value="">Sem responsável</option>
          {activeMembers.map((member) => (
            <option key={member.user_id} value={member.user_id}>{memberDisplayName(member)}</option>
          ))}
        </select>

        <label htmlFor="followUpDate">Prazo de acompanhamento</label>
        <input id="followUpDate" name="followUpDate" type="date" defaultValue={followUpDate ?? ""} />

        <label htmlFor="priority">Prioridade</label>
        <select id="priority" name="priority" defaultValue={priority ?? ""}>
          <option value="">Não definida</option>
          {Object.entries(PRIORITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>

        <fieldset className="module-fieldset">
          <legend>Avaliação humana (opcional)</legend>
          <p className="field-hint">Registre sua leitura quando discordar ou quiser complementar a IA. A avaliação da IA continua visível.</p>
          <label htmlFor="aiAgreement">Em relação à avaliação da IA</label>
          <select id="aiAgreement" name="aiAgreement" defaultValue="">
            <option value="">Não informar</option>
            {Object.entries(AI_AGREEMENT_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <label htmlFor="humanPotential">Potencial na avaliação da gestão</label>
          <select id="humanPotential" name="humanPotential" defaultValue="">
            <option value="">Não informar</option>
            <option value="baixo">Baixo</option>
            <option value="médio">Médio</option>
            <option value="alto">Alto</option>
          </select>
          <span className="field-label" id="human-dimensions-label">Dimensões ESG na avaliação da gestão</span>
          <div className="checkbox-group" role="group" aria-labelledby="human-dimensions-label">
            {[["E", "Ambiental"], ["S", "Social"], ["G", "Governança"]].map(([value, label]) => (
              <label key={value} className="checkbox-row">
                <input type="checkbox" name="humanDimensions" value={value} /> {label} ({value})
              </label>
            ))}
          </div>
        </fieldset>

        <SubmitButton className="button button-primary button-full" pendingLabel="Registrando…">Registrar decisão</SubmitButton>
      </form>
    </section>
  );
}
