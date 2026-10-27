import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { createKnowledgeItem } from "@/app/admin/esg-actions";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Novo registro de conhecimento ESG" };

export default async function NewKnowledgeItemPage({
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
          <Link className="back-link" href="/admin/knowledge">← Voltar para a base de conhecimento</Link>
          <p className="eyebrow">NOVO REGISTRO</p>
          <h1>Cadastrar conhecimento ESG</h1>
          <p className="muted">Use linguagem clara e cite a fonte quando aplicável. Não inclua dados pessoais de colaboradores.</p>
        </div>
      </header>

      <section className="panel idea-form-panel">
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <form className="idea-form" action={createKnowledgeItem}>
          <label htmlFor="title">Título <span aria-hidden="true">*</span></label>
          <input id="title" name="title" type="text" minLength={2} maxLength={160} required placeholder="Ex.: O que caracteriza impacto ambiental indireto" />

          <label htmlFor="category">Categoria <span aria-hidden="true">*</span></label>
          <select id="category" name="category" defaultValue="concept" required>
            <option value="concept">Conceito</option>
            <option value="evaluation_criteria">Critério de avaliação</option>
            <option value="classification_rule">Regra de classificação</option>
            <option value="reference">Referência/material de apoio</option>
            <option value="guiding_question">Pergunta orientadora</option>
            <option value="recommendation">Recomendação</option>
          </select>

          <label htmlFor="description">Descrição <span aria-hidden="true">*</span></label>
          <textarea id="description" name="description" rows={6} minLength={2} maxLength={4000} required placeholder="Explique o conceito, critério ou orientação de forma objetiva." />

          <label htmlFor="source">Fonte</label>
          <input id="source" name="source" type="text" maxLength={300} placeholder="Ex.: GRI Standards, política interna, norma setorial" />

          <label htmlFor="status">Situação</label>
          <select id="status" name="status" defaultValue="active">
            <option value="draft">Rascunho</option>
            <option value="active">Ativo</option>
            <option value="archived">Arquivado</option>
          </select>

          <div className="form-actions">
            <Link className="button button-secondary" href="/admin/knowledge">Cancelar</Link>
            <button className="button button-primary" type="submit">Cadastrar registro <span aria-hidden="true">→</span></button>
          </div>
        </form>
      </section>
    </AdminShell>
  );
}
