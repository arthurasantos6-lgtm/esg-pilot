import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Critérios ESG" };

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativa",
  archived: "Arquivada",
};

export default async function EsgCriteriaListPage() {
  await connection();
  const { supabase, user } = await requirePlatformAdmin();
  const { data: versions, error } = await supabase
    .from("esg_criteria_versions")
    .select("id, label, status, created_at, activated_at")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Não foi possível carregar os critérios: ${error.message}`);

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <p className="eyebrow">TRIAGEM ESG</p>
          <h1>Critérios de avaliação</h1>
          <p className="muted">
            Cada versão define palavras-chave, explicações, indicadores sugeridos e limites de potencial por dimensão.
            Apenas uma versão fica ativa por vez e alimenta a triagem de novas ideias.
          </p>
        </div>
        <Link className="button button-primary" href="/admin/esg-criteria/new">＋ Nova versão</Link>
      </header>

      <section className="panel list-panel">
        {!versions?.length ? (
          <div className="empty-state list-empty">
            <span className="empty-icon" aria-hidden="true">⌁</span>
            <h2>Nenhuma versão cadastrada</h2>
            <p className="muted">Crie a primeira versão de critérios de triagem ESG.</p>
            <Link className="button button-secondary" href="/admin/esg-criteria/new">Criar versão</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Versão</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Criada em</th>
                  <th scope="col">Ativada em</th>
                  <th scope="col"><span className="sr-only">Abrir versão</span></th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id}>
                    <td><Link className="idea-title-link" href={`/admin/esg-criteria/${version.id}`}>{version.label}</Link></td>
                    <td><span className={`status-badge status-badge-${version.status === "active" ? "approved" : version.status === "draft" ? "submitted" : "archived"}`}>{statusLabels[version.status] ?? version.status}</span></td>
                    <td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(version.created_at))}</td>
                    <td>{version.activated_at ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(version.activated_at)) : "—"}</td>
                    <td><Link className="row-link" href={`/admin/esg-criteria/${version.id}`} aria-label={`Abrir ${version.label}`}>→</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminShell>
  );
}
