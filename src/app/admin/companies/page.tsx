import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Empresas clientes" };

const statusLabels: Record<string, string> = {
  trial: "Em implantação",
  active: "Ativa",
  suspended: "Suspensa",
  inactive: "Inativa",
};

export default async function AdminCompaniesPage() {
  await connection();
  const { supabase, user } = await requirePlatformAdmin();
  const { data: organizations, error } = await supabase.rpc("platform_list_organizations");

  if (error) {
    throw new Error(`Não foi possível carregar as empresas: ${error.message}`);
  }

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <p className="eyebrow">GESTÃO DE CLIENTES</p>
          <h1>Empresas clientes</h1>
          <p className="muted">Cadastre, acompanhe e administre o acesso de cada empresa cliente.</p>
        </div>
        <Link className="button button-primary" href="/admin/companies/new">＋ Nova empresa</Link>
      </header>

      <section className="panel list-panel">
        {!organizations?.length ? (
          <div className="empty-state list-empty">
            <span className="empty-icon" aria-hidden="true">🏢</span>
            <h2>Nenhuma empresa cadastrada</h2>
            <p className="muted">Cadastre a primeira empresa cliente para começar.</p>
            <Link className="button button-secondary" href="/admin/companies/new">Cadastrar empresa</Link>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Empresa</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Usuários ativos</th>
                  <th scope="col">Ideias</th>
                  <th scope="col">Projetos</th>
                  <th scope="col"><span className="sr-only">Abrir empresa</span></th>
                </tr>
              </thead>
              <tbody>
                {organizations.map((org) => (
                  <tr key={org.id}>
                    <td>
                      <Link className="idea-title-link" href={`/admin/companies/${org.id}`}>
                        {org.display_name || org.name}
                      </Link>
                      {org.sector && <span className="table-subtitle">{org.sector}</span>}
                    </td>
                    <td><span className={`status-badge status-badge-${org.status}`}>{statusLabels[org.status] ?? org.status}</span></td>
                    <td>{org.member_count}</td>
                    <td>{org.idea_count}</td>
                    <td>{org.project_count}</td>
                    <td><Link className="row-link" href={`/admin/companies/${org.id}`} aria-label={`Abrir ${org.name}`}>→</Link></td>
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
