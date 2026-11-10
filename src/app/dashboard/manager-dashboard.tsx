import Link from "next/link";
import { BarList, MonthlyColumns } from "@/app/dashboard/charts";
import type { requireCompanyContext } from "@/lib/auth";
import { loadCompanyProfile } from "@/lib/company-profile";
import {
  areaLabel,
  computeManagerMetrics,
  daysSince,
  PERIOD_LABELS,
  periodStart,
  type ManagerFilters,
  type PeriodPreset,
} from "@/lib/dashboard-metrics";
import { computeFeasibility } from "@/lib/feasibility";
import { formatBRL, formatNumber } from "@/lib/idea-finance";
import { detectInitiativeType, emptyPlan, parsePlan } from "@/lib/idea-planning";
import { parseStoredProposal } from "@/lib/idea-proposal";
import { IDEA_STATUS_ORDER, ideaStatusLabel } from "@/lib/idea-status";
import { readLocalAnalysis } from "@/lib/local-analysis";

type Supabase = Awaited<ReturnType<typeof requireCompanyContext>>["supabase"];

const dimensionNames: Record<string, string> = { E: "Ambiental", S: "Social", G: "Governança" };
const WAITING = ["submitted", "in_review", "technical_review"];
const PORTFOLIO = ["prioritized", "approved", "in_progress"];
const FUNNEL = [
  { status: "submitted", label: "Enviadas" },
  { status: "in_review", label: "Em avaliação" },
  { status: "technical_review", label: "Avaliação técnica" },
  { status: "prioritized", label: "Priorizadas" },
  { status: "approved", label: "Aprovadas" },
  { status: "in_progress", label: "Em implementação" },
  { status: "implemented", label: "Concluídas" },
] as const;

function formatDays(value: number | null) {
  if (value === null) return "—";
  return value < 1 ? "menos de 1 dia" : `${value.toFixed(1).replace(".", ",")} dias`;
}

const compactBRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", maximumFractionDigits: 1 });

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
    .select("id, title, author_name, status, area, priority, created_at, submitted_at, analysis, original_description, structured_proposal")
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

  const [ideas, evaluations, decisions, projects, indicators, profile] = await Promise.all([
    ideasQuery,
    evaluationsQuery,
    decisionsQuery,
    projectsEnabled
      ? supabase.from("esg_projects").select("id, status").eq("organization_id", organizationId)
      : Promise.resolve({ data: [], error: null }),
    projectsEnabled
      ? supabase.from("esg_indicators").select("id, target, measured").eq("organization_id", organizationId)
      : Promise.resolve({ data: [], error: null }),
    loadCompanyProfile(supabase, organizationId),
  ]);
  const failed = [ideas, evaluations, decisions, projects, indicators].find((result) => result.error);
  if (failed?.error) throw new Error(`Não foi possível carregar o painel: ${failed.error.message}`);

  const ideaRows = ideas.data ?? [];
  const metrics = computeManagerMetrics({
    ideas: ideaRows,
    evaluations: evaluations.data ?? [],
    decisions: decisions.data ?? [],
    filters,
    periodFrom: from,
  });
  const areaOptions = [...new Set(ideaRows.map((idea) => areaLabel(idea.area)))].sort();
  const count = (...statuses: string[]) => statuses.reduce((sum, status) => sum + (metrics.byStatus[status] ?? 0), 0);
  const projectRows = projects.data ?? [];
  const indicatorRows = indicators.data ?? [];
  const filtered = Boolean(filters.status || filters.dimension || filters.area);

  // Retorno estimado de cada ideia (cenário provável), com o mesmo cálculo da viabilidade.
  const withReturn = ideaRows.map((idea) => {
    const plan =
      parsePlan(parseStoredProposal(idea.structured_proposal)?.plan) ??
      emptyPlan(detectInitiativeType(`${idea.title} ${idea.original_description ?? ""}`));
    const feasibility = computeFeasibility(plan, plan.research?.references ?? [], plan.selection ?? {}, profile);
    // "meta" é a economia necessária para um payback-alvo, não uma estimativa: fica fora das somas e do ranking.
    return { idea, likely: feasibility.scenarios[1], hypothetical: feasibility.hypothetical, estimated: feasibility.benefitSource !== "meta" };
  });
  const portfolio = withReturn.filter(({ idea }) => PORTFOLIO.includes(idea.status));
  const estimatedPortfolio = portfolio.filter((item) => item.estimated);
  const portfolioInvestment = portfolio.reduce((sum, item) => sum + item.likely.investment, 0);
  const portfolioSavings = estimatedPortfolio.reduce((sum, item) => sum + Math.max(0, item.likely.netAnnual), 0);
  const estimatedInvestment = estimatedPortfolio.reduce((sum, item) => sum + item.likely.investment, 0);
  const portfolioPayback = portfolioSavings > 0 ? estimatedInvestment / portfolioSavings : null;
  const hypotheticalCount = portfolio.filter((item) => item.hypothetical).length;
  const withoutEstimate = portfolio.length - estimatedPortfolio.length;
  const topReturns = withReturn
    .filter(({ idea, likely, estimated }) => estimated && idea.status !== "rejected" && idea.status !== "archived" && likely.roiPercent !== null)
    .sort((a, b) => (b.likely.roiPercent ?? 0) - (a.likely.roiPercent ?? 0))
    .slice(0, 3);

  // Fila de decisão: as que esperam há mais tempo primeiro.
  const waiting = ideaRows
    .filter((idea) => WAITING.includes(idea.status))
    .map((idea) => ({
      idea,
      days: daysSince(idea.submitted_at ?? idea.created_at),
      score: readLocalAnalysis(idea.analysis)?.assessment.partial_score ?? null,
    }))
    .sort((a, b) => b.days - a.days);

  const periodUrl = (value: PeriodPreset) => {
    const params = new URLSearchParams();
    if (value !== "12m") params.set("period", value);
    if (filters.status) params.set("status", filters.status);
    if (filters.dimension) params.set("dimension", filters.dimension);
    if (filters.area) params.set("area", filters.area);
    const query = params.toString();
    return query ? `/dashboard?${query}` : "/dashboard";
  };
  const funnelMax = Math.max(1, ...FUNNEL.map(({ status }) => metrics.byStatus[status] ?? 0));

  return (
    <>
      <div className="dash-toolbar">
        <nav className="segmented" aria-label="Período">
          {(Object.keys(PERIOD_LABELS) as PeriodPreset[]).map((value) => (
            <Link key={value} href={periodUrl(value)} aria-current={period === value ? "page" : undefined}>
              {{ "30d": "30 dias", "90d": "90 dias", "12m": "12 meses", all: "Tudo" }[value]}
            </Link>
          ))}
        </nav>
        <details className="dash-filters" open={filtered}>
          <summary>
            Mais filtros{filtered ? <span className="dash-filter-count"> · ativos</span> : null}
          </summary>
          <form className="filter-bar dashboard-filters" action="/dashboard" aria-label="Filtros do painel">
            {period !== "12m" && <input type="hidden" name="period" value={period} />}
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
                {Object.entries(dimensionNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="filter-select">
              <span className="sr-only">Área</span>
              <select name="area" defaultValue={filters.area ?? ""}>
                <option value="">Todas as áreas</option>
                {areaOptions.map((area) => <option key={area} value={area}>{area}</option>)}
              </select>
            </label>
            <button className="button button-secondary button-small" type="submit">Aplicar</button>
            {filtered && <Link className="text-link small-copy" href={period === "12m" ? "/dashboard" : `/dashboard?period=${period}`}>Limpar</Link>}
          </form>
        </details>
      </div>

      <section className="kpi-cards" aria-label="Indicadores principais">
        <Link className="kpi-card" href="/ideas">
          <span className="kpi-card-label">Ideias recebidas</span>
          <strong className="kpi-card-value">{metrics.total}</strong>
          <span className="kpi-card-note">{PERIOD_LABELS[period].toLowerCase()}{filtered ? " · com filtros" : ""}</span>
        </Link>
        <a className={`kpi-card${waiting.length ? " kpi-card-alert" : ""}`} href="#atencao">
          <span className="kpi-card-label">Aguardando você</span>
          <strong className="kpi-card-value">{count(...WAITING)}</strong>
          <span className="kpi-card-note">{waiting[0] ? `a mais antiga há ${waiting[0].days} ${waiting[0].days === 1 ? "dia" : "dias"}` : "nenhuma na fila"}</span>
        </a>
        <Link className="kpi-card" href="/ideas?status=approved">
          <span className="kpi-card-label">Priorizadas e aprovadas</span>
          <strong className="kpi-card-value">{count(...PORTFOLIO)}</strong>
          <span className="kpi-card-note">{count("implemented")} {count("implemented") === 1 ? "concluída" : "concluídas"}</span>
        </Link>
        <a className="kpi-card kpi-card-highlight" href="#retorno">
          <span className="kpi-card-label">Economia potencial/ano</span>
          <strong className="kpi-card-value">{portfolioSavings > 0 ? compactBRL.format(portfolioSavings) : "—"}</strong>
          <span className="kpi-card-note">
            {portfolioSavings > 0
              ? `ideias priorizadas e aprovadas${hypotheticalCount ? " · inclui hipóteses" : ""}`
              : "ainda sem economia estimada nas ideias aprovadas"}
          </span>
        </a>
        <div className="kpi-card kpi-card-static">
          <span className="kpi-card-label">Tempo até a 1ª decisão</span>
          <strong className="kpi-card-value kpi-card-value-text">{formatDays(metrics.avgDaysToFirstDecision.value)}</strong>
          <span className="kpi-card-note">até a decisão final: {formatDays(metrics.avgDaysToFinalDecision.value)}</span>
        </div>
      </section>

      <div className="dash-grid">
        <section className="panel" id="atencao" aria-labelledby="attention-title">
          <div className="panel-heading">
            <div>
              <h2 id="attention-title">Precisa da sua atenção</h2>
              <p className="small-copy muted">Ideias aguardando decisão, das mais antigas para as mais novas.</p>
            </div>
            {waiting.length > 0 && <span className="count-badge">{waiting.length}</span>}
          </div>
          {waiting.length ? (
            <ul className="attention-list">
              {waiting.slice(0, 6).map(({ idea, days, score }) => (
                <li key={idea.id}>
                  <Link className="attention-item" href={`/ideas/${idea.id}`}>
                    <span className="attention-main">
                      <strong>{idea.title}</strong>
                      <span className="small-copy muted">
                        {idea.author_name ?? "Colaborador"}{idea.area ? ` · ${idea.area}` : ""} · {ideaStatusLabel(idea.status)}
                      </span>
                    </span>
                    <span className="attention-meta">
                      {score !== null && <span className="subtle-tag">Potencial {Math.round(score)}</span>}
                      <span className={`wait-chip${days >= 7 ? " wait-chip-late" : ""}`}>{days === 0 ? "hoje" : `${days} ${days === 1 ? "dia" : "dias"}`}</span>
                      <span className="attention-go" aria-hidden="true">→</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty-inline">Tudo em dia: nenhuma ideia aguardando decisão.</p>
          )}
          {waiting.length > 6 && <Link className="text-link small-copy" href="/ideas">Ver todas as {waiting.length} ideias na fila →</Link>}
        </section>

        <section className="panel" aria-labelledby="funnel-title">
          <h2 id="funnel-title">Funil de avaliação</h2>
          <p className="small-copy muted">Clique em uma etapa para ver as ideias.</p>
          <ol className="funnel">
            {FUNNEL.map(({ status, label }) => {
              const value = metrics.byStatus[status] ?? 0;
              return (
                <li key={status}>
                  <Link href={`/ideas?status=${status}`} className={value ? "" : "funnel-empty"}>
                    <span className="funnel-label">{label}</span>
                    <span className="funnel-track" aria-hidden="true"><span style={{ width: `${(value / funnelMax) * 100}%` }} /></span>
                    <strong>{value}</strong>
                  </Link>
                </li>
              );
            })}
          </ol>
          {count("rejected", "archived") > 0 && (
            <p className="small-copy muted">
              <Link className="text-link" href="/ideas?status=rejected">{count("rejected")} não {count("rejected") === 1 ? "priorizada" : "priorizadas"}</Link>
              {count("archived") ? ` · ${count("archived")} ${count("archived") === 1 ? "arquivada" : "arquivadas"}` : ""}
            </p>
          )}
        </section>
      </div>

      <section className="panel" id="retorno" aria-labelledby="return-title">
        <div className="panel-heading">
          <div>
            <h2 id="return-title">Retorno estimado</h2>
            <p className="small-copy muted">
              Soma das ideias priorizadas, aprovadas e em implementação (cenário provável).
              {hypotheticalCount > 0 && ` ${hypotheticalCount} de ${portfolio.length} usam cenário hipotético por falta de dados.`}
              {withoutEstimate > 0 && ` ${withoutEstimate} sem economia estimada ficam fora da economia e do payback.`}
            </p>
          </div>
        </div>
        <div className="return-grid">
          <div className="return-figures">
            <div><span className="kpi-card-label">Investimento previsto</span><strong>{formatBRL(portfolioInvestment)}</strong></div>
            <div><span className="kpi-card-label">Economia líquida por ano</span><strong>{formatBRL(portfolioSavings)}</strong></div>
            <div><span className="kpi-card-label">Payback da carteira</span><strong>{portfolioPayback === null ? "—" : `${formatNumber(portfolioPayback)} anos`}</strong></div>
          </div>
          <div>
            <h3 className="subsection-title">Maior retorno estimado</h3>
            {topReturns.length ? (
              <ol className="top-list">
                {topReturns.map(({ idea, likely, hypothetical }) => (
                  <li key={idea.id}>
                    <Link href={`/ideas/${idea.id}/viabilidade`}>
                      <span>{idea.title}</span>
                      <strong>
                        ROI {formatNumber(likely.roiPercent ?? 0)}%
                        {likely.paybackYears !== null && <span className="small-copy muted"> · {formatNumber(likely.paybackYears)} anos</span>}
                      </strong>
                    </Link>
                    {hypothetical && <span className="small-copy muted">cenário hipotético</span>}
                  </li>
                ))}
              </ol>
            ) : (
              <p className="empty-inline">Ainda não há ideias com economia estimada. Complete as respostas ou informe a economia na viabilidade.</p>
            )}
          </div>
        </div>
      </section>

      <div className="dash-grid dash-grid-3">
        <section className="panel" aria-labelledby="dimension-title">
          <h2 id="dimension-title">Dimensões ESG</h2>
          <BarList
            caption="Ideias por dimensão ESG"
            total={0}
            items={(["E", "S", "G"] as const).map((dimension) => ({
              key: dimension,
              label: dimensionNames[dimension],
              value: metrics.byDimension[dimension],
              barClass: `bar-${dimension.toLowerCase()}`,
            }))}
          />
          <p className="small-copy muted">Uma ideia pode estar em mais de uma dimensão. Classificação indicativa.</p>
        </section>

        <section className="panel" aria-labelledby="potential-title">
          <h2 id="potential-title">Potencial de impacto</h2>
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
          <p className="small-copy muted">Estimativa preliminar, não impacto comprovado.</p>
        </section>

        <section className="panel" aria-labelledby="area-title">
          <h2 id="area-title">Por área</h2>
          {metrics.byArea.length ? (
            <BarList
              caption="Ideias por área"
              total={metrics.total}
              items={metrics.byArea.slice(0, 5).map(({ area, count: value }) => ({ key: area, label: area, value }))}
            />
          ) : (
            <p className="empty-inline">Sem dados de área.</p>
          )}
          <p className="small-copy muted">
            Prioridade: alta {metrics.byPriority.alta} · média {metrics.byPriority.media} · baixa {metrics.byPriority.baixa}
          </p>
        </section>
      </div>

      <section className="panel" aria-labelledby="volume-title">
        <h2 id="volume-title">Ideias enviadas por mês</h2>
        <MonthlyColumns data={metrics.monthly} caption="Ideias enviadas por mês" />
      </section>

      {projectsEnabled && (
        <section className="panel" aria-labelledby="results-title">
          <div className="panel-heading">
            <h2 id="results-title">Projetos e indicadores</h2>
            <Link className="text-link" href="/projects">Abrir projetos <span aria-hidden="true">→</span></Link>
          </div>
          <dl className="results-grid">
            <div><dt>Projetos em andamento</dt><dd>{projectRows.filter((project) => project.status === "in_progress").length}</dd></div>
            <div><dt>Projetos concluídos</dt><dd>{projectRows.filter((project) => project.status === "completed").length}</dd></div>
            <div><dt>Indicadores com meta</dt><dd>{indicatorRows.filter((indicator) => indicator.target !== null).length}</dd></div>
            <div><dt>Indicadores medidos</dt><dd>{indicatorRows.filter((indicator) => indicator.measured !== null).length}</dd></div>
          </dl>
          <p className="small-copy muted">Metas são definidas pela gestão; medições são resultados efetivamente registrados.</p>
        </section>
      )}
    </>
  );
}
