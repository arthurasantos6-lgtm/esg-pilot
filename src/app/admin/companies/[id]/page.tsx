import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { z } from "zod";
import {
  addMembership,
  createPlatformAccessLink,
  revokePlatformAccessLink,
  updateMembership,
  updateOrganization,
} from "@/app/admin/actions";
import { AccessLinksPanel } from "@/app/components/access-links-panel";
import { AdminIdeasTable } from "@/app/admin/components/admin-ideas-table";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";
import { memberDisplayName } from "@/lib/members";

export const metadata: Metadata = { title: "Detalhe da empresa" };

const roleLabels: Record<string, string> = {
  company_admin: "Administrador da empresa",
  member: "Colaborador",
};

const membershipStatusLabels: Record<string, string> = {
  active: "Ativo",
  blocked: "Bloqueado",
};

export default async function CompanyDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    updated?: string;
    memberAdded?: string;
    memberUpdated?: string;
    linkCreated?: string;
    linkRevoked?: string;
  }>;
}) {
  await connection();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  if (!z.guid().safeParse(id).success) notFound();

  const { supabase, user } = await requirePlatformAdmin();
  const [{ data: organization, error: orgError }, { data: members, error: membersError }, { data: links }, { data: ideas, error: ideasError }] =
    await Promise.all([
      supabase.from("organizations").select("*").eq("id", id).maybeSingle(),
      supabase.rpc("platform_list_organization_members", { target_org_id: id }),
      supabase
        .from("organization_access_links")
        .select("id, token, label, status, expires_at, created_at, last_used_at, join_count")
        .eq("organization_id", id)
        .order("created_at", { ascending: false }),
      supabase.rpc("platform_list_ideas", { p_organization_id: id, p_status: null, p_limit: 500 }),
    ]);

  if (orgError) throw new Error(`Não foi possível carregar a empresa: ${orgError.message}`);
  if (!organization) notFound();
  if (membersError) throw new Error(`Não foi possível carregar os usuários: ${membersError.message}`);

  const enabledModules = Array.isArray(organization.enabled_modules)
    ? organization.enabled_modules.filter((item): item is string => typeof item === "string")
    : [];

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <Link className="back-link" href="/admin/companies">← Voltar para empresas</Link>
          <p className="eyebrow">EMPRESA CLIENTE</p>
          <h1>{organization.display_name || organization.name}</h1>
          <p className="muted">Gerencie os dados, a situação da conta, os módulos habilitados e os usuários vinculados.</p>
        </div>
      </header>

      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}
      {query.updated && <p className="alert alert-success" role="status">Empresa atualizada com sucesso.</p>}
      {query.memberAdded && <p className="alert alert-success" role="status">Usuário vinculado com sucesso.</p>}
      {query.memberUpdated && <p className="alert alert-success" role="status">Vínculo atualizado com sucesso.</p>}
      {query.linkCreated && <p className="alert alert-success" role="status">Link de acesso gerado.</p>}
      {query.linkRevoked && <p className="alert alert-success" role="status">Link de acesso revogado.</p>}

      <div className="dashboard-grid">
        <section className="panel idea-form-panel" aria-labelledby="org-form-title">
          <h2 id="org-form-title">Dados e configuração</h2>
          <form className="idea-form" action={updateOrganization}>
            <input type="hidden" name="organizationId" value={organization.id} />
            <label htmlFor="name">Nome da empresa <span aria-hidden="true">*</span></label>
            <input id="name" name="name" type="text" minLength={2} maxLength={160} required defaultValue={organization.name} />

            <label htmlFor="displayName">Nome de exibição</label>
            <input id="displayName" name="displayName" type="text" maxLength={160} defaultValue={organization.display_name ?? ""} />

            <label htmlFor="sector">Segmento</label>
            <input id="sector" name="sector" type="text" maxLength={100} defaultValue={organization.sector ?? ""} />

            <label htmlFor="companySize">Porte</label>
            <input id="companySize" name="companySize" type="text" maxLength={100} defaultValue={organization.company_size ?? ""} />

            <label htmlFor="status">Situação da conta</label>
            <select id="status" name="status" defaultValue={organization.status}>
              <option value="trial">Em implantação</option>
              <option value="active">Ativa</option>
              <option value="suspended">Suspensa</option>
              <option value="inactive">Inativa</option>
            </select>

            <fieldset className="module-fieldset">
              <legend>Módulos habilitados</legend>
              <label className="checkbox-row">
                <input type="checkbox" name="modules" value="ideas" defaultChecked={enabledModules.includes("ideas")} />
                <span>Ideias (registro e triagem ESG)</span>
              </label>
              <label className="checkbox-row">
                <input type="checkbox" name="modules" value="projects" defaultChecked={enabledModules.includes("projects")} />
                <span>Projetos ESG (planejamento e indicadores)</span>
              </label>
            </fieldset>

            <div className="form-actions">
              <button className="button button-primary" type="submit">Salvar alterações</button>
            </div>
          </form>
        </section>

        <section className="panel" aria-labelledby="add-member-title">
          <h2 id="add-member-title">Vincular gestor da empresa</h2>
          <p className="muted small-copy">
            O usuário precisa já existir em Authentication &gt; Users no Supabase. Informe o e-mail cadastrado lá.
          </p>
          <form className="idea-form" action={addMembership}>
            <input type="hidden" name="organizationId" value={organization.id} />
            <label htmlFor="email">E-mail do usuário <span aria-hidden="true">*</span></label>
            <input id="email" name="email" type="email" required placeholder="usuario@empresa.com" />
            <input type="hidden" name="role" value="company_admin" />
            <p className="field-hint">
              O usuário será vinculado como <strong>gestão da empresa</strong>. Colaboradores não usam conta com e-mail: entram
              pelo link de acesso abaixo.
            </p>
            <div className="form-actions">
              <button className="button button-primary" type="submit">Vincular usuário</button>
            </div>
          </form>
        </section>
      </div>

      <AccessLinksPanel
        links={links ?? []}
        organizationId={organization.id}
        createAction={createPlatformAccessLink}
        revokeAction={revokePlatformAccessLink}
      />

      <section className="panel list-panel" aria-labelledby="company-ideas-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">IDEIAS DA EMPRESA</p>
            <h2 id="company-ideas-title">Ideias enviadas</h2>
          </div>
          {!ideasError && <span className="subtle-tag">{ideas?.length ?? 0}</span>}
        </div>
        <p className="muted small-copy">Lista resumida. O texto da ideia, a análise e quem enviou ficam só com a empresa.</p>
        {ideasError ? (
          <p className="alert alert-error" role="alert">Não foi possível carregar as ideias. Confira se a migração 20261104_platform_list_ideas foi aplicada.</p>
        ) : ideas?.length ? (
          <AdminIdeasTable ideas={ideas} showCompany={false} />
        ) : (
          <p className="empty-inline">Esta empresa ainda não recebeu ideias.</p>
        )}
      </section>

      <section className="panel list-panel" aria-labelledby="members-title">
        <div className="panel-heading">
          <div>
            <p className="eyebrow">USUÁRIOS DA EMPRESA</p>
            <h2 id="members-title">Usuários vinculados</h2>
          </div>
        </div>
        {!members?.length ? (
          <div className="empty-state list-empty">
            <span className="empty-icon" aria-hidden="true">◎</span>
            <h3>Nenhum usuário vinculado ainda</h3>
            <p className="muted">Vincule o primeiro usuário usando o formulário acima.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th scope="col">E-mail</th>
                  <th scope="col">Perfil</th>
                  <th scope="col">Situação</th>
                  <th scope="col">Vinculado em</th>
                  <th scope="col"><span className="sr-only">Atualizar</span></th>
                </tr>
              </thead>
              <tbody>
                {members.map((member) => (
                  <tr key={member.id}>
                    <td>{memberDisplayName(member)}</td>
                    <td>{roleLabels[member.role] ?? member.role}</td>
                    <td><span className={`status-badge status-badge-${member.status === "active" ? "approved" : "rejected"}`}>{membershipStatusLabels[member.status] ?? member.status}</span></td>
                    <td>{new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" }).format(new Date(member.created_at))}</td>
                    <td>
                      <form className="inline-form" action={updateMembership}>
                        <input type="hidden" name="membershipId" value={member.id} />
                        <input type="hidden" name="organizationId" value={organization.id} />
                        <select name="role" defaultValue={member.role} aria-label={`Perfil de ${memberDisplayName(member)}`}>
                          <option value="member">Colaborador</option>
                          <option value="company_admin">Administrador</option>
                        </select>
                        <select name="status" defaultValue={member.status} aria-label={`Situação de ${memberDisplayName(member)}`}>
                          <option value="active">Ativo</option>
                          <option value="blocked">Bloqueado</option>
                        </select>
                        <button className="button button-small button-secondary" type="submit">Salvar</button>
                      </form>
                    </td>
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
