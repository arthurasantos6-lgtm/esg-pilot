import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/app/components/app-shell";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Projetos ESG" };

const projectStatuses = [
  ["", "Todos os projetos"],
  ["planned", "Planejado"],
  ["in_progress", "Em andamento"],
  ["completed", "Concluído"],
  ["paused", "Pausado"],
  ["cancelled", "Cancelado"],
] as const;
const statusLabels = Object.fromEntries(projectStatuses.filter(([status]) => status)) as Record<string, string>;

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  await connection();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  assertModuleEnabled(organization.enabled_modules, "projects", "Projetos");
  const params = await searchParams;
  const selectedStatus = projectStatuses.find(([status]) => status === params.status)?.[0] ?? "";

  let request = supabase
    .from("esg_projects")
    .select("id, title, status, target_date, created_at")
    .eq("organization_id", membership.organization_id)
    .order("created_at", { ascending: false });
  if (selectedStatus) request = request.eq("status", selectedStatus);

  const { data: projects, error } = await request;
  if (error) throw new Error(`Não foi possível carregar os projetos: ${error.message}`);

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} role={membership.role}>
      <header className="page-header">
        <div>
          <p className="eyebrow">INICIATIVAS EM ACOMPANHAMENTO</p>
          <h1>Projetos ESG</h1>
          <p className="muted">Transforme ideias aprovadas em metas e resultados acompanháveis.</p>
        </div>
        {membership.role === "company_admin" && <Link className="button button-primary" href="/projects/new">＋ Criar projeto</Link>}
      </header>

      {params.error && <p className="alert alert-error" role="alert">{params.error}</p>}
      <section className="panel list-panel">
        <form className="filter-bar" action="/projects">
          <label className="filter-select">
            <span className="sr-only">Filtrar projetos por situação</span>
            <select name="status" defaultValue={selectedStatus}>
              {projectStatuses.map(([status, label]) => <option key={status} value={status}>{label}</option>)}
            </select>
          </label>
          <button className="button button-secondary" type="submit">Filtrar</button>
        </form>

        {!projects?.length ? (
          <div className="empty-state list-empty">
            <span className="empty-icon" aria-hidden="true">⌁</span>
            <h2>{selectedStatus ? "Nenhum projeto nesta situação" : "Nenhum projeto cadastrado"}</h2>
            <p className="muted">
              {membership.role === "company_admin"
                ? "Organize uma iniciativa aprovada em objetivos, indicadores e etapas."
                : "Quando a organização criar projetos, eles aparecerão nesta lista."}
            </p>
            {membership.role === "company_admin" && !selectedStatus && <Link className="button button-secondary" href="/projects/new">Criar primeiro projeto</Link>}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th scope="col">Projeto</th><th scope="col">Situação</th><th scope="col">Prazo previsto</th><th scope="col">Criado em</th><th scope="col"><span className="sr-only">Abrir projeto</span></th></tr></thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td><Link className="idea-title-link" href={`/projects/${project.id}`}>{project.title}</Link></td>
                    <td><span className={`status-badge status-badge-${project.status}`}>{statusLabels[project.status] ?? project.status}</span></td>
                    <td>{project.target_date ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${project.target_date}T12:00:00`)) : "Não definido"}</td>
                    <td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(project.created_at))}</td>
                    <td><Link className="row-link" href={`/projects/${project.id}`} aria-label={`Abrir ${project.title}`}>→</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <p className="dashboard-disclaimer">Resultados medidos e evidências devem ser validados pela equipe responsável antes de serem comunicados como impacto.</p>
    </AppShell>
  );
}
