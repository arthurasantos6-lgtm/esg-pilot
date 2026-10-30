import Link from "next/link";
import { signOut } from "@/app/actions";
import { BrandMark } from "@/app/components/brand-mark";

export default async function AccessPendingPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="pending-title">
        <BrandMark />
        <p className="eyebrow">ACESSO À ORGANIZAÇÃO</p>
        <h1 id="pending-title">
          {status === "inactive"
            ? "Ambiente indisponível"
            : status === "forbidden"
              ? "Acesso restrito"
              : "Acesso pendente"}
        </h1>
        <p className="muted">
          {status === "inactive"
            ? "O ambiente da sua organização está suspenso ou inativo. Fale com o administrador responsável."
            : status === "forbidden"
              ? "Esse recurso é restrito a administradores da plataforma."
              : "Sua conta ainda não está vinculada a uma organização ativa. Peça ao administrador para liberar seu acesso."}
        </p>
        <div className="pending-actions">
          <Link href="/login" className="text-link">Voltar</Link>
          <form action={signOut}><button className="button button-secondary" type="submit">Sair da conta</button></form>
        </div>
      </section>
    </main>
  );
}
