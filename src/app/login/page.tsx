import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { signIn } from "@/app/actions";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";
import { BrandMark, BrandWordmark } from "@/app/components/brand-mark";

export const metadata: Metadata = { title: "Entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; passwordUpdated?: string }>;
}) {
  await connection();
  if (!isSupabaseConfigured()) redirect("/setup");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (user) redirect("/dashboard");

  const { error, passwordUpdated } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="login-title">
        <Link className="brand auth-brand" href="/">
          <BrandMark />
          <BrandWordmark />
        </Link>
        <p className="eyebrow">SEU ESPAÇO DE TRABALHO</p>
        <h1 id="login-title">Boas-vindas</h1>
        <p className="muted">Entre para acompanhar e desenvolver ideias de impacto.</p>
        {passwordUpdated && <p className="alert alert-success" role="status">Senha atualizada. Entre com sua nova senha.</p>}
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <form className="form-stack" action={signIn}>
          <label htmlFor="email">E-mail corporativo</label>
          <input autoComplete="username" id="email" name="email" type="email" required />
          <label htmlFor="password">Senha</label>
          <input autoComplete="current-password" id="password" name="password" type="password" required />
          <Link className="text-link recovery-link" href="/forgot-password">Esqueci minha senha</Link>
          <button className="button button-primary button-full" type="submit">Entrar na plataforma</button>
        </form>
        <p className="auth-footnote">Acesso para a gestão, fornecido pelo administrador da plataforma. Colaboradores entram pelo link enviado pela empresa, sem senha.</p>
      </section>
    </main>
  );
}
