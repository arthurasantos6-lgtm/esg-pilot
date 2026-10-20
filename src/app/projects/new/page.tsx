import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { createProject } from "@/app/actions";
import { AppShell } from "@/app/components/app-shell";
import { requireCompanyContext } from "@/lib/auth";

export const metadata: Metadata = { title: "Criar projeto ESG" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  if (membership.role !== "company_admin") redirect("/projects?error=Apenas%20administradores%20da%20empresa%20podem%20criar%20projetos.");

  const [{ data: approvedIdeas, error: ideasError }, { error }] = await Promise.all([
    supabase
      .from("ideas")
      .select("id, title")
      .eq("organization_id", membership.organization_id)
      .eq("status", "approved")
      .order("created_at", { ascending: false }),
    searchParams,
  ]);
  if (ideasError) throw new Error(`Não foi possível carregar as ideias aprovadas: ${ideasError.message}`);

  return (
    <AppShell organizationName={organization.name} userEmail={user.email ?? "Conta"} role={membership.role}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/projects">← Voltar para projetos</Link>
          <p className="eyebrow">DA IDEIA À INICIATIVA</p>
          <h1>Criar projeto ESG</h1>
          <p className="muted">Defina o objetivo e o horizonte de execução. Indicadores podem ser adicionados no detalhe do projeto.</p>
        </div>
      </header>
      <section className="panel project-form-panel">
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <form className="idea-form" action={createProject}>
          <label htmlFor="title">Nome do projeto <span aria-hidden="true">*</span></label>
          <input id="title" name="title" type="text" minLength={3} maxLength={160} required placeholder="Ex.: Redução do consumo de água" />
          <label htmlFor="objective">Objetivo e meta pretendida <span aria-hidden="true">*</span></label>
          <textarea id="objective" name="objective" rows={5} minLength={10} maxLength={4000} required placeholder="Descreva o objetivo, as metas e como pretende acompanhar a iniciativa." />
          <label htmlFor="ideaId">Ideia aprovada relacionada</label>
          <select id="ideaId" name="ideaId" defaultValue="">
            <option value="">Sem vínculo com uma ideia</option>
            {approvedIdeas?.map((idea) => <option value={idea.id} key={idea.id}>{idea.title}</option>)}
          </select>
          <div className="date-fields">
            <div><label htmlFor="startsOn">Data de início</label><input id="startsOn" name="startsOn" type="date" /></div>
            <div><label htmlFor="targetDate">Prazo previsto</label><input id="targetDate" name="targetDate" type="date" /></div>
          </div>
          <div className="form-actions">
            <Link className="button button-secondary" href="/projects">Cancelar</Link>
            <button className="button button-primary" type="submit">Criar projeto <span aria-hidden="true">→</span></button>
          </div>
        </form>
      </section>
    </AppShell>
  );
}
