import { redirect } from "next/navigation";
import { connection } from "next/server";
import { updatePassword } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";
import { BrandMark } from "@/app/components/brand-mark";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/forgot-password?error=O%20link%20expirou.%20Solicite%20uma%20nova%20recupera%C3%A7%C3%A3o.");
  const { error } = await searchParams;

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="reset-title">
        <BrandMark />
        <p className="eyebrow">NOVA SENHA</p>
        <h1 id="reset-title">Redefina sua senha</h1>
        <p className="muted">Use pelo menos 12 caracteres e evite reutilizar uma senha antiga.</p>
        {error && <p className="alert alert-error" role="alert">{error}</p>}
        <form className="form-stack" action={updatePassword}>
          <label htmlFor="password">Nova senha</label>
          <input autoComplete="new-password" id="password" name="password" type="password" minLength={12} required />
          <label htmlFor="confirmPassword">Confirmar nova senha</label>
          <input autoComplete="new-password" id="confirmPassword" name="confirmPassword" type="password" minLength={12} required />
          <button className="button button-primary button-full" type="submit">Atualizar senha</button>
        </form>
      </section>
    </main>
  );
}
