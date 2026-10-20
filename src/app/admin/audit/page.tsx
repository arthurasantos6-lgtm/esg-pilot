import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Auditoria administrativa" };

const actionLabels: Record<string, string> = {
  organization_created: "Empresa criada",
  organization_updated: "Empresa atualizada",
  membership_created: "Usuário vinculado",
  membership_updated: "Vínculo atualizado",
};

export default async function AdminAuditPage() {
  await connection();
  const { supabase, user } = await requirePlatformAdmin();
  const { data: entries, error } = await supabase
    .from("platform_audit_log")
    .select("id, action, target_type, target_id, details, created_at")
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) throw new Error(`Não foi possível carregar a auditoria: ${error.message}`);

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <p className="eyebrow">RASTREABILIDADE</p>
          <h1>Auditoria administrativa</h1>
          <p className="muted">Histórico das últimas 100 alterações administrativas em empresas e vínculos de usuários.</p>
        </div>
      </header>

      <section className="panel list-panel">
        {!entries?.length ? (
          <div className="empty-state list-empty">
            <span className="empty-icon" aria-hidden="true">☰</span>
            <h2>Nenhum registro de auditoria ainda</h2>
            <p className="muted">Ações administrativas aparecerão aqui assim que forem realizadas.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">Ação</th>
                  <th scope="col">Alvo</th>
                  <th scope="col">Detalhes</th>
                  <th scope="col">Data</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td>{actionLabels[entry.action] ?? entry.action}</td>
                    <td>{entry.target_type === "organization" ? "Empresa" : "Vínculo de usuário"}</td>
                    <td className="table-subtitle">{entry.details ? JSON.stringify(entry.details) : "—"}</td>
                    <td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(entry.created_at))}</td>
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
