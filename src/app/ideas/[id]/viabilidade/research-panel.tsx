import { addReference, removeReference, runMarketResearch } from "@/app/ideas/planning-actions";
import { SubmitButton } from "@/app/components/submit-button";
import { MAX_RESEARCH_RUNS, REFERENCE_CATEGORIES, type PlanReference, type ResearchData } from "@/lib/idea-planning";

// O servidor roda em UTC: as datas são mostradas no horário de Brasília.
const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
const showDate = (value: string | null) => {
  if (!value) return "Não informada";
  const date = new Date(value);
  // A data da página vem da busca em formatos variados; se não for data, mostra como veio.
  return Number.isNaN(date.getTime()) ? value : dateFormat.format(date);
};

export function ReferencesTable({ references, ideaId, editable }: { references: PlanReference[]; ideaId?: string; editable: boolean }) {
  if (!references.length) return <p className="empty-inline">Nenhuma referência registrada.</p>;
  return (
    <div className="table-wrap">
      <table className="plan-table">
        <thead>
          <tr><th>Fonte</th><th>Tipo</th><th>Valor encontrado</th><th>Publicação</th><th>Consulta</th><th>Origem</th>{editable && <th><span className="sr-only">Ações</span></th>}</tr>
        </thead>
        <tbody>
          {references.map((reference) => (
            <tr key={reference.id}>
              <td>
                <a className="text-link" href={reference.url} target="_blank" rel="noopener noreferrer">{reference.title}</a>
                {reference.summary && <p className="small-copy muted">{reference.summary}</p>}
              </td>
              <td>{REFERENCE_CATEGORIES[reference.category]}</td>
              <td>{reference.value ?? "—"}</td>
              <td>{showDate(reference.publishedAt)}</td>
              <td>{showDate(reference.consultedAt)}</td>
              <td>
                {reference.origin === "web_search" ? (
                  <span className="source-chip source-chip-ia" title="Encontrada por pesquisa automática; valor extraído por IA">Pesquisa automática</span>
                ) : (
                  <span className="source-chip source-chip-gestao">Gestão</span>
                )}
              </td>
              {editable && ideaId && (
                <td>
                  <form action={removeReference}>
                    <input type="hidden" name="ideaId" value={ideaId} />
                    <input type="hidden" name="referenceId" value={reference.id} />
                    <SubmitButton className="button button-secondary button-small" pendingLabel="…">Remover</SubmitButton>
                  </form>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Pesquisa de mercado: automática (quando configurada) e registro manual de fontes. */
export function ResearchPanel({
  ideaId,
  research,
  available,
  unavailableReason,
}: {
  ideaId: string;
  research: ResearchData | null;
  available: boolean;
  unavailableReason: string;
}) {
  const runs = research?.runs ?? 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  return (
    <>
      {available ? (
        <form action={runMarketResearch} className="inline-form">
          <input type="hidden" name="ideaId" value={ideaId} />
          <SubmitButton className="button button-primary" pendingLabel="Pesquisando… pode levar alguns minutos">
            {runs ? "Pesquisar novamente" : "Pesquisar na internet"}
          </SubmitButton>
          <span className="small-copy muted">{runs} de {MAX_RESEARCH_RUNS} pesquisas usadas nesta ideia.</span>
        </form>
      ) : (
        <p className="alert alert-info">{unavailableReason}</p>
      )}
      <p className="small-copy muted">
        A pesquisa usa a descrição, as respostas e os recursos do plano. Só são guardadas fontes que a busca realmente retornou, com
        link e data de consulta. Valores e resumos são extraídos por IA: confira na fonte antes de usar na análise financeira.
      </p>
      {research?.lastRunAt && (
        <p className="small-copy">Última pesquisa automática: {dateTimeFormat.format(new Date(research.lastRunAt))}.</p>
      )}

      <ReferencesTable references={research?.references ?? []} ideaId={ideaId} editable />

      {research && research.gaps.length > 0 && (
        <>
          <h4 className="subsection-title">Informações que faltaram na pesquisa <span className="source-chip source-chip-ia">Texto de IA</span></h4>
          <ul className="evaluation-list">{research.gaps.map((gap) => <li key={gap}>{gap}</li>)}</ul>
        </>
      )}
      {research?.notes && <p className="small-copy muted">Ressalvas da pesquisa (IA): {research.notes}</p>}

      <details className="proposal-more">
        <summary className="small-copy">Registrar uma fonte manualmente</summary>
        <form className="idea-form" action={addReference}>
          <input type="hidden" name="ideaId" value={ideaId} />
          <label htmlFor="ref-title">Título da fonte</label>
          <input id="ref-title" name="title" required minLength={3} maxLength={300} />
          <label htmlFor="ref-url">Link</label>
          <input id="ref-url" name="url" type="url" required maxLength={1000} placeholder="https://" />
          <label htmlFor="ref-category">Tipo</label>
          <select id="ref-category" name="category" defaultValue="preco_equipamento">
            {Object.entries(REFERENCE_CATEGORIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select>
          <label htmlFor="ref-value">Valor encontrado (com unidade)</label>
          <input id="ref-value" name="value" maxLength={500} placeholder="Ex.: R$ 89,90 por sensor" />
          <label htmlFor="ref-summary">Resumo</label>
          <textarea id="ref-summary" name="summary" rows={2} maxLength={1000} />
          <label htmlFor="ref-published">Data de publicação (se houver)</label>
          <input id="ref-published" name="publishedAt" maxLength={40} placeholder="Ex.: 2026-03" />
          <label htmlFor="ref-consulted">Data de consulta</label>
          <input id="ref-consulted" name="consultedAt" type="date" defaultValue={today} />
          <div className="form-actions">
            <SubmitButton className="button button-secondary" pendingLabel="Salvando…">Adicionar fonte</SubmitButton>
          </div>
        </form>
      </details>
    </>
  );
}
