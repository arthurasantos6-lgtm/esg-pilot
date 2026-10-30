import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/app/components/app-shell";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";
import { potentialBand } from "@/lib/esg-engine";
import { executabilityLevel } from "@/lib/executability";
import {
  compareByPotential,
  compareByScore,
  countByFolder,
  IDEA_FOLDERS,
  isInFolder,
  parseFolder,
} from "@/lib/idea-folders";
import { canCreateIdeas } from "@/lib/idea-permissions";
import { organizeIdeas } from "@/lib/organize-ideas";
import { IDEA_STATUS_ORDER, ideaStatusLabel, nextStepForAuthor } from "@/lib/idea-status";

export const metadata: Metadata = { title: "Ideias" };

const statuses = [
  ["", "Todas as situações"],
  ...IDEA_STATUS_ORDER.map((status) => [status, ideaStatusLabel(status)] as const),
] as const;

export default async function IdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string; page?: string; mine?: string; folder?: string; sort?: string }>;
}) {
  await connection();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  assertModuleEnabled(organization.enabled_modules, "ideas", "Ideias");
  const params = await searchParams;
  const query = params.q?.trim().slice(0, 100) ?? "";
  const selectedStatus = statuses.find(([value]) => value === params.status)?.[0] ?? "";
  const onlyMine = params.mine === "1";
  const canCreate = canCreateIdeas(membership);
  const requestedPage = Number(params.page);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const pageSize = 15;
  const isManager = membership.role === "company_admin";
  const folder = isManager ? parseFolder(params.folder) : null;
  const sort = isManager && (params.sort === "score" || params.sort === "potential") ? params.sort : "";

  let request = supabase
    .from("ideas")
    .select("id, title, area, status, created_at, author_id, author_name, analysis", { count: "exact" })
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false });

  if (query) request = request.ilike("title", `%${query}%`);
  if (selectedStatus) request = request.eq("status", selectedStatus);
  if (onlyMine) request = request.eq("author_id", user.id);

  // A gestão classifica em pastas pela avaliação de cada ideia, então pagina depois de filtrar.
  const { data: fetchedIdeas, count: fetchedCount, error } = await (isManager
    ? request.limit(1000)
    : request.range((page - 1) * pageSize, page * pageSize - 1));
  if (error) throw new Error(`Não foi possível carregar as ideias: ${error.message}`);

  let evaluations: { idea_id: string; result: unknown; created_at: string }[] = [];
  if (isManager) {
    const { data, error: evaluationsError } = await supabase
      .from("idea_evaluations")
      .select("idea_id, result, created_at")
      .eq("organization_id", membership.organization_id)
      .eq("status", "completed");
    if (evaluationsError) throw new Error(`Não foi possível carregar as avaliações: ${evaluationsError.message}`);
    evaluations = data ?? [];
  }

  const organized = organizeIdeas(fetchedIdeas ?? [], evaluations);
  const folderCounts = countByFolder(organized);
  const matching = isManager
    ? organized.filter((idea) => !folder || isInFolder(idea, folder)).sort(sort === "score" ? compareByScore : sort === "potential" ? compareByPotential : () => 0)
    : organized;
  const ideas = isManager ? matching.slice((page - 1) * pageSize, page * pageSize) : matching;
  const count = isManager ? matching.length : fetchedCount;

  const pageCount = Math.max(1, Math.ceil((count ?? 0) / pageSize));
  const makePageUrl = (targetPage: number) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedStatus) params.set("status", selectedStatus);
    if (onlyMine) params.set("mine", "1");
    if (folder) params.set("folder", folder);
    if (sort) params.set("sort", sort);
    if (targetPage > 1) params.set("page", String(targetPage));
    return `/ideas${params.size ? `?${params.toString()}` : ""}`;
  };
  const makeFolderUrl = (target: string | null) => {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (selectedStatus) params.set("status", selectedStatus);
    if (target) params.set("folder", target);
    if (sort) params.set("sort", sort);
    return `/ideas${params.size ? `?${params.toString()}` : ""}`;
  };
  const filtered = Boolean(query || selectedStatus || onlyMine || folder);

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <header className="page-header">
        <div>
          {membership.role === "company_admin" ? (
            <>
              <p className="eyebrow">IDEIAS DA ORGANIZAÇÃO</p>
              <h1>Ideias</h1>
              <p className="muted">Ideias enviadas pelos colaboradores para avaliação da gestão.</p>
            </>
          ) : (
            <>
              <p className="eyebrow">ACOMPANHAMENTO</p>
              <h1>Minhas ideias</h1>
              <p className="muted">Suas propostas, a situação de cada uma e o que fazer em seguida.</p>
            </>
          )}
        </div>
        {canCreate && <Link className="button button-primary" href="/ideas/new">＋ Nova ideia</Link>}
      </header>

      {params.error && <p className="alert alert-error" role="alert">{params.error}</p>}
      <section className="panel list-panel">
        {isManager && (
          <nav className="folder-tabs" aria-label="Pastas ESG">
            <Link href={makeFolderUrl(null)} aria-current={!folder ? "page" : undefined}>Todas <span>{organized.length}</span></Link>
            {IDEA_FOLDERS.map(({ key, label }) => (
              <Link key={key} href={makeFolderUrl(key)} aria-current={folder === key ? "page" : undefined}>
                {label} <span>{folderCounts[key]}</span>
              </Link>
            ))}
          </nav>
        )}
        <form className="filter-bar" action="/ideas">
          {folder && <input type="hidden" name="folder" value={folder} />}
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
          {isManager && (
            <label className="filter-select">
              <span className="sr-only">Ordenar ideias</span>
              <select name="sort" defaultValue={sort}>
                <option value="">Mais recentes</option>
                <option value="potential">Maior potencial ESG</option>
                <option value="score">Maior executabilidade</option>
              </select>
            </label>
          )}
          <button className="button button-secondary" type="submit">Filtrar</button>
        </form>

        {!ideas.length ? (
          <div className="empty-state list-empty">
            <span className="empty-icon" aria-hidden="true">⌕</span>
            <h2>{filtered ? "Nenhuma ideia encontrada" : "Nenhuma ideia registrada"}</h2>
            <p className="muted">
              {filtered
                ? "Altere os filtros ou tente outra busca."
                : canCreate
                  ? "Registre a primeira oportunidade de melhoria."
                  : "As ideias chegam pelos colaboradores. Compartilhe o link de acesso da empresa para começar."}
            </p>
            {!filtered && canCreate && (
              <Link className="button button-secondary" href="/ideas/new">Registrar ideia</Link>
            )}
            {!filtered && isManager && (
              <Link className="button button-secondary" href="/equipe">Gerar link de acesso</Link>
            )}
          </div>
        ) : (
          <>
            <div className="table-wrap">
              <table>
                <thead><tr><th scope="col">Ideia</th>{isManager && <th scope="col">Potencial</th>}{isManager && <th scope="col">Executabilidade</th>}{isManager && <th scope="col">Dimensões</th>}<th scope="col">Área</th><th scope="col">Situação</th><th scope="col">Data</th><th scope="col"><span className="sr-only">Abrir ideia</span></th></tr></thead>
                <tbody>
                  {ideas.map((idea) => (
                    <tr key={idea.id}>
                      <td>
                        <Link className="idea-title-link" href={idea.status === "draft" ? `/ideas/${idea.id}/review` : `/ideas/${idea.id}`}>{idea.title}</Link>
                        <span className="table-subtitle">
                          {idea.author_id === user.id ? nextStepForAuthor(idea.status) : idea.author_name ? `Enviada por ${idea.author_name}` : "Enviada pela equipe"}
                        </span>
                      </td>
                      {isManager && (
                        <td>
                          {idea.potentialScore === null ? (
                            <span className="muted small-copy">Sem nota</span>
                          ) : (
                            <span className="small-copy"><strong>{Math.round(idea.potentialScore)}</strong> · {potentialBand(idea.potentialScore).label}</span>
                          )}
                        </td>
                      )}
                      {isManager && (
                        <td>
                          {idea.score === null ? (
                            <span className="muted small-copy">Sem nota</span>
                          ) : (
                            <span className={`score-chip score-${executabilityLevel(idea.score).key}`}>{idea.score}</span>
                          )}
                        </td>
                      )}
                      {isManager && (
                        <td>
                          <span className="dimension-group">
                            {idea.dimensions.map((dimension) => (
                              <span key={dimension} className={`dimension-pill dimension-${dimension.toLowerCase()}`}>{dimension}</span>
                            ))}
                          </span>
                        </td>
                      )}
                      <td>{idea.area || "Não informada"}</td>
                      <td><span className={`status-badge status-badge-${idea.status}`}>{ideaStatusLabel(idea.status)}</span></td>
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
