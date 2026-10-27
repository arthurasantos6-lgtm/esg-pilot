import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createCriteriaVersion } from "@/app/admin/esg-actions";
import { CriteriaFormFields } from "@/app/admin/esg-criteria/criteria-form";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Nova versão de critérios ESG" };

export default async function NewCriteriaVersionPage({
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
          <Link className="back-link" href="/admin/esg-criteria">← Voltar para critérios</Link>
          <p className="eyebrow">NOVA VERSÃO</p>
          <h1>Criar versão de critérios ESG</h1>
          <p className="muted">A versão é criada como rascunho. Ative-a na tela de detalhe quando estiver pronta.</p>
        </div>
      </header>

      <section className="panel idea-form-panel">
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <form className="idea-form" action={createCriteriaVersion}>
          <CriteriaFormFields defaults={{}} />
          <div className="form-actions">
            <Link className="button button-secondary" href="/admin/esg-criteria">Cancelar</Link>
            <button className="button button-primary" type="submit">Criar rascunho <span aria-hidden="true">→</span></button>
          </div>
        </form>
      </section>
    </AdminShell>
  );
}
