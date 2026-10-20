import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";

type AppShellProps = {
  children: ReactNode;
  organizationName: string;
  userEmail: string;
  role: "company_admin" | "member";
};

export function AppShell({
  children,
  organizationName,
  userEmail,
  role,
}: AppShellProps) {
  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Navegação principal">
        <Link className="brand" href="/dashboard" aria-label="Copiloto ESG, início">
          <span className="brand-mark" aria-hidden="true">C</span>
          <span>copiloto<span className="brand-accent">ESG</span></span>
        </Link>
        <div className="workspace-label">ESPAÇO DE TRABALHO</div>
        <div className="organization-chip">
          <span className="organization-dot" aria-hidden="true" />
          <span>{organizationName}</span>
        </div>
        <nav className="main-nav">
          <Link href="/dashboard"><span aria-hidden="true">▦</span> Visão geral</Link>
          <Link href="/ideas"><span aria-hidden="true">◎</span> Ideias</Link>
          <Link href="/projects"><span aria-hidden="true">⌁</span> Projetos</Link>
          <Link href="/ideas/new"><span aria-hidden="true">＋</span> Nova ideia</Link>
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
