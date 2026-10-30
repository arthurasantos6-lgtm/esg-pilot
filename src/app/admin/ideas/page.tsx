import type { Metadata } from "next";
import { connection } from "next/server";
import { z } from "zod";
import { AdminIdeasTable } from "@/app/admin/components/admin-ideas-table";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";
import { IDEA_STATUS_ORDER, ideaStatusLabel } from "@/lib/idea-status";

export const metadata: Metadata = { title: "Ideias das empresas" };

const LIST_LIMIT = 500;
const statuses = IDEA_STATUS_ORDER.filter((status) => status !== "draft");

export default async function AdminIdeasPage({
  searchParams,
}: {
  searchParams: Promise<{ org?: string; status?: string }>;
}) {
  await connection();
  const { supabase, user } = await requirePlatformAdmin();
  const query = await searchParams;
  const org = z.guid().safeParse(query.org).success ? (query.org as string) : null;
  const status = statuses.find((item) => item === query.status) ?? null;

  const [{ data: ideas, error }, { data: organizations }] = await Promise.all([
    supabase.rpc("platform_list_ideas", { p_organization_id: org, p_status: status, p_limit: LIST_LIMIT }),
    supabase.rpc("platform_list_organizations"),
  ]);
  const rows = ideas ?? [];

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <p className="eyebrow">VISÃO DA FORNECEDORA</p>
          <h1>Ideias das empresas</h1>
          <p className="muted">Lista resumida das ideias enviadas. O texto da ideia, a análise e quem enviou ficam só com a empresa.</p>
        </div>
      </header>

      <section className="panel list-panel">
        <form className="filter-bar" action="/admin/ideas">
          <label className="filter-select">
            <span className="sr-only">Filtrar por empresa</span>
            <select name="org" defaultValue={org ?? ""}>
              <option value="">Todas as empresas</option>
              {(organizations ?? []).map((item) => <option key={item.id} value={item.id}>{item.display_name || item.name}</option>)}
            </select>
          </label>
          <label className="filter-select">
            <span className="sr-only">Filtrar por situação</span>
            <select name="status" defaultValue={status ?? ""}>
              <option value="">Todas as situações</option>
              {statuses.map((item) => <option key={item} value={item}>{ideaStatusLabel(item)}</option>)}
            </select>
          </label>
          <button className="button button-secondary" type="submit">Filtrar</button>
        </form>

        {error ? (
          <p className="alert alert-error" role="alert">Não foi possível carregar as ideias. Confira se a migração 20261104_platform_list_ideas foi aplicada.</p>
        ) : !rows.length ? (
          <p className="empty-inline">Nenhuma ideia encontrada.</p>
        ) : (
          <>
            <AdminIdeasTable ideas={rows} showCompany={!org} />
            <p className="muted small-copy">
              {rows.length === LIST_LIMIT ? `Mostrando as ${LIST_LIMIT} mais recentes. Use os filtros para refinar.` : `${rows.length} ${rows.length === 1 ? "ideia" : "ideias"}.`}
            </p>
          </>
        )}
      </section>
    </AdminShell>
  );
}
