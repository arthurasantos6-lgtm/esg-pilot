import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import { updateKnowledgeItem } from "@/app/admin/esg-actions";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Detalhe do registro de conhecimento" };

export default async function KnowledgeItemDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; created?: string; updated?: string }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.string().uuid().safeParse(id).success) notFound();

  const { supabase, user } = await requirePlatformAdmin();
  const { data: item, error } = await supabase
    .from("esg_knowledge_items")
    .select("id, title, description, category, source, status, version, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Não foi possível carregar o registro: ${error.message}`);
  if (!item) notFound();

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/admin/knowledge">← Voltar para a base de conhecimento</Link>
          <p className="eyebrow">VERSÃO {item.version}</p>
          <h1>{item.title}</h1>
          <p className="muted">
            Criado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(item.created_at))} ·
            {" "}atualizado em {new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(item.updated_at))}
          </p>
        </div>
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      {query.created && <p className="alert alert-success" role="status">Registro criado com sucesso.</p>}
      {query.updated && <p className="alert alert-success" role="status">Alterações salvas (nova versão registrada).</p>}

      <section className="panel idea-form-panel">
        <form className="idea-form" action={updateKnowledgeItem}>
          <input type="hidden" name="itemId" value={item.id} />
          <label htmlFor="title">Título <span aria-hidden="true">*</span></label>
          <input id="title" name="title" type="text" minLength={2} maxLength={160} required defaultValue={item.title} />

          <label htmlFor="category">Categoria <span aria-hidden="true">*</span></label>
          <select id="category" name="category" defaultValue={item.category} required>
            <option value="concept">Conceito</option>
            <option value="evaluation_criteria">Critério de avaliação</option>
            <option value="classification_rule">Regra de classificação</option>
            <option value="reference">Referência/material de apoio</option>
            <option value="guiding_question">Pergunta orientadora</option>
            <option value="recommendation">Recomendação</option>
          </select>

          <label htmlFor="description">Descrição <span aria-hidden="true">*</span></label>
          <textarea id="description" name="description" rows={6} minLength={2} maxLength={4000} required defaultValue={item.description} />

          <label htmlFor="source">Fonte</label>
          <input id="source" name="source" type="text" maxLength={300} defaultValue={item.source ?? ""} />

          <label htmlFor="status">Situação</label>
          <select id="status" name="status" defaultValue={item.status}>
            <option value="draft">Rascunho</option>
            <option value="active">Ativo</option>
            <option value="archived">Arquivado</option>
          </select>

          <div className="form-actions">
            <button className="button button-primary" type="submit">Salvar alterações</button>
          </div>
        </form>
      </section>
    </AdminShell>
  );
}
