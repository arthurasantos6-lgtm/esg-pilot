import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/app/components/app-shell";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Ideias" };

const statuses = [
  ["", "Todas as situações"],
  ["submitted", "Enviada"],
  ["in_review", "Em análise"],
  ["awaiting_info", "Aguardando informações"],
  ["technical_review", "Avaliação técnica"],
  ["approved", "Aprovada"],
  ["in_progress", "Em implementação"],
  ["implemented", "Implementada"],
  ["rejected", "Rejeitada"],
  ["archived", "Arquivada"],
] as const;

const labels = Object.fromEntries(statuses.filter(([value]) => value)) as Record<string, string>;

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string; page?: string }>;
}) {
  await connection();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  assertModuleEnabled(organization.enabled_modules, "ideas", "Ideias");
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? "";
  const selectedStatus = statuses.find(([value]) => value === params.status)?.[0] ?? "";
  const requestedPage = Number(params.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 15;

  let request = supabase
    .from("ideas")
    .select("id, title, area, status, created_at, analysis", { count: "exact" })
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false });

  if (query) request = request.ilike("title", `%${query}%`);
  if (selectedStatus) request = request.eq("status", selectedStatus);

  const { data: ideas, count, error } = await request.range((page - 1) * pageSize, page * pageSize - 1);
  if (error) throw new Error(`Não foi possível carregar as ideias: ${error.message}`);

  const pageCount = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const makePageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedStatus) params.set("status", selectedStatus);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/ideas${params.size ? `?${params.toString()}` : ""}`;
  };

  return (
    <AppShell organizationName={organization.name} userEmail={user.email ?? "Conta"} role={membership.role}>
      <header className="page-header">
        <div>
          <p className="eyebrow">IDEIAS DA ORGANIZAÇÃO</p>
          <h1>Ideias</h1>
          <p className="muted">Acompanhe sugestões e oportunidades compartilhadas pela equipe.</p>
        </div>
        <Link className="button button-primary" href="/ideas/new">＋ Nova ideia</Link>
      </header>

      {params.error && <p className="alert alert-error" role="alert">{params.error}</p>}
      <section className="panel list-panel">
        <form className="filter-bar" action="/ideas">
          <label className="search-field">
            <span className="sr-only">Buscar por título</span>
            <span aria-hidden="true">⌕</span>
            <input name="q" type="search" placeholder="Buscar ideias" defaultValue={query} />
          </label>
          <label className="filter-select">
            <span className="sr-only">Filtrar por situação</span>
            <select name="status" defaultValue={selectedStatus}>
              {statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <button className="button button-secondary" type="submit">Filtrar</button>
        </form>

        {!ideas?.length ? (
          <div className="empty-state list-empty">
            <span className="empty-icon" aria-hidden="true">⌕</span>
            <h2>{query || selectedStatus ? "Nenhuma ideia encontrada" : "Nenhuma ideia registrada"}</h2>
            <p className="muted">
              {query || selectedStatus
                ? "Altere os filtros ou tente outra busca."
                : "Registre a primeira oportunidade de melhoria da sua organização."}
            </p>
            {!query && !selectedStatus && <Link className="button button-secondary" href="/ideas/new">Registrar ideia</Link>}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Ideia</th><th scope="col">Área</th><th scope="col">Situação</th><th scope="col">Data</th><th scope="col"><span className="sr-only">Abrir ideia</span></th></tr></thead>
                <tbody>
                  {ideas.map((idea) => (
                    <tr key={idea.id}>
                      <td>
                        <Link className="idea-title-link" href={`/ideas/${idea.id}`}>{idea.title}</Link>
                        <span className="table-subtitle">{idea.analysis ? "Triagem ESG disponível" : "Aguardando triagem"}</span>
                      </td>
                      <td>{idea.area || "Não informada"}</td>
                      <td><span className={`status-badge status-badge-${idea.status}`}>{labels[idea.status] ?? idea.status}</span></td>
                      <td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(idea.created_at))}</td>
                      <td><Link className="row-link" href={`/ideas/${idea.id}`} aria-label={`Abrir ${idea.title}`}>→</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <nav className="pagination" aria-label="Paginação">
              <span className="muted small-copy">Página {page} de {pageCount} · {count ?? 0} ideias</span>
              <div>
                {page > 1 && <Link className="button button-small button-secondary" href={makePageUrl(page - 1)}>Anterior</Link>}
                {page < pageCount && <Link className="button button-small button-secondary" href={makePageUrl(page + 1)}>Próxima</Link>}
              </div>
            </nav>
          </>
        )}
      </section>
    </AppShell>
  );
}
