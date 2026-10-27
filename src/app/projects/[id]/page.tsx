import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { createIndicator, recordIndicatorMeasurement, updateProjectStatus } from "@/app/actions";
import { AppShell } from "@/app/components/app-shell";
import { requireCompanyContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Detalhe do projeto ESG" };

const projectStatuses = [
  ["planned", "Planejado"],
  ["in_progress", "Em andamento"],
  ["completed", "Concluído"],
  ["paused", "Pausado"],
  ["cancelled", "Cancelado"],
];
const statusLabels = Object.fromEntries(projectStatuses) as Record<string, string>;
const dimensionLabels = { E: "Ambiental", S: "Social", G: "Governança" };

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  const [{ data: project, error: projectError }, { data: indicators, error: indicatorError }] =
    await Promise.all([
      supabase
        .from("esg_projects")
        .select("id, title, objective, status, starts_on, target_date, estimated_cost, created_at")
        .eq("id", id)
        .eq("organization_id", membership.organization_id)
        .maybeSingle(),
      supabase
        .from("esg_indicators")
        .select("id, name, dimension, unit, baseline, target, measured, measured_at, evidence_note")
        .eq("project_id", id)
        .eq("organization_id", membership.organization_id)
        .order("created_at", { ascending: true }),
    ]);

  if (projectError) throw new Error(`Não foi possível carregar o projeto: ${projectError.message}`);
  if (indicatorError) throw new Error(`Não foi possível carregar os indicadores: ${indicatorError.message}`);
  if (!project) notFound();

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/projects">← Voltar para projetos</Link>
          <p className="eyebrow">PROJETO ESG</p>
          <h1>{project.title}</h1>
          <p className="muted">Criado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "long" }).format(new Date(project.created_at))}</p>
        </div>
        <span className={`status-badge status-badge-${project.status}`}>{statusLabels[project.status] ?? project.status}</span>
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      <div className="project-detail-grid">
        <section className="panel detail-panel">
          <p className="eyebrow">OBJETIVO E METAS</p>
          <h2>Descrição da iniciativa</h2>
          <p className="preserve-lines">{project.objective}</p>
          <div className="project-dates">
            <div><span>Início previsto</span><strong>{project.starts_on ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${project.starts_on}T12:00:00`)) : "Não definido"}</strong></div>
            <div><span>Prazo previsto</span><strong>{project.target_date ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(`${project.target_date}T12:00:00`)) : "Não definido"}</strong></div>
          </div>
        </section>
        {membership.role === "company_admin" && (
          <section className="panel workflow-panel">
            <p className="eyebrow">EXECUÇÃO</p>
            <h2>Situação do projeto</h2>
            <form className="status-form" action={updateProjectStatus}>
              <input type="hidden" name="projectId" value={project.id} />
              <label htmlFor="project-status">Atualizar situação</label>
              <select id="project-status" name="status" defaultValue={project.status}>
                {projectStatuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <button className="button button-primary button-full" type="submit">Salvar situação</button>
            </form>
          </section>
        )}
      </div>

      <section className="panel indicators-panel" aria-labelledby="indicators-title">
        <div className="panel-heading">
          <div><p className="eyebrow">ACOMPANHAMENTO</p><h2 id="indicators-title">Indicadores do projeto</h2></div>
          <span className="subtle-tag">Previsto ≠ medido</span>
        </div>
        <p className="muted small-copy">Registre linha de base, meta e medições com unidade. Valores medidos devem ter data e evidência para apoiar sua validação.</p>
        {indicators?.length ? (
          <div className="indicator-list">
            {indicators.map((indicator) => (
              <article className="indicator-card" key={indicator.id}>
                <div className="indicator-heading">
                  <span className={`dimension-pill dimension-${indicator.dimension.toLowerCase()}`}>{indicator.dimension}</span>
                  <div><h3>{indicator.name}</h3><p className="muted small-copy">{dimensionLabels[indicator.dimension as keyof typeof dimensionLabels]} · {indicator.unit}</p></div>
                </div>
                <dl className="indicator-values">
                  <div><dt>Linha de base</dt><dd>{indicator.baseline ?? "Não informada"}{indicator.baseline !== null ? ` ${indicator.unit}` : ""}</dd></div>
                  <div><dt>Meta prevista</dt><dd>{indicator.target ?? "Não definida"}{indicator.target !== null ? ` ${indicator.unit}` : ""}</dd></div>
                  <div><dt>Resultado medido</dt><dd>{indicator.measured ?? "Sem medição"}{indicator.measured !== null ? ` ${indicator.unit}` : ""}</dd></div>
                </dl>
                {indicator.evidence_note && <p className="evidence-note">Evidência: {indicator.evidence_note}</p>}
                {membership.role === "company_admin" && (
                  <form className="measurement-form" action={recordIndicatorMeasurement}>
                    <input type="hidden" name="indicatorId" value={indicator.id} />
                    <input type="hidden" name="projectId" value={project.id} />
                    <div><label htmlFor={`measured-${indicator.id}`}>Resultado medido ({indicator.unit})</label><input id={`measured-${indicator.id}`} name="measured" type="number" step="any" defaultValue={indicator.measured ?? ""} required /></div>
                    <div><label htmlFor={`measuredAt-${indicator.id}`}>Data da medição</label><input id={`measuredAt-${indicator.id}`} name="measuredAt" type="date" defaultValue={indicator.measured_at ?? ""} required /></div>
                    <div className="evidence-field"><label htmlFor={`evidence-${indicator.id}`}>Evidência ou método de validação</label><input id={`evidence-${indicator.id}`} name="evidenceNote" type="text" maxLength={800} defaultValue={indicator.evidence_note ?? ""} /></div>
                    <button className="button button-secondary button-small" type="submit">Registrar medição</button>
                  </form>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-inline">Ainda não há indicadores definidos para este projeto. Defina unidades e metas adequadas ao contexto da organização.</div>
        )}
        {membership.role === "company_admin" && (
          <details className="new-indicator">
            <summary>Adicionar indicador</summary>
            <form className="idea-form indicator-create-form" action={createIndicator}>
              <input type="hidden" name="projectId" value={project.id} />
              <label htmlFor="indicator-name">Nome do indicador <span aria-hidden="true">*</span></label>
              <input id="indicator-name" name="name" type="text" maxLength={160} required placeholder="Ex.: Consumo mensal de energia" />
              <div className="date-fields">
                <div><label htmlFor="dimension">Dimensão ESG</label><select id="dimension" name="dimension" defaultValue="E"><option value="E">Ambiental</option><option value="S">Social</option><option value="G">Governança</option></select></div>
                <div><label htmlFor="unit">Unidade de medida</label><input id="unit" name="unit" type="text" maxLength={40} required placeholder="kWh, m³, pessoas..." /></div>
              </div>
              <div className="date-fields">
                <div><label htmlFor="baseline">Linha de base (opcional)</label><input id="baseline" name="baseline" type="number" step="any" /></div>
                <div><label htmlFor="target">Meta prevista (opcional)</label><input id="target" name="target" type="number" step="any" /></div>
              </div>
              <button className="button button-primary" type="submit">Salvar indicador</button>
            </form>
          </details>
        )}
      </section>
      <p className="dashboard-disclaimer">Impactos só devem ser comunicados como comprovados quando houver medição, evidência e validação adequadas.</p>
    </AppShell>
  );
}
