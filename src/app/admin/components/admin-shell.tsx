import Link from "next/link";
import type { ReactNode } from "react";
import { signOut } from "@/app/actions";
import { BrandMark, BrandWordmark } from "@/app/components/brand-mark";

type AdminShellProps = {
  children: ReactNode;
  userEmail: string;
};

export function AdminShell({ children, userEmail }: AdminShellProps) {
  return (
    <div className="app-frame">
      <aside className="sidebar" aria-label="Navegação administrativa">
        <Link className="brand" href="/admin" aria-label="NUEVO ESG, administração da plataforma">
          <BrandMark />
          <BrandWordmark />
        </Link>
        <div className="workspace-label">ADMINISTRAÇÃO DA PLATAFORMA</div>
        <div className="organization-chip">
          <span className="organization-dot" aria-hidden="true" />
          <span>Visão da fornecedora</span>
        </div>
        <nav className="main-nav">
          <Link href="/admin"><span aria-hidden="true">▦</span> Visão geral</Link>
          <Link href="/admin/companies"><span aria-hidden="true">🏢</span> Empresas clientes</Link>
          <Link href="/admin/ideas"><span aria-hidden="true">✎</span> Ideias</Link>
          <Link href="/admin/esg-criteria"><span aria-hidden="true">⌁</span> Critérios ESG</Link>
          <Link href="/admin/knowledge"><span aria-hidden="true">◎</span> Base de conhecimento</Link>
          <Link href="/admin/esg-engine"><span aria-hidden="true">⚙</span> Motor ESG local</Link>
          <Link href="/admin/audit"><span aria-hidden="true">☰</span> Auditoria</Link>
        </nav>
        <div className="sidebar-bottom">
          <p className="role-label">Administrador da plataforma</p>
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
