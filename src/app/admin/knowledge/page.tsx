import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Base de conhecimento ESG" };

const categoryLabels: Record<string, string> = {
  concept: "Conceito",
  evaluation_criteria: "Critério de avaliação",
  classification_rule: "Regra de classificação",
  reference: "Referência/material de apoio",
  guiding_question: "Pergunta orientadora",
  recommendation: "Recomendação",
};

const statusLabels: Record<string, string> = {
  draft: "Rascunho",
  active: "Ativo",
  archived: "Arquivado",
};

export default async function KnowledgeListPage() {
  await connection();
  const { supabase, user } = await requirePlatformAdmin();
  const { data: items, error } = await supabase
    .from("esg_knowledge_items")
    .select("id, title, category, status, version, updated_at")
    .order("updated_at", { ascending: false });

  if (error) throw new Error(`Não foi possível carregar a base de conhecimento: ${error.message}`);

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <p className="eyebrow">CONHECIMENTO ESG</p>
          <h1>Base de conhecimento</h1>
          <p className="muted">
            Conceitos, critérios, regras, referências, perguntas orientadoras e recomendações usados para orientar a
            avaliação ESG. Este conteúdo é consultivo: a triagem automática usa apenas os critérios versionados.
          </p>
        </div>
        <Link className="button button-primary" href="/admin/knowledge/new">＋ Novo registro</Link>
      </header>

      <section className="panel list-panel">
        {!items?.length ? (
          <div className="empty-state list-empty">
            <span className="empty-icon" aria-hidden="true">◎</span>
            <h2>Nenhum registro cadastrado</h2>
            <p className="muted">Cadastre conceitos, critérios ou referências ESG para orientar a equipe.</p>
            <Link className="button button-secondary" href="/admin/knowledge/new">Criar registro</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Título</th>
                  <th scope="col">Categoria</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Versão</th>
                  <th scope="col">Atualizado em</th>
                  <th scope="col"><span className="sr-only">Abrir registro</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.id}>
                    <td><Link className="idea-title-link" href={`/admin/knowledge/${item.id}`}>{item.title}</Link></td>
                    <td>{categoryLabels[item.category] ?? item.category}</td>
                    <td><span className={`status-badge status-badge-${item.status === "active" ? "approved" : item.status === "draft" ? "submitted" : "archived"}`}>{statusLabels[item.status] ?? item.status}</span></td>
                    <td>v{item.version}</td>
                    <td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(item.updated_at))}</td>
                    <td><Link className="row-link" href={`/admin/knowledge/${item.id}`} aria-label={`Abrir ${item.title}`}>→</Link></td>
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
