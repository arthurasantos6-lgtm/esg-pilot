import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { AppShell } from "@/app/components/app-shell";
import { CollaboratorHome } from "@/app/dashboard/collaborator-home";
import { ManagerDashboard } from "@/app/dashboard/manager-dashboard";
import { parseEnabledModules, requireCompanyContext } from "@/lib/auth";
import { parsePeriod } from "@/lib/dashboard-metrics";
import { isAiAvailable } from "@/lib/idea-ai";
import { canCreateIdeas } from "@/lib/idea-permissions";

export const metadata: Metadata = { title: "Visão geral" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{
    moduleDisabled?: string;
    error?: string;
    welcome?: string;
    period?: string;
    status?: string;
    dimension?: string;
    area?: string;
  }>;
}) {
  await connection();
  const { supabase, user, membership, organization } = await requireCompanyContext();
  const query = await searchParams;
  const enabledModules = parseEnabledModules(organization.enabled_modules);
  const isManager = membership.role === "company_admin";

  return (
    <AppShell organizationName={organization.name} userEmail={user.email} membership={membership} enabledModules={enabledModules}>
      {query.moduleDisabled && (
        <p className="alert alert-error" role="alert">
          O módulo &quot;{query.moduleDisabled}&quot; não está habilitado para a sua organização. Fale com o administrador da plataforma.
        </p>
      )}
      {query.error && <p className="alert alert-error" role="alert">{query.error}</p>}

      {isManager ? (
        <>
          <header className="page-header">
            <div>
              <p className="eyebrow">PAINEL ESG DA EMPRESA</p>
              <h1>Visão geral</h1>
              <p className="muted">Ideias recebidas, avaliação, decisões e resultados registrados pela sua empresa.</p>
            </div>
            <Link className="button button-primary" href="/ideas">Analisar ideias</Link>
          </header>
          <ManagerDashboard
            supabase={supabase}
            organizationId={membership.organization_id}
            period={parsePeriod(query.period)}
            filters={{
              status: query.status || undefined,
              dimension: query.dimension || undefined,
              area: query.area || undefined,
            }}
            projectsEnabled={enabledModules.includes("projects")}
          />
        </>
      ) : (
        <CollaboratorHome
          supabase={supabase}
          userId={user.id}
          organizationName={organization.name}
          aiAvailable={isAiAvailable()}
          welcome={Boolean(query.welcome)}
          canCreate={canCreateIdeas(membership)}
        />
      )}
    </AppShell>
  );
}
