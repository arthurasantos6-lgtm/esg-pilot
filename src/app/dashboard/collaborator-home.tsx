import Link from "next/link";
import type { requireCompanyContext } from "@/lib/auth";
import { ideaStatusLabel, nextStepForAuthor } from "@/lib/idea-status";

type Supabase = Awaited<ReturnType<typeof requireCompanyContext>>["supabase"];

export async function CollaboratorHome({
  supabase,
  userId,
  organizationName,
  canCreate,
}: {
  supabase: Supabase;
  userId: string;
  organizationName: string;
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
          <h1>Suas ideias</h1>
        </div>
        {canCreate && <Link className="button button-primary" href="/ideas/new">＋ Nova ideia</Link>}
      </header>

      {!canCreate && (
        <p className="alert alert-info" role="status">
          O envio de ideias é feito pelo link de acesso da empresa. Peça o link à gestão e abra-o neste navegador.
        </p>
      )}

      {pending.length > 0 && (
        <section className="panel" aria-labelledby="pending-title">
          <h2 id="pending-title">Para você fazer</h2>
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

      <section className="panel" aria-labelledby="my-ideas-title">
        <div className="panel-heading">
          <h2 id="my-ideas-title">Enviadas e em andamento</h2>
          {rows.length > 8 && <Link className="text-link" href="/ideas">Ver todas <span aria-hidden="true">→</span></Link>}
        </div>
        {!rows.length ? (
          <div className="empty-state">
            <span className="empty-icon" aria-hidden="true">✳</span>
            <h3>Nenhuma ideia ainda</h3>
            {canCreate && <Link className="button button-secondary" href="/ideas/new">Contar minha primeira ideia</Link>}
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
                    {idea.submitted_at ? `Enviada em ${dateFormat.format(new Date(idea.submitted_at))}` : "Ainda não enviada"}
                  </p>
                </div>
                <span className={`status-badge status-badge-${idea.status}`}>{ideaStatusLabel(idea.status)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
