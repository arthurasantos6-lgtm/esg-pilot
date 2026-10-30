import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { canCreateIdeas } from "@/lib/idea-permissions";
import { BrandMark, BrandWordmark } from "@/app/components/brand-mark";

type AppShellProps = {
  children: ReactNode;
  organizationName: string;
  userEmail?: string | null;
  membership: { role: "company_admin" | "member"; access_link_id: string | null };
  enabledModules?: string[];
};

export function AppShell({
  children,
  organizationName,
  userEmail,
  membership,
  enabledModules,
}: AppShellProps) {
  const role = membership.role;
  const isModuleEnabled = (moduleKey: string) =>
    !enabledModules || enabledModules.includes(moduleKey);

  // Colaborador por link: só o envio da ideia, sem painel nem menu.
  if (canCreateIdeas(membership)) {
    return (
      <div className="collab-frame">
        <header className="collab-header">
          <Link className="brand" href="/ideas/new" aria-label="NUEVO ESG, nova ideia">
            <BrandMark />
            <BrandWordmark />
          </Link>
          <span className="collab-organization">{organizationName}</span>
          <form action={signOut}>
            <button className="signout-button" type="submit">Sair</button>
          </form>
        </header>
        <main className="collab-main">{children}</main>
      </div>
    );
  }

  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Navegação principal">
        <Link className="brand" href="/dashboard" aria-label="NUEVO ESG, início">
          <BrandMark />
          <BrandWordmark />
        </Link>
        <div className="workspace-label">ESPAÇO DE TRABALHO</div>
        <div className="organization-chip">
          <span className="organization-dot" aria-hidden="true" />
          <span>{organizationName}</span>
        </div>
        <nav className="main-nav">
          {role === "company_admin" && (
            <Link href="/dashboard"><span aria-hidden="true">▦</span> Visão geral</Link>
          )}
          {isModuleEnabled("ideas") && (
            <Link href="/ideas"><span aria-hidden="true">◎</span> {role === "company_admin" ? "Ideias" : "Minhas ideias"}</Link>
          )}
          {role === "company_admin" && isModuleEnabled("projects") && (
            <Link href="/projects"><span aria-hidden="true">⌁</span> Projetos</Link>
          )}
          {role === "company_admin" && (
            <Link href="/equipe"><span aria-hidden="true">⚇</span> Equipe e acesso</Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <p className="role-label">{role === "company_admin" ? "Administrador da empresa" : "Colaborador"}</p>
          <p className="user-email">{userEmail}</p>
          <form action={signOut}>
            <button className="signout-button" type="submit">Encerrar sessão</button>
          </form>
        </div>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
