import Link from "next/link";
import type { requireCompanyContext } from "@/lib/auth";
import { ideaStatusLabel, nextStepForAuthor } from "@/lib/idea-status";

type Supabase = Awaited<ReturnType<typeof requireCompanyContext>>["supabase"];

const tips = [
  "Conte o que acontece hoje: onde, com que frequência e quem é afetado.",
  "Diga o que você imagina como solução, mesmo que ainda não esteja completa.",
  "Explique o benefício esperado (menos desperdício, mais segurança, processo mais claro…).",
  "Se souber, informe números reais. Se não souber, tudo bem: não invente.",
  "Não inclua nomes de colegas, dados pessoais ou informações confidenciais.",
];

export async function CollaboratorHome({
  supabase,
  userId,
  organizationName,
  aiAvailable,
  welcome,
  canCreate,
}: {
  supabase: Supabase;
  userId: string;
  organizationName: string;
  aiAvailable: boolean;
  welcome: boolean;
  /** Só colaboradores que entraram pelo link podem enviar ideias. */
  canCreate: boolean;
}) {
  const { data: ideas, error } = await supabase
    .from("ideas")
    .select("id, title, status, created_at, submitted_at")
    .eq("author_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);
  if (error) throw new Error(`Não foi possível carregar suas ideias: ${error.message}`);

  const rows = ideas ?? [];
  const pending = rows.filter((idea) => idea.status === "awaiting_info" || idea.status === "draft");
  const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

  return (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">{organizationName.toUpperCase()}</p>
          <h1>Olá! Que bom ter você aqui.</h1>
          <p className="muted">
            Este é o espaço para compartilhar ideias que melhorem o trabalho, o meio ambiente, as pessoas e a forma como a
            empresa é gerida. {aiAvailable ? "Um copiloto de IA ajuda você a organizar a proposta antes de enviar." : ""}
          </p>
        </div>
        {canCreate && <Link className="button button-primary" href="/ideas/new">＋ Enviar uma ideia</Link>}
      </header>

      {!canCreate && (
        <p className="alert alert-info" role="status">
          O envio de ideias é feito pelo link de acesso da empresa. Peça o link à gestão e abra-o neste navegador.
        </p>
      )}

      {welcome && (
        <p className="alert alert-success" role="status">
          Acesso liberado. Use sempre este navegador para acompanhar suas ideias.
        </p>
      )}

      {pending.length > 0 && (
        <section className="panel" aria-labelledby="pending-title">
          <p className="eyebrow">PARA VOCÊ FAZER</p>
          <h2 id="pending-title">Pendências</h2>
          <ul className="home-list">
            {pending.map((idea) => (
              <li key={idea.id}>
                <div>
                  <strong>{idea.title}</strong>
                  <p className="small-copy muted">{nextStepForAuthor(idea.status)}</p>
                </div>
                <Link
                  className="button button-secondary button-small"
                  href={idea.status === "draft" ? `/ideas/${idea.id}/review` : `/ideas/${idea.id}#feedback`}
                >
                  {idea.status === "draft" ? "Continuar" : "Responder"}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="dashboard-grid">
        <section className="panel" aria-labelledby="my-ideas-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">ACOMPANHAMENTO</p>
              <h2 id="my-ideas-title">Minhas ideias</h2>
            </div>
            {rows.length > 0 && <Link className="text-link" href="/ideas">Ver todas <span aria-hidden="true">→</span></Link>}
          </div>
          {!rows.length ? (
            <div className="empty-state">
              <span className="empty-icon" aria-hidden="true">✳</span>
              <h3>Você ainda não enviou ideias</h3>
              <p className="muted">Comece com poucas linhas. {aiAvailable ? "O copiloto ajuda a completar." : "Você pode completar depois."}</p>
              {canCreate && <Link className="button button-secondary" href="/ideas/new">Enviar minha primeira ideia</Link>}
            </div>
          ) : (
            <ul className="home-list">
              {rows.slice(0, 8).map((idea) => (
                <li key={idea.id}>
                  <div>
                    <Link className="idea-title-link" href={idea.status === "draft" ? `/ideas/${idea.id}/review` : `/ideas/${idea.id}`}>
                      {idea.title}
                    </Link>
                    <p className="small-copy muted">
                      {idea.submitted_at ? `Enviada em ${dateFormat.format(new Date(idea.submitted_at))}` : "Ainda não enviada"} ·{" "}
                      {nextStepForAuthor(idea.status)}
                    </p>
                  </div>
                  <span className={`status-badge status-badge-${idea.status}`}>{ideaStatusLabel(idea.status)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="info-card">
          <span className="info-icon" aria-hidden="true">✎</span>
          <h2>Como escrever uma boa proposta</h2>
          <ul className="tips-list">
            {tips.map((tip) => <li key={tip}>{tip}</li>)}
          </ul>
          <p className="small-copy">
            A avaliação ESG é uma recomendação para apoiar a gestão. Quem decide são as pessoas da empresa.
          </p>
        </aside>
      </div>
    </>
  );
}
