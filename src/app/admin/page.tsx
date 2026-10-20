import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Painel da plataforma" };

const orgStatusLabels: Record<string, string> = {
  trial: "Em implantação",
  active: "Ativas",
  suspended: "Suspensas",
  inactive: "Inativas",
};

const ideaStatusLabels: Record<string, string> = {
  draft: "Rascunho",
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

type DashboardStats = {
  organizations_total: number;
  organizations_by_status: Record<string, number>;
  members_total: number;
  members_by_role: Record<string, number>;
  ideas_total: number;
  ideas_by_status: Record<string, number>;
  projects_total: number;
  projects_by_status: Record<string, number>;
};

export default async function AdminDashboardPage() {
  await connection();
  const { supabase, user } = await requirePlatformAdmin();
  const { data, error } = await supabase.rpc("platform_dashboard_stats");

  if (error) {
    throw new Error(`Não foi possível carregar o painel administrativo: ${error.message}`);
  }

  const stats = (data ?? {}) as Partial<DashboardStats>;
  const orgsByStatus = stats.organizations_by_status ?? {};
  const ideasByStatus = stats.ideas_by_status ?? {};
  const pendingIdeas =
    (ideasByStatus.submitted ?? 0) +
    (ideasByStatus.in_review ?? 0) +
    (ideasByStatus.awaiting_info ?? 0) +
    (ideasByStatus.technical_review ?? 0);

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <p className="eyebrow">VISÃO DA FORNECEDORA</p>
          <h1>Painel administrativo</h1>
          <p className="muted">Indicadores operacionais agregados de todas as empresas clientes.</p>
        </div>
        <Link className="button button-primary" href="/admin/companies/new">＋ Nova empresa</Link>
      </header>

      <section className="metric-grid" aria-label="Indicadores da plataforma">
        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">🏢</span>
          <p className="metric-label">Empresas cadastradas</p>
          <p className="metric-value">{stats.organizations_total ?? 0}</p>
          <p className="metric-note">
            {orgsByStatus.active ?? 0} {orgStatusLabels.active.toLowerCase()} · {orgsByStatus.trial ?? 0} {orgStatusLabels.trial.toLowerCase()}
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-blue" aria-hidden="true">◷</span>
          <p className="metric-label">Empresas suspensas/inativas</p>
          <p className="metric-value">{(orgsByStatus.suspended ?? 0) + (orgsByStatus.inactive ?? 0)}</p>
          <p className="metric-note">requerem atenção</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-yellow" aria-hidden="true">✦</span>
          <p className="metric-label">Usuários ativos</p>
          <p className="metric-value">{stats.members_total ?? 0}</p>
          <p className="metric-note">{stats.members_by_role?.company_admin ?? 0} administradores de empresa</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-violet" aria-hidden="true">⌁</span>
          <p className="metric-label">Ideias recebidas</p>
          <p className="metric-value">{stats.ideas_total ?? 0}</p>
          <p className="metric-note">{pendingIdeas} aguardando avaliação</p>
        </article>
      </section>

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="ideas-by-status-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">SITUAÇÃO</p>
              <h2 id="ideas-by-status-title">Ideias por situação (todas as empresas)</h2>
            </div>
          </div>
          <ul className="status-list">
            {Object.entries(ideasByStatus).map(([status, total]) => (
              <li key={status}>
                <span className={`status-dot status-${status}`} aria-hidden="true" />
                <span>{ideaStatusLabels[status] ?? status}</span>
                <strong>{total}</strong>
              </li>
            ))}
            {Object.keys(ideasByStatus).length === 0 && (
              <li><span className="muted">Nenhuma ideia registrada ainda.</span></li>
            )}
          </ul>
        </section>

        <section className="panel" aria-labelledby="projects-by-status-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">PROJETOS</p>
              <h2 id="projects-by-status-title">Projetos por situação</h2>
            </div>
          </div>
          <ul className="status-list">
            {Object.entries(stats.projects_by_status ?? {}).map(([status, total]) => (
              <li key={status}>
                <span className={`status-dot status-${status}`} aria-hidden="true" />
                <span>{status}</span>
                <strong>{total}</strong>
              </li>
            ))}
            {Object.keys(stats.projects_by_status ?? {}).length === 0 && (
              <li><span className="muted">Nenhum projeto registrado ainda.</span></li>
            )}
          </ul>
          <Link className="text-link" href="/admin/companies">Gerenciar empresas <span aria-hidden="true">→</span></Link>
        </section>
      </div>

      <p className="dashboard-disclaimer">
        Estes indicadores são agregados (contagens) e não dão acesso ao conteúdo de ideias, conversas
        ou projetos de nenhuma empresa cliente. Esse conteúdo permanece restrito às equipes de cada organização.
      </p>
    </AdminShell>
  );
}
