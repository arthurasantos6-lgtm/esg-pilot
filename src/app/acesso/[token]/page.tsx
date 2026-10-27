import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { joinWithLink, leaveAndReturn } from "@/app/acesso/actions";
import { SubmitButton } from "@/app/components/submit-button";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Acesso do colaborador", robots: { index: false, follow: false } };

function Brand() {
  return (
    <div className="brand auth-brand">
      <span className="brand-mark" aria-hidden="true">C</span>
      <span>copiloto<span className="brand-accent">ESG</span></span>
    </div>
  );
}

function InvalidLink() {
  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="link-title">
        <Brand />
        <p className="eyebrow">ACESSO DO COLABORADOR</p>
        <h1 id="link-title">Link indisponível</h1>
        <p className="muted">Este link é inválido, expirou ou foi desativado. Peça um novo link à gestão da sua empresa.</p>
      </section>
    </main>
  );
}

export default async function AccessLinkPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  await connection();
  if (!isSupabaseConfigured()) redirect("/setup");
  const [{ token }, { error }] = await Promise.all([params, searchParams]);
  if (!/^[0-9a-f]{64}$/.test(token)) return <InvalidLink />;

  const supabase = await createClient();
  const { data: links } = await supabase.rpc("get_access_link_public", { p_token: token });
  const link = links?.[0];
  if (!link) return <InvalidLink />;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  let otherOrganization = false;
  if (user) {
    const { data: membership } = await supabase
      .from("memberships")
      .select("organization_id, status")
      .eq("user_id", user.id)
      .maybeSingle();
    if (membership?.organization_id === link.organization_id && membership.status === "active") {
      redirect("/dashboard");
    }
    otherOrganization = Boolean(membership && membership.organization_id !== link.organization_id);
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="link-title">
        <Brand />
        <p className="eyebrow">ACESSO DO COLABORADOR</p>
        <h1 id="link-title">{link.organization_name}</h1>
        <p className="muted">
          Compartilhe ideias de melhoria com a sua empresa. Um copiloto ajuda a organizar a proposta e a identificar
          possíveis impactos ambientais, sociais e de governança.
        </p>
        {error && <p className="alert alert-error" role="alert">{error}</p>}

        {otherOrganization ? (
          <form className="form-stack" action={leaveAndReturn}>
            <input type="hidden" name="token" value={token} />
            <p className="alert alert-info">
              Este navegador está conectado a outra empresa. Para usar este link, saia do acesso atual. Você não verá mais
              as ideias da outra empresa neste navegador.
            </p>
            <SubmitButton className="button button-secondary button-full" pendingLabel="Saindo…">
              Sair do acesso atual
            </SubmitButton>
          </form>
        ) : (
          <form className="form-stack" action={joinWithLink}>
            <input type="hidden" name="token" value={token} />
            <SubmitButton className="button button-primary button-full" pendingLabel="Entrando…">
              Entrar como colaborador
            </SubmitButton>
          </form>
        )}

        <ul className="auth-footnote link-notes">
          <li>Não é preciso cadastro. Seu acesso fica salvo neste navegador.</li>
          <li>Use sempre o mesmo navegador para acompanhar suas ideias. Se limpar os dados do navegador, o acesso às ideias já enviadas é perdido (elas continuam com a empresa).</li>
          <li>Não inclua dados pessoais ou informações confidenciais nas ideias.</li>
        </ul>
      </section>
    </main>
  );
}
