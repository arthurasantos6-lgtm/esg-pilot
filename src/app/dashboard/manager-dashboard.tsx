import Link from "next/link";
import { BarList, MonthlyColumns } from "@/app/dashboard/charts";
import type { requireCompanyContext } from "@/lib/auth";
import {
  areaLabel,
  computeManagerMetrics,
  PERIOD_LABELS,
  periodStart,
  type ManagerFilters,
  type PeriodPreset,
} from "@/lib/dashboard-metrics";
import { IDEA_STATUS_ORDER, ideaStatusLabel } from "@/lib/idea-status";

type Supabase = Awaited<ReturnType<typeof requireCompanyContext>>["supabase"];

const dimensionNames: Record<string, string> = { E: "Ambiental", S: "Social", G: "Governança" };

function formatDays(value: number | null) {
  if (value === null) return "—";
  return value < 1 ? "menos de 1 dia" : `${value.toFixed(1).replace(".", ",")} dias`;
}

export async function ManagerDashboard({
  supabase,
  organizationId,
  period,
  filters,
  projectsEnabled,
}: {
  supabase: Supabase;
  organizationId: string;
  period: PeriodPreset;
  filters: ManagerFilters;
  projectsEnabled: boolean;
}) {
  const from = periodStart(period);
  const fromIso = from?.toISOString();

  let ideasQuery = supabase
    .from("ideas")
    .select("id, status, area, priority, created_at, submitted_at, analysis")
    .eq("organization_id", organizationId)
    .neq("status", "draft");
  let evaluationsQuery = supabase
    .from("idea_evaluations")
    .select("idea_id, result, created_at")
    .eq("organization_id", organizationId)
    .eq("status", "completed");
  let decisionsQuery = supabase
    .from("idea_decisions")
    .select("idea_id, from_status, to_status, created_at")
    .eq("organization_id", organizationId);
  if (fromIso) {
    ideasQuery = ideasQuery.gte("submitted_at", fromIso);
    evaluationsQuery = evaluationsQuery.gte("created_at", fromIso);
    decisionsQuery = decisionsQuery.gte("created_at", fromIso);
  }

  const [ideas, evaluations, decisions, projects, indicators] = await Promise.all([
    ideasQuery,
    evaluationsQuery,
    decisionsQuery,
    projectsEnabled
      ? supabase.from("esg_projects").select("id, status").eq("organization_id", organizationId)
      : Promise.resolve({ data: [], error: null }),
    projectsEnabled
      ? supabase.from("esg_indicators").select("id, target, measured").eq("organization_id", organizationId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  const failed = [ideas, evaluations, decisions, projects, indicators].find((result) => result.error);
  if (failed?.error) throw new Error(`Não foi possível carregar o painel: ${failed.error.message}`);

  const metrics = computeManagerMetrics({
    ideas: ideas.data ?? [],
    evaluations: evaluations.data ?? [],
    decisions: decisions.data ?? [],
    filters,
    periodFrom: from,
  });
  const areaOptions = [...new Set((ideas.data ?? []).map((idea) => areaLabel(idea.area)))].sort();
  const count = (...statuses: string[]) => statuses.reduce((sum, status) => sum + (metrics.byStatus[status] ?? 0), 0);
  const projectRows = projects.data ?? [];
  const indicatorRows = indicators.data ?? [];
  const filtered = Boolean(filters.status || filters.dimension || filters.area);

  return (
    <>
      <form className="filter-bar dashboard-filters" action="/dashboard" aria-label="Filtros do painel">
        <label className="filter-select">
          <span className="sr-only">Período</span>
          <select name="period" defaultValue={period}>
            {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="filter-select">
          <span className="sr-only">Situação</span>
          <select name="status" defaultValue={filters.status ?? ""}>
            <option value="">Todas as situações</option>
            {IDEA_STATUS_ORDER.filter((status) => status !== "draft").map((status) => (
              <option key={status} value={status}>{ideaStatusLabel(status)}</option>
            ))}
          </select>
        </label>
        <label className="filter-select">
          <span className="sr-only">Dimensão ESG</span>
          <select name="dimension" defaultValue={filters.dimension ?? ""}>
            <option value="">Todas as dimensões</option>
            {Object.entries(dimensionNames).map(([value, label]) => <option key={value} value={value}>{label} ({value})</option>)}
          </select>
        </label>
        <label className="filter-select">
          <span className="sr-only">Área</span>
          <select name="area" defaultValue={filters.area ?? ""}>
            <option value="">Todas as áreas</option>
            {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
          </select>
        </label>
        <button className="button button-secondary" type="submit">Aplicar</button>
        {(filtered || period !== "12m") && <Link className="text-link" href="/dashboard">Limpar filtros</Link>}
      </form>

      <section className="metric-grid" aria-label="Indicadores de ideias">
        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">◎</span>
          <p className="metric-label">Ideias recebidas</p>
          <p className="metric-value">{metrics.total}</p>
          <p className="metric-note">{PERIOD_LABELS[period].toLowerCase()}{filtered ? " · com filtros" : ""}</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-blue" aria-hidden="true">◷</span>
          <p className="metric-label">Aguardando a gestão</p>
          <p className="metric-value">{count("submitted", "in_review", "technical_review")}</p>
          <p className="metric-note">{count("awaiting_info")} aguardando o colaborador</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-yellow" aria-hidden="true">✦</span>
          <p className="metric-label">Priorizadas e aprovadas</p>
          <p className="metric-value">{count("prioritized", "approved", "in_progress", "implemented")}</p>
          <p className="metric-note">{count("implemented")} concluídas</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-violet" aria-hidden="true">⏱</span>
          <p className="metric-label">Tempo até a 1ª decisão</p>
          <p className="metric-value metric-value-text">{formatDays(metrics.avgDaysToFirstDecision.value)}</p>
          <p className="metric-note">
            média de {metrics.avgDaysToFirstDecision.count} {metrics.avgDaysToFirstDecision.count === 1 ? "ideia" : "ideias"} · até decisão final: {formatDays(metrics.avgDaysToFinalDecision.value)}
          </p>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel dimension-panel" aria-labelledby="dimension-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DISTRIBUIÇÃO</p>
              <h2 id="dimension-title">Dimensões ESG identificadas</h2>
            </div>
            <span className="subtle-tag">Indicativo</span>
          </div>
          <p className="muted small-copy">
            Uma ideia pode aparecer em mais de uma dimensão. Fonte: avaliação por IA em {metrics.sources.ai}, triagem por termos em{" "}
            {metrics.sources.keyword} e sem classificação em {metrics.sources.none} {metrics.sources.none === 1 ? "ideia" : "ideias"}.
          </p>
          <BarList
            caption="Ideias por dimensão ESG"
            total={0}
            items={(["E", "S", "G"] as const).map((dimension) => ({
              key: dimension,
              label: `${dimensionNames[dimension]} (${dimension})`,
              value: metrics.byDimension[dimension],
              barClass: `bar-${dimension.toLowerCase()}`,
            }))}
          />
          <h3 className="subsection-title">Potencial de impacto estimado</h3>
          <p className="muted small-copy">Estimativa preliminar, não impacto comprovado.</p>
          <BarList
            caption="Ideias por potencial estimado"
            total={metrics.total}
            items={[
              { key: "alto", label: "Alto", value: metrics.byPotential.alto, barClass: "bar-seq-3" },
              { key: "médio", label: "Médio", value: metrics.byPotential.médio, barClass: "bar-seq-2" },
              { key: "baixo", label: "Baixo", value: metrics.byPotential.baixo, barClass: "bar-seq-1" },
              { key: "sem", label: "Sem estimativa", value: metrics.byPotential.sem, barClass: "bar-muted" },
            ]}
          />
        </section>

        <section className="panel status-panel" aria-labelledby="status-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">FLUXO DE AVALIAÇÃO</p>
              <h2 id="status-title">Situação das ideias</h2>
            </div>
          </div>
          <BarList
            caption="Ideias por situação"
            total={metrics.total}
            items={IDEA_STATUS_ORDER.filter((status) => status !== "draft" && (metrics.byStatus[status] ?? 0) > 0).map((status) => ({
              key: status,
              label: ideaStatusLabel(status),
              value: metrics.byStatus[status] ?? 0,
            }))}
          />
          {metrics.total === 0 && <p className="empty-inline">Nenhuma ideia enviada no período.</p>}
          <Link className="text-link" href="/ideas">Abrir lista de ideias <span aria-hidden="true">→</span></Link>
        </section>
      </div>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="volume-title">
          <p className="eyebrow">EVOLUÇÃO</p>
          <h2 id="volume-title">Ideias enviadas por mês</h2>
          <MonthlyColumns data={metrics.monthly} caption="Ideias enviadas por mês" />
        </section>

        <section className="panel" aria-labelledby="area-title">
          <p className="eyebrow">ORIGEM</p>
          <h2 id="area-title">Por área e prioridade</h2>
          {metrics.byArea.length ? (
            <BarList
              caption="Ideias por área"
              total={metrics.total}
              items={metrics.byArea.slice(0, 7).map(({ area, count: value }) => ({ key: area, label: area, value }))}
            />
          ) : (
            <p className="empty-inline">Sem dados de área.</p>
          )}
          {metrics.byArea.length > 7 && <p className="small-copy muted">Mais {metrics.byArea.length - 7} áreas com menos ideias.</p>}
          <h3 className="subsection-title">Prioridade definida pela gestão</h3>
          <p className="small-copy">
            Alta: <strong>{metrics.byPriority.alta}</strong> · Média: <strong>{metrics.byPriority.media}</strong> · Baixa:{" "}
            <strong>{metrics.byPriority.baixa}</strong> · Sem prioridade: <strong>{metrics.byPriority.sem}</strong>
          </p>
        </section>
      </div>

      {projectsEnabled && (
        <section className="panel" aria-labelledby="results-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">RESULTADOS</p>
              <h2 id="results-title">Projetos e indicadores</h2>
            </div>
            <Link className="text-link" href="/projects">Abrir projetos <span aria-hidden="true">→</span></Link>
          </div>
          <p className="muted small-copy">
            Metas são definidas pela gestão; medições são resultados efetivamente registrados. Potencial estimado pela IA não
            entra nesta contagem.
          </p>
          <dl className="results-grid">
            <div><dt>Projetos em andamento</dt><dd>{projectRows.filter((project) => project.status === "in_progress").length}</dd></div>
            <div><dt>Projetos concluídos</dt><dd>{projectRows.filter((project) => project.status === "completed").length}</dd></div>
            <div><dt>Indicadores com meta definida</dt><dd>{indicatorRows.filter((indicator) => indicator.target !== null).length}</dd></div>
            <div><dt>Indicadores com medição real</dt><dd>{indicatorRows.filter((indicator) => indicator.measured !== null).length}</dd></div>
          </dl>
        </section>
      )}
    </>
  );
}
