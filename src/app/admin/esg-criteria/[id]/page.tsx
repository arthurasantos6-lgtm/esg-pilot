import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { activateCriteriaVersion, cloneCriteriaVersion, updateCriteriaVersion } from "@/app/admin/esg-actions";
import { CriteriaFormFields } from "@/app/admin/esg-criteria/criteria-form";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";
import { parseEsgCriteria } from "@/lib/esg-analysis";

export const metadata: Metadata = { title: "Detalhe da versão de critérios" };

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativa",
  archived: "Arquivada",
};

export default async function CriteriaVersionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; created?: string; updated?: string; activated?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.guid().safeParse(id).success) notFound();

  const { supabase, user } = await requirePlatformAdmin();
  const { data: version, error } = await supabase
    .from("esg_criteria_versions")
    .select("id, label, status, dimensions, potential_thresholds, notes, created_at, activated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar a versão: ${error.message}`);
  if (!version) notFound();

  const isDraft = version.status === "draft";
  const criteria = parseEsgCriteria(version.dimensions, version.potential_thresholds);
  const thresholds = criteria?.thresholds as { alto: number; medio: number } | undefined;

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/admin/esg-criteria">← Voltar para critérios</Link>
          <p className="eyebrow">VERSÃO DE CRITÉRIOS</p>
          <h1>{version.label}</h1>
          <p className="muted">
            <span className={`status-badge status-badge-${version.status === "active" ? "approved" : version.status === "draft" ? "submitted" : "archived"}`}>{statusLabels[version.status] ?? version.status}</span>
            {" "}· Criada em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(version.created_at))}
          </p>
        </div>
        <div className="header-actions">
          <form action={cloneCriteriaVersion}>
            <input type="hidden" name="sourceId" value={version.id} />
            <button className="button button-secondary" type="submit">Duplicar versão</button>
          </form>
          {version.status !== "active" && (
            <form action={activateCriteriaVersion}>
              <input type="hidden" name="criteriaVersionId" value={version.id} />
              <button className="button button-primary" type="submit">Ativar esta versão</button>
            </form>
          )}
        </div>
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      {query.created && <p className="alert alert-success" role="status">Versão criada como rascunho.</p>}
      {query.updated && <p className="alert alert-success" role="status">Alterações salvas.</p>}
      {query.activated && <p className="alert alert-success" role="status">Versão ativada. Novas ideias usarão estes critérios.</p>}

      {!isDraft && (
        <p className="alert alert-info" role="status">
          Esta versão não é um rascunho e não pode mais ser editada, para preservar a rastreabilidade das avaliações já feitas com ela. Duplique-a para criar uma nova versão ajustável.
        </p>
      )}

      <section className="panel idea-form-panel">
        <form className="idea-form" action={updateCriteriaVersion}>
          <input type="hidden" name="criteriaVersionId" value={version.id} />
          <fieldset disabled={!isDraft} className="form-fieldset-reset">
            <CriteriaFormFields
              defaults={{
                label: version.label,
                notes: version.notes,
                thresholdAlto: thresholds?.alto,
                thresholdMedio: thresholds?.medio,
                E: criteria?.dimensions.E,
                S: criteria?.dimensions.S,
                G: criteria?.dimensions.G,
              }}
            />
          </fieldset>
          {isDraft && (
            <div className="form-actions">
              <button className="button button-primary" type="submit">Salvar alterações</button>
            </div>
          )}
        </form>
      </section>
    </AdminShell>
  );
}
