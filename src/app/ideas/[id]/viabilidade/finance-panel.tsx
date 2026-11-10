import { saveFinance } from "@/app/ideas/planning-actions";
import { SubmitButton } from "@/app/components/submit-button";
import { analyzeFinance, formatBRL, formatNumber, SCENARIOS } from "@/lib/idea-finance";
import { VALUE_ORIGINS, type FinanceInput, type PlanReference } from "@/lib/idea-planning";

const ROWS = { investment: 6, recurring: 4, benefits: 4 };

function OriginSelect({ name, value }: { name: string; value: string | undefined }) {
  return (
    <select name={name} defaultValue={value ?? "estimado"}>
      {Object.entries(VALUE_ORIGINS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select>
  );
}

function ReferenceSelect({ name, value, references }: { name: string; value: string | null | undefined; references: PlanReference[] }) {
  return (
    <select name={name} defaultValue={value ?? ""}>
      <option value="">Sem fonte vinculada</option>
      {references.map((reference) => <option key={reference.id} value={reference.id}>{reference.title.slice(0, 60)}</option>)}
    </select>
  );
}

const amountText = (value: number | null | undefined) => (value === null || value === undefined ? "" : String(value).replace(".", ","));

/** Formulário de premissas financeiras e resultado (ROI, payback) por cenário. */
export function FinancePanel({ ideaId, finance, references }: { ideaId: string; finance: FinanceInput; references: PlanReference[] }) {
  const analysis = analyzeFinance(finance);
  const line = <T,>(items: T[], index: number) => items[index];

  return (
    <>
      <div className="recommendation-box">
        <h3 className="subsection-title">Resultado</h3>
        <div className="finance-results">
          <div className="finance-card">
            <span className="small-copy muted">Investimento inicial</span>
            <strong>{analysis.investmentTotal === null ? "—" : formatBRL(analysis.investmentTotal)}</strong>
          </div>
          <div className="finance-card">
            <span className="small-copy muted">Custos recorrentes por ano</span>
            <strong>{formatBRL(analysis.recurringAnnual)}</strong>
          </div>
          <div className="finance-card">
            <span className="small-copy muted">Período de análise</span>
            <strong>{analysis.periodYears ? `${formatNumber(analysis.periodYears)} anos` : "—"}</strong>
          </div>
        </div>
        <div className="table-wrap">
          <table className="plan-table">
            <thead>
              <tr><th>Cenário</th><th>Benefício anual</th><th>Benefício líquido anual</th><th>ROI no período</th><th>Payback</th><th>Observações</th></tr>
            </thead>
            <tbody>
              {analysis.scenarios.map((scenario) => (
                <tr key={scenario.key}>
                  <td><strong>{scenario.label}</strong></td>
                  <td>{scenario.annualBenefit === null ? "—" : formatBRL(scenario.annualBenefit)}</td>
                  <td>{scenario.netAnnual === null ? "—" : formatBRL(scenario.netAnnual)}</td>
                  <td>{scenario.roiPercent === null ? "Não calculado" : `${formatNumber(scenario.roiPercent)}%`}</td>
                  <td>{scenario.paybackYears === null ? "Não calculado" : `${formatNumber(scenario.paybackYears)} anos`}</td>
                  <td>{scenario.notes.join(" ") || "—"}</td>
                </tr>
              ))}
              {analysis.scenarios.length === 0 && (
                <tr><td colSpan={6}>Informe ao menos um benefício financeiro para calcular.</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {(analysis.missing.length > 0 || analysis.pending.length > 0) && (
          <>
            <h4 className="subsection-title">Dados que faltam para calcular o retorno</h4>
            <ul className="evaluation-list">{[...analysis.missing, ...analysis.pending].map((item) => <li key={item}>{item}</li>)}</ul>
          </>
        )}
        {analysis.memory.length > 0 && (
          <details>
            <summary className="small-copy">Memória de cálculo</summary>
            <ul className="evaluation-list small-copy">{analysis.memory.map((item) => <li key={item}>{item}</li>)}</ul>
            <p className="small-copy muted">
              ROI (%) = [(benefício líquido anual × período − investimento) / investimento] × 100. Payback = investimento / benefício
              líquido anual. Valores sem correção monetária nem taxa de desconto.
            </p>
          </details>
        )}
      </div>

      <form className="idea-form" action={saveFinance}>
        <input type="hidden" name="ideaId" value={ideaId} />

        <h3 className="subsection-title">Investimento inicial</h3>
        <p className="field-hint">Use a origem para separar valores informados, encontrados em fontes, estimados ou que ainda precisam de cotação.</p>
        <div className="finance-grid">
          {Array.from({ length: ROWS.investment }, (_, index) => {
            const item = line(finance.investment, index);
            return (
              <div key={index} className="finance-row">
                <label>Item<input name={`inv-label-${index}`} defaultValue={item?.label ?? ""} maxLength={200} /></label>
                <label>Valor (R$)<input name={`inv-amount-${index}`} inputMode="decimal" defaultValue={amountText(item?.amount)} /></label>
                <label>Origem<OriginSelect name={`inv-origin-${index}`} value={item?.origin} /></label>
                <label>Fonte<ReferenceSelect name={`inv-ref-${index}`} value={item?.referenceId} references={references} /></label>
              </div>
            );
          })}
        </div>

        <h3 className="subsection-title">Custos recorrentes (por ano)</h3>
        <div className="finance-grid">
          {Array.from({ length: ROWS.recurring }, (_, index) => {
            const item = line(finance.recurring, index);
            return (
              <div key={index} className="finance-row">
                <label>Item<input name={`rec-label-${index}`} defaultValue={item?.label ?? ""} maxLength={200} /></label>
                <label>Valor anual (R$)<input name={`rec-amount-${index}`} inputMode="decimal" defaultValue={amountText(item?.amount)} /></label>
                <label>Origem<OriginSelect name={`rec-origin-${index}`} value={item?.origin} /></label>
                <label>Fonte<ReferenceSelect name={`rec-ref-${index}`} value={item?.referenceId} references={references} /></label>
              </div>
            );
          })}
        </div>

        <h3 className="subsection-title">Economia ou receita anual, por cenário</h3>
        <p className="field-hint">Preencha os cenários que tiver base para estimar. Um cenário só é calculado se todos os benefícios tiverem valor nele.</p>
        <div className="finance-grid">
          {Array.from({ length: ROWS.benefits }, (_, index) => {
            const item = line(finance.benefits, index);
            return (
              <div key={index}>
                <div className="finance-row finance-row-benefit">
                  <label>Benefício<input name={`ben-label-${index}`} defaultValue={item?.label ?? ""} maxLength={200} /></label>
                  {SCENARIOS.map((scenario) => (
                    <label key={scenario.key}>
                      {scenario.label} (R$/ano)
                      <input
                        name={`ben-${scenario.key === "conservative" ? "c" : scenario.key === "likely" ? "l" : "o"}-${index}`}
                        inputMode="decimal"
                        defaultValue={amountText(item?.[scenario.key])}
                      />
                    </label>
                  ))}
                  <label>Origem<OriginSelect name={`ben-origin-${index}`} value={item?.origin} /></label>
                </div>
                <div className="finance-row">
                  <label>Base do cálculo<input name={`ben-basis-${index}`} defaultValue={item?.basis ?? ""} maxLength={500} /></label>
                  <label>Fonte<ReferenceSelect name={`ben-ref-${index}`} value={item?.referenceId} references={references} /></label>
                </div>
              </div>
            );
          })}
        </div>

        <label htmlFor="periodYears">Período de análise (anos)</label>
        <input id="periodYears" name="periodYears" inputMode="decimal" defaultValue={amountText(finance.periodYears)} placeholder="Ex.: 5" />

        <label htmlFor="nonFinancialBenefits">Benefícios ambientais e sociais não monetizados</label>
        <p className="field-hint">Descreva sem atribuir valor em reais, a menos que haja fundamento.</p>
        <textarea id="nonFinancialBenefits" name="nonFinancialBenefits" rows={3} maxLength={3000} defaultValue={finance.nonFinancialBenefits ?? ""} />

        <label htmlFor="assumptions">Premissas adotadas</label>
        <textarea id="assumptions" name="assumptions" rows={3} maxLength={3000} defaultValue={finance.assumptions ?? ""} placeholder="Ex.: tarifa de energia de março; sem reajuste; 250 dias de uso por ano." />

        <div className="form-actions">
          <SubmitButton className="button button-primary" pendingLabel="Calculando…">Salvar e calcular</SubmitButton>
        </div>
      </form>
    </>
  );
}
