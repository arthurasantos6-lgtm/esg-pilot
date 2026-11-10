import { saveSelection } from "@/app/ideas/planning-actions";
import { SubmitButton } from "@/app/components/submit-button";
import { COST_GROUPS, type CostGroup, type Feasibility } from "@/lib/feasibility";
import { formatBRL, formatNumber } from "@/lib/idea-finance";
import type { StoredSelection } from "@/lib/idea-planning";

const years = (value: number | null) => (value === null ? "—" : `${formatNumber(value)} ${value === 1 ? "ano" : "anos"}`);

function Range({ low, high }: { low: number | null; high: number | null }) {
  if (low === null || high === null || Math.abs(high - low) < 0.5) return null;
  return <span className="small-copy muted">de {formatBRL(Math.min(low, high))} a {formatBRL(Math.max(low, high))}</span>;
}

/** Resumo do retorno (cenário provável em destaque, faixa pelos preços encontrados). */
export function FeasibilitySummary({ feasibility }: { feasibility: Feasibility }) {
  const [conservative, likely, optimistic] = feasibility.scenarios;
  const meta = feasibility.benefitSource === "meta";
  return (
    <>
      {feasibility.hypothetical && (
        <div className="hypothesis-box">
          <p><span className="source-chip source-chip-cotacao">Cenário hipotético</span> Parte dos números abaixo é suposição do sistema, não dado real:</p>
          <ul className="evaluation-list small-copy">{feasibility.hypotheses.map((item) => <li key={item}>{item}</li>)}</ul>
        </div>
      )}
      <div className="finance-results">
        <div className="finance-card">
          <span className="small-copy muted">Investimento</span>
          <strong>{formatBRL(likely.investment)}</strong>
          <Range low={optimistic.investment} high={conservative.investment} />
        </div>
        <div className="finance-card">
          <span className="small-copy muted">Custo por ano</span>
          <strong>{formatBRL(likely.recurring)}</strong>
          <Range low={optimistic.recurring} high={conservative.recurring} />
        </div>
        <div className="finance-card">
          <span className="small-copy muted">{meta ? "Economia necessária por ano (meta)" : "Economia por ano"}</span>
          <strong>{formatBRL(likely.annualBenefit)}</strong>
          <Range low={conservative.annualBenefit} high={optimistic.annualBenefit} />
        </div>
        <div className="finance-card">
          <span className="small-copy muted">Payback</span>
          <strong>{years(likely.paybackYears)}</strong>
          {conservative.paybackYears !== null && optimistic.paybackYears !== null && (
            <span className="small-copy muted">de {formatNumber(optimistic.paybackYears)} a {formatNumber(conservative.paybackYears)} anos</span>
          )}
        </div>
        <div className="finance-card">
          <span className="small-copy muted">ROI em {formatNumber(feasibility.periodYears)} anos</span>
          <strong>{likely.roiPercent === null ? "—" : `${formatNumber(likely.roiPercent)}%`}</strong>
          {conservative.roiPercent !== null && optimistic.roiPercent !== null && (
            <span className="small-copy muted">de {formatNumber(conservative.roiPercent)}% a {formatNumber(optimistic.roiPercent)}%</span>
          )}
        </div>
      </div>
      {feasibility.missing.length > 0 && (
        <>
          <p className="small-copy"><strong>Para trocar as hipóteses por dados reais:</strong></p>
          <ul className="evaluation-list small-copy">{feasibility.missing.map((item) => <li key={item}>{item}</li>)}</ul>
        </>
      )}
      {[...new Set(feasibility.scenarios.flatMap((scenario) => scenario.notes))].map((note) => (
        <p key={note} className="small-copy muted">{note}</p>
      ))}
    </>
  );
}

/** Lista dos preços encontrados, para marcar o que entra no cálculo. */
export function FeasibilityForm({ ideaId, feasibility, stored }: { ideaId: string; feasibility: Feasibility; stored: StoredSelection | null }) {
  const { candidates } = feasibility;
  const customized = Boolean(stored);
  const groups = (Object.keys(COST_GROUPS) as CostGroup[]).filter((group) => candidates.some((item) => item.group === group));
  return (
    <form action={saveSelection} className="idea-form">
      <input type="hidden" name="ideaId" value={ideaId} />
      <input type="hidden" name="candidates" value={candidates.map((item) => item.id).join(",")} />
      <p className="small-copy muted">
        {customized ? "Seleção ajustada pela gestão." : "Seleção automática: o sistema marcou os preços plausíveis e deixou de fora parcelas e valores muito distantes dos demais."}{" "}
        Desmarque o que não corresponde à iniciativa e recalcule.
      </p>
      {groups.length === 0 && <p className="empty-inline">A pesquisa não trouxe preços em reais. Registre uma fonte com valor ou informe o investimento abaixo.</p>}
      {groups.map((group) => (
        <fieldset key={group} className="form-fieldset-reset">
          <legend className="subsection-title">
            {COST_GROUPS[group].label}
            {COST_GROUPS[group].perUnit && <span className="small-copy muted"> · preço por unidade × quantidade</span>}
          </legend>
          <div className="table-wrap">
            <table className="plan-table">
              <tbody>
                {candidates.filter((item) => item.group === group).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <input
                        type="checkbox"
                        name="selected"
                        value={item.id}
                        defaultChecked={feasibility.selectedIds.includes(item.id)}
                        aria-label={`Usar ${item.text} no cálculo`}
                      />
                    </td>
                    <td><strong>{formatBRL(item.amount)}</strong>{item.installment && <span className="source-chip source-chip-cotacao">parcela?</span>}</td>
                    <td>
                      <span className="small-copy">{item.context}</span>
                      <br />
                      <a className="text-link small-copy" href={item.url} target="_blank" rel="noopener noreferrer">{item.sourceTitle}</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </fieldset>
      ))}

      <div className="finance-row">
        <label>
          Quantidade
          <input name="quantity" inputMode="decimal" placeholder={String(feasibility.quantity.value)} defaultValue={stored?.quantity ?? ""} />
          <span className="small-copy muted">{feasibility.quantity.source}</span>
        </label>
        <label>
          Período do ROI
          <select name="periodYears" defaultValue={String(feasibility.periodYears)}>
            {[3, 5, 10, 15].map((value) => <option key={value} value={value}>{value} anos</option>)}
          </select>
        </label>
        <label>
          Economia anual (opcional, R$)
          <input name="benefitOverride" inputMode="decimal" placeholder={feasibility.benefitSource === "estimativa" ? "calculada pelas respostas" : "informe se souber"} defaultValue={stored?.benefitOverride ?? ""} />
          <span className="small-copy muted">Substitui a economia calculada.</span>
        </label>
      </div>

      {/* "Recalcular" vem primeiro no código para ser o botão do Enter; a ordem visual é invertida no CSS. */}
      <div className="form-actions form-actions-reverse">
        <SubmitButton name="intent" value="save" className="button button-primary" pendingLabel="Calculando…">Recalcular</SubmitButton>
        {customized && (
          <SubmitButton name="intent" value="reset" className="button button-secondary" pendingLabel="Restaurando…">
            Voltar à seleção automática
          </SubmitButton>
        )}
      </div>
    </form>
  );
}
