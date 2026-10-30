import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { BarList } from "@/app/dashboard/charts";
import { isExternalAiEnabled } from "@/lib/ai/config";
import { getAiConfig } from "@/lib/ai/service";
import { requirePlatformAdmin } from "@/lib/auth";
import { PERIOD_LABELS, parsePeriod, periodStart } from "@/lib/dashboard-metrics";
import { IDEA_STATUS_ORDER, ideaStatusLabel } from "@/lib/idea-status";

export const metadata: Metadata = { title: "Painel da plataforma" };

const orgStatusLabels: Record<string, string> = {
  trial: "Em implantação",
  active: "Ativa",
  suspended: "Suspensa",
  inactive: "Inativa",
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

const numberFormat = new Intl.NumberFormat("pt-BR");

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; orgStatus?: string; org?: string }>;
}) {
  await connection();
  const { supabase, user } = await requirePlatformAdmin();
  const query = await searchParams;
  const period = parsePeriod(query.period);
  const from = periodStart(period);

  const [{ data, error }, { data: usage, error: usageError }] = await Promise.all([
    supabase.rpc("platform_dashboard_stats"),
    supabase.rpc("platform_usage_overview", { p_from: from?.toISOString() ?? null }),
  ]);
  if (error) throw new Error(`Não foi possível carregar o painel administrativo: ${error.message}`);
  if (usageError) throw new Error(`Não foi possível carregar o uso da plataforma: ${usageError.message}`);

  const stats = (data ?? {}) as Partial<DashboardStats>;
  const orgsByStatus = stats.organizations_by_status ?? {};
  const ideasByStatus = stats.ideas_by_status ?? {};
  const allRows = usage ?? [];
  const rows = allRows.filter(
    (row) => (!query.orgStatus || row.organization_status === query.orgStatus) && (!query.org || row.organization_id === query.org),
  );
  const sum = (key: keyof (typeof rows)[number]) => rows.reduce((total, row) => total + Number(row[key] ?? 0), 0);
  const filtered = Boolean(query.orgStatus || query.org);

  // Com a IA externa desligada (padrão), a falta de provedor não é um problema.
  const externalAi = isExternalAiEnabled(process.env);
  const aiConfigured = Boolean(getAiConfig());
  const serviceRoleConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const failed = sum("evaluations_failed");
  const stale = sum("evaluations_stale");
  const alerts = [
    externalAi && !aiConfigured && "Nenhum provedor de IA configurado: o copiloto e a avaliação por IA estão indisponíveis para todas as empresas.",
    externalAi && aiConfigured && !serviceRoleConfigured && "SUPABASE_SERVICE_ROLE_KEY ausente: a IA está configurada, mas não consegue gravar respostas e avaliações.",
    failed > 0 && `${failed} ${failed === 1 ? "avaliação por IA falhou" : "avaliações por IA falharam"} no período. As ideias foram preservadas e podem ser reprocessadas pelas empresas.`,
    stale > 0 && `${stale} ${stale === 1 ? "avaliação está pendente" : "avaliações estão pendentes"} há mais de 10 minutos (processamento interrompido).`,
  ].filter((alert): alert is string => Boolean(alert));

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

      <section className="panel" aria-labelledby="alerts-title">
        <p className="eyebrow">ALERTAS OPERACIONAIS</p>
        <h2 id="alerts-title">Situação do processamento</h2>
        {alerts.length ? (
          <ul className="alert-list">
            {alerts.map((alert) => (
              <li key={alert} className="alert alert-error"><span aria-hidden="true">⚠ </span>{alert}</li>
            ))}
          </ul>
        ) : (
          <p className="alert alert-success"><span aria-hidden="true">✓ </span>Nenhum alerta no período selecionado.</p>
        )}
      </section>

      <section className="metric-grid" aria-label="Indicadores gerais da plataforma">
        <article className="metric-card">
          <span className="metric-icon" aria-hidden="true">🏢</span>
          <p className="metric-label">Empresas cadastradas</p>
          <p className="metric-value">{stats.organizations_total ?? 0}</p>
          <p className="metric-note">
            {orgsByStatus.active ?? 0} ativas · {orgsByStatus.trial ?? 0} em implantação · {(orgsByStatus.suspended ?? 0) + (orgsByStatus.inactive ?? 0)} suspensas/inativas
          </p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-yellow" aria-hidden="true">✦</span>
          <p className="metric-label">Usuários ativos</p>
          <p className="metric-value">{stats.members_total ?? 0}</p>
          <p className="metric-note">{stats.members_by_role?.company_admin ?? 0} na gestão · {sum("collaborators_via_link")} por link{filtered ? " (filtro)" : ""}</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-violet" aria-hidden="true">⌁</span>
          <p className="metric-label">Ideias recebidas (total)</p>
          <p className="metric-value">{stats.ideas_total ?? 0}</p>
          <p className="metric-note">inclui rascunhos ainda não enviados</p>
        </article>
        <article className="metric-card">
          <span className="metric-icon metric-icon-blue" aria-hidden="true">↗</span>
          <p className="metric-label">Projetos</p>
          <p className="metric-value">{stats.projects_total ?? 0}</p>
          <p className="metric-note">{stats.projects_by_status?.in_progress ?? 0} em andamento</p>
        </article>
      </section>

      <section className="panel" aria-labelledby="usage-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">USO POR EMPRESA</p>
            <h2 id="usage-title">Atividade e IA no período</h2>
          </div>
        </div>
        <form className="filter-bar dashboard-filters" action="/admin" aria-label="Filtros de uso">
          <label className="filter-select">
            <span className="sr-only">Período</span>
            <select name="period" defaultValue={period}>
              {Object.entries(PERIOD_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="filter-select">
            <span className="sr-only">Situação da empresa</span>
            <select name="orgStatus" defaultValue={query.orgStatus ?? ""}>
              <option value="">Todas as situações</option>
              {Object.entries(orgStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="filter-select">
            <span className="sr-only">Empresa</span>
            <select name="org" defaultValue={query.org ?? ""}>
              <option value="">Todas as empresas</option>
              {allRows.map((row) => <option key={row.organization_id} value={row.organization_id}>{row.organization_name}</option>)}
            </select>
          </label>
          <button className="button button-secondary" type="submit">Aplicar</button>
          {(filtered || period !== "12m") && <Link className="text-link" href="/admin">Limpar filtros</Link>}
        </form>

        <dl className="results-grid">
          <div><dt>Ideias enviadas</dt><dd>{numberFormat.format(sum("ideas_submitted"))}</dd></div>
          <div><dt>Ideias com decisão</dt><dd>{numberFormat.format(sum("ideas_decided"))}</dd></div>
          <div><dt>Avaliações por IA concluídas</dt><dd>{numberFormat.format(sum("evaluations_completed"))}</dd></div>
          <div><dt>Avaliações com falha</dt><dd>{numberFormat.format(failed)}</dd></div>
          <div><dt>Avaliações em andamento</dt><dd>{numberFormat.format(sum("evaluations_pending"))}</dd></div>
          <div><dt>Mensagens com o copiloto</dt><dd>{numberFormat.format(sum("copilot_messages"))}</dd></div>
          <div><dt>Tokens de entrada (IA)</dt><dd>{numberFormat.format(sum("ai_input_tokens"))}</dd></div>
          <div><dt>Tokens de saída (IA)</dt><dd>{numberFormat.format(sum("ai_output_tokens"))}</dd></div>
        </dl>
        <p className="small-copy muted">
          Tokens são os informados pelo provedor de IA em cada chamada; provedores locais podem não informar. O custo depende do
          contrato com o provedor e não é calculado aqui.
        </p>

        {rows.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Empresa</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Pessoas ativas</th>
                  <th scope="col">Ideias enviadas</th>
                  <th scope="col">Com decisão</th>
                  <th scope="col">Avaliações IA (ok / falha)</th>
                  <th scope="col">Mensagens copiloto</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.organization_id}>
                    <td><Link className="idea-title-link" href={`/admin/companies/${row.organization_id}`}>{row.organization_name}</Link></td>
                    <td>{orgStatusLabels[row.organization_status] ?? row.organization_status}</td>
                    <td>
                      {Number(row.managers_active) + Number(row.collaborators_active)}
                      <span className="table-subtitle">{row.managers_active} gestão · {row.collaborators_via_link} por link</span>
                    </td>
                    <td>{row.ideas_submitted}</td>
                    <td>{row.ideas_decided}</td>
                    <td>
                      {row.evaluations_completed} / {row.evaluations_failed}
                      {Number(row.evaluations_stale) > 0 && <span className="table-subtitle">{row.evaluations_stale} interrompidas</span>}
                    </td>
                    <td>{row.copilot_messages}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="empty-inline">Nenhuma empresa corresponde aos filtros.</p>
        )}
      </section>

      <section className="panel" aria-labelledby="ideas-by-status-title">
        <p className="eyebrow">SITUAÇÃO</p>
        <h2 id="ideas-by-status-title">Ideias por situação (todas as empresas, todo o período)</h2>
        {stats.ideas_total ? (
          <BarList
            caption="Ideias por situação"
            total={stats.ideas_total}
            items={IDEA_STATUS_ORDER.filter((status) => (ideasByStatus[status] ?? 0) > 0).map((status) => ({
              key: status,
              label: ideaStatusLabel(status),
              value: ideasByStatus[status] ?? 0,
            }))}
          />
        ) : (
          <p className="empty-inline">Nenhuma ideia registrada ainda.</p>
        )}
      </section>

      <p className="dashboard-disclaimer">
        Estes indicadores são agregados (contagens) e não dão acesso ao conteúdo de ideias, conversas, avaliações ou
        decisões de nenhuma empresa cliente. Esse conteúdo permanece restrito às equipes de cada organização.
      </p>
    </AdminShell>
  );
}
