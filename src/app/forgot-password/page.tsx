import Link from "next/link";
import { requestPasswordReset } from "@/app/actions";
import { BrandMark } from "@/app/components/brand-mark";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; sent?: string }>;
}) {
  const { error, sent } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="recovery-title">
        <Link className="brand auth-brand" href="/login">
          <BrandMark />
          <span>copiloto<span className="brand-accent">ESG</span></span>
        </Link>
        <p className="eyebrow">RECUPERAÇÃO DE ACESSO</p>
        <h1 id="recovery-title">Esqueceu a senha?</h1>
        <p className="muted">Informe seu e-mail corporativo para receber um link de redefinição.</p>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        {sent ? (
          <p className="alert alert-success" role="status">
            Se houver uma conta associada a esse e-mail, enviaremos as instruções de recuperação.
          </p>
        ) : (
          <form className="form-stack" action={requestPasswordReset}>
            <label htmlFor="email">E-mail corporativo</label>
            <input autoComplete="email" id="email" name="email" type="email" required />
            <button className="button button-primary button-full" type="submit">Enviar link de recuperação</button>
          </form>
        )}
        <p className="auth-footnote"><Link className="text-link" href="/login">Voltar para entrar</Link></p>
      </section>
    </main>
  );
}
