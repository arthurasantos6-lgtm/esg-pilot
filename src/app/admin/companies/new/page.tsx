import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createOrganization } from "@/app/admin/actions";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Nova empresa cliente" };

export default async function NewCompanyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const { user } = await requirePlatformAdmin();
  const { error } = await searchParams;

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/admin/companies">← Voltar para empresas</Link>
          <p className="eyebrow">NOVO AMBIENTE ISOLADO</p>
          <h1>Cadastrar empresa cliente</h1>
          <p className="muted">Cada empresa tem seus próprios usuários, ideias e projetos, isolados por permissões no banco de dados.</p>
        </div>
      </header>

      <section className="panel idea-form-panel">
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <form className="idea-form" action={createOrganization}>
          <label htmlFor="name">Nome da empresa <span aria-hidden="true">*</span></label>
          <input id="name" name="name" type="text" minLength={2} maxLength={160} required placeholder="Ex.: Indústria Exemplo Ltda." />

          <label htmlFor="displayName">Nome de exibição</label>
          <input id="displayName" name="displayName" type="text" maxLength={160} placeholder="Ex.: Exemplo (como aparecerá na interface)" />

          <label htmlFor="sector">Segmento</label>
          <input id="sector" name="sector" type="text" maxLength={100} placeholder="Ex.: Indústria, Varejo, Serviços" />

          <label htmlFor="companySize">Porte</label>
          <input id="companySize" name="companySize" type="text" maxLength={100} placeholder="Ex.: Pequena, Média, Grande" />

          <label htmlFor="status">Situação da conta</label>
          <select id="status" name="status" defaultValue="trial">
            <option value="trial">Em implantação</option>
            <option value="active">Ativa</option>
            <option value="suspended">Suspensa</option>
            <option value="inactive">Inativa</option>
          </select>

          <fieldset className="module-fieldset">
            <legend>Módulos habilitados</legend>
            <label className="checkbox-row">
              <input type="checkbox" name="modules" value="ideas" defaultChecked />
              <span>Ideias (registro e triagem ESG)</span>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" name="modules" value="projects" defaultChecked />
              <span>Projetos ESG (planejamento e indicadores)</span>
            </label>
          </fieldset>

          <div className="form-actions">
            <Link className="button button-secondary" href="/admin/companies">Cancelar</Link>
            <button className="button button-primary" type="submit">Cadastrar empresa <span aria-hidden="true">→</span></button>
          </div>
        </form>
      </section>
    </AdminShell>
  );
}
