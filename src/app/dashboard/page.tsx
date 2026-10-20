import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/app/components/app-shell";
import { parseEnabledModules, requireCompanyContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Visão geral" };

const statusLabels: Record<string, string> = {
  submitted: "Enviadas",
  in_review: "Em análise",
  awaiting_info: "Aguardando informações",
  technical_review: "Avaliação técnica",
  approved: "Aprovadas",
  in_progress: "Em implementação",
  implemented: "Implementadas",
  rejected: "Rejeitadas",
  archived: "Arquivadas",
};

const dimensionNames: Record<string, string> = {
  E: "Ambiental",
  S: "Social",
  G: "Governança",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ moduleDisabled?: string }>;
}) {
  await connection();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  const { moduleDisabled } = await searchParams;
  const [
    { data: ideas, error },
    { data: projects, error: projectsError },
  ] = await Promise.all([
    supabase
      .from("ideas")
      .select("id, title, status, created_at, analysis")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    supabase
      .from("esg_projects")
      .select("id, status")
      .eq("organization_id", membership.organization_id),
  ]);

  if (error) {
    throw new Error(`Não foi possível carregar o painel: ${error.message}`);
  }
  if (projectsError) {
    throw new Error(`Não foi possível carregar os projetos: ${projectsError.message}`);
  }

  const rows = ideas ?? [];
  const countStatus = (statuses: string[]) =>
    rows.filter((idea) => statuses.includes(idea.status)).length;
  const dimensionCounts = { E: 0, S: 0, G: 0 };
  for (const idea of rows) {
    const analysis = idea.analysis;
    if (
      analysis &&
      typeof analysis === "object" &&
      "dimensions" in analysis &&
      Array.isArray(analysis.dimensions)
    ) {
      for (const item of analysis.dimensions) {
        if (
          item &&
          typeof item === "object" &&
          "dimension" in item &&
          typeof item.dimension === "string" &&
          item.dimension in dimensionCounts
        ) {
          dimensionCounts[item.dimension as keyof typeof dimensionCounts] += 1;
        }
      }
    }
  }
  const maxDimensionCount = Math.max(1, ...Object.values(dimensionCounts));
  const recentIdeas = rows.slice(0, 5);

  return (
    <AppShell
      organizationName={organization.name}
      userEmail={user.email ?? "Conta"}
      role={membership.role}
      enabledModules={parseEnabledModules(organization.enabled_modules)}
    >
      <header className="page-header">
        <div>
          <p className="eyebrow">PAINEL DA ORGANIZAÇÃO</p>
          <h1>Visão geral</h1>
          <p className="muted">Acompanhe as ideias e os próximos passos ESG da sua equipe.</p>
        </div>
        <Link className="button button-primary" href="/ideas/new">＋ Registrar ideia</Link>
      </header>

      {moduleDisabled && (
        <p className="alert alert-error" role="alert">
          O módulo &quot;{moduleDisabled}&quot; não está habilitado para a sua organização. Fale com o administrador da plataforma.
        </p>
      )}

      <section className="metric-grid" aria-label="Indicadores de ideias">
        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">◎</span>
          <p className="metric-label">Ideias cadastradas</p>
          <p className="metric-value">{rows.length}</p>
          <p className="metric-note">visíveis para sua organização</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-blue" aria-hidden="true">◷</span>
          <p className="metric-label">Em avaliação</p>
          <p className="metric-value">{countStatus(["submitted", "in_review", "awaiting_info", "technical_review"])}</p>
          <p className="metric-note">aguardando encaminhamento</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-yellow" aria-hidden="true">✦</span>
          <p className="metric-label">Aprovadas</p>
          <p className="metric-value">{countStatus(["approved", "in_progress", "implemented"])}</p>
          <p className="metric-note">aprovadas ou em execução</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-violet" aria-hidden="true">⌁</span>
          <p className="metric-label">Com triagem ESG</p>
          <p className="metric-value">{rows.filter((idea) => idea.analysis !== null).length}</p>
          <p className="metric-note">análise indicativa registrada</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-blue" aria-hidden="true">↗</span>
          <p className="metric-label">Projetos em andamento</p>
          <p className="metric-value">{(projects ?? []).filter((project) => project.status === "in_progress").length}</p>
          <p className="metric-note">de {projects?.length ?? 0} projetos</p>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel dimension-panel" aria-labelledby="dimension-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">DISTRIBUIÇÃO</p>
              <h2 id="dimension-title">Dimensões ESG identificadas</h2>
            </div>
            <span className="subtle-tag">Triagem indicativa</span>
          </div>
          <p className="muted small-copy">
            Contagem das dimensões encontradas nas ideias analisadas. Uma ideia pode aparecer em mais de uma dimensão.
          </p>
          <div className="dimension-bars">
            {(["E", "S", "G"] as const).map((dimension) => (
              <div className="dimension-row" key={dimension}>
                <div className="dimension-label">
                  <span className={`dimension-pill dimension-${dimension.toLowerCase()}`}>{dimension}</span>
                  <span>{dimensionNames[dimension]}</span>
                  <strong>{dimensionCounts[dimension]}</strong>
                </div>
                <div
                  className="bar-track"
                  role="img"
                  aria-label={`${dimensionNames[dimension]}: ${dimensionCounts[dimension]} ideias`}
                >
                  <span
                    className={`bar-fill bar-${dimension.toLowerCase()}`}
                    style={{ width: `${(dimensionCounts[dimension] / maxDimensionCount) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel status-panel" aria-labelledby="status-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ACOMPANHAMENTO</p>
              <h2 id="status-title">Situação das ideias</h2>
            </div>
          </div>
          <ul className="status-list">
            {[
              ["submitted", "Enviadas"],
              ["in_review", "Em análise"],
              ["in_progress", "Em implementação"],
              ["implemented", "Implementadas"],
              ["rejected", "Rejeitadas"],
            ].map(([status, label]) => (
              <li key={status}>
                <span className={`status-dot status-${status}`} aria-hidden="true" />
                <span>{label}</span>
                <strong>{countStatus([status])}</strong>
              </li>
            ))}
          </ul>
          <Link className="text-link" href="/ideas">Ver todas as ideias <span aria-hidden="true">→</span></Link>
        </section>
      </div>

      <section className="panel recent-panel" aria-labelledby="recent-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">ATIVIDADE RECENTE</p>
            <h2 id="recent-title">Últimas ideias</h2>
          </div>
          <Link className="text-link" href="/ideas">Abrir lista <span aria-hidden="true">→</span></Link>
        </div>
        {recentIdeas.length === 0 ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">✳</span>
            <h3>Sua próxima ideia pode começar aqui</h3>
            <p className="muted">Compartilhe uma oportunidade de melhoria e convide sua equipe a desenvolvê-la.</p>
            <Link className="button button-secondary" href="/ideas/new">Registrar primeira ideia</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th scope="col">Ideia</th><th scope="col">Situação</th><th scope="col">Data de envio</th><th scope="col"><span className="sr-only">Abrir ideia</span></th></tr>
              </thead>
              <tbody>
                {recentIdeas.map((idea) => (
                  <tr key={idea.id}>
                    <td><Link className="idea-title-link" href={`/ideas/${idea.id}`}>{idea.title}</Link></td>
                    <td><span className={`status-badge status-badge-${idea.status}`}>{statusLabels[idea.status] ?? idea.status}</span></td>
                    <td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(idea.created_at))}</td>
                    <td><Link className="row-link" href={`/ideas/${idea.id}`} aria-label={`Abrir ${idea.title}`}>→</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="dashboard-disclaimer">
        Indicadores derivados das ideias registradas. Impactos estimados não representam resultados medidos ou comprovados.
      </p>
    </AppShell>
  );
}
