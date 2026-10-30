import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { canCreateIdeas } from "@/lib/idea-permissions";
import { BrandMark } from "@/app/components/brand-mark";

type AppShellProps = {
  children: ReactNode;
  organizationName: string;
  /** Ausente para colaboradores que entraram pelo link da empresa (sessão anônima). */
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

  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Navegação principal">
        <Link className="brand" href="/dashboard" aria-label="Copiloto ESG, início">
          <BrandMark />
          <span>copiloto<span className="brand-accent">ESG</span></span>
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
          {isModuleEnabled("ideas") && canCreateIdeas(membership) && (
            <Link href="/ideas/new"><span aria-hidden="true">＋</span> Nova ideia</Link>
          )}
          {role === "company_admin" && (
            <Link href="/equipe"><span aria-hidden="true">⚇</span> Equipe e acesso</Link>
          )}
        </nav>
        <div className="sidebar-bottom">
          <p className="role-label">{role === "company_admin" ? "Administrador da empresa" : "Colaborador"}</p>
          <p className="user-email">{userEmail ?? "Acesso pelo link da empresa"}</p>
          <form action={signOut}>
            <button className="signout-button" type="submit">Encerrar sessão</button>
          </form>
          {!userEmail && (
            <p className="small-copy signout-warning">
              Para voltar depois, abra o link da empresa neste mesmo navegador.
            </p>
          )}
        </div>
      </aside>
      <main className="main-panel">{children}</main>
    </div>
  );
}
