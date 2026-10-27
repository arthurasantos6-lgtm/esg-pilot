import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { AccessLinksPanel } from "@/app/components/access-links-panel";
import { AppShell } from "@/app/components/app-shell";
import { SubmitButton } from "@/app/components/submit-button";
import { createCompanyAccessLink, revokeCompanyAccessLink, setCollaboratorStatus } from "@/app/equipe/actions";
import { parseEnabledModules, requireCompanyContext } from "@/lib/auth";
import { memberDisplayName } from "@/lib/members";

export const metadata: Metadata = { title: "Equipe e acesso" };

export default async function TeamPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; linkCreated?: string; linkRevoked?: string; memberUpdated?: string }>;
}) {
  await connection();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  if (membership.role !== "company_admin") redirect("/dashboard");
  const query = await searchParams;

  const [{ data: links, error: linksError }, { data: members, error: membersError }] = await Promise.all([
    supabase
      .from("organization_access_links")
      .select("id, token, label, status, expires_at, created_at, last_used_at, join_count")
      .eq("organization_id", membership.organization_id)
      .order("created_at", { ascending: false }),
    supabase.rpc("org_list_members", { target_org_id: membership.organization_id }),
  ]);
  if (linksError) throw new Error(`Não foi possível carregar os links: ${linksError.message}`);
  if (membersError) throw new Error(`Não foi possível carregar a equipe: ${membersError.message}`);

  const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

  return (
    <AppShell
      organizationName={organization.name}
      userEmail={user.email}
      membership={membership}
      enabledModules={parseEnabledModules(organization.enabled_modules)}
    >
      <header className="page-header">
        <div>
          <p className="eyebrow">GESTÃO DA EMPRESA</p>
          <h1>Equipe e acesso</h1>
          <p className="muted">Gere links de acesso para os colaboradores e acompanhe quem está vinculado à empresa.</p>
        </div>
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      {query.linkCreated && <p className="alert alert-success" role="status">Link gerado. Copie e compartilhe por um canal interno.</p>}
      {query.linkRevoked && <p className="alert alert-success" role="status">Link revogado. Ninguém mais consegue entrar por ele.</p>}
      {query.memberUpdated && <p className="alert alert-success" role="status">Acesso do colaborador atualizado.</p>}

      <AccessLinksPanel
        links={links ?? []}
        organizationId={membership.organization_id}
        createAction={createCompanyAccessLink}
        revokeAction={revokeCompanyAccessLink}
      />

      <section className="panel list-panel" aria-labelledby="members-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">PESSOAS VINCULADAS</p>
            <h2 id="members-title">Membros da empresa</h2>
          </div>
        </div>
        <p className="muted small-copy">
          Colaboradores que entraram por link não têm e-mail cadastrado. Bloquear um colaborador encerra o acesso dele às
          ideias pela plataforma; as ideias enviadas continuam com a empresa.
        </p>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Pessoa</th>
                <th scope="col">Perfil</th>
                <th scope="col">Situação</th>
                <th scope="col">Desde</th>
                <th scope="col"><span className="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {(members ?? []).map((member) => (
                <tr key={member.user_id}>
                  <td>
                    {memberDisplayName(member)}
                    {member.user_id === user.id && <span className="table-subtitle">Você</span>}
                  </td>
                  <td>{member.role === "company_admin" ? "Gestão" : member.via_link ? "Colaborador (link)" : "Colaborador"}</td>
                  <td>
                    <span className={`status-badge status-badge-${member.status === "active" ? "active" : "suspended"}`}>
                      {member.status === "active" ? "Ativo" : "Bloqueado"}
                    </span>
                  </td>
                  <td>{dateFormat.format(new Date(member.created_at))}</td>
                  <td>
                    {member.role === "member" && member.user_id !== user.id && (
                      <form action={setCollaboratorStatus}>
                        <input type="hidden" name="userId" value={member.user_id} />
                        <input type="hidden" name="status" value={member.status === "active" ? "blocked" : "active"} />
                        <SubmitButton className="button button-secondary button-small" pendingLabel="Salvando…">
                          {member.status === "active" ? "Bloquear" : "Reativar"}
                        </SubmitButton>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </AppShell>
  );
}
