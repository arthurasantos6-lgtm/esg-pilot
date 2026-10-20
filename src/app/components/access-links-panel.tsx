import { CopyButton } from "@/app/components/copy-button";
import { SubmitButton } from "@/app/components/submit-button";

export type AccessLinkRow = {
  id: string;
  token: string;
  label: string | null;
  status: "active" | "revoked";
  expires_at: string | null;
  created_at: string;
  last_used_at: string | null;
  join_count: number;
};

type AccessLinksPanelProps = {
  links: AccessLinkRow[];
  organizationId: string;
  createAction: (formData: FormData) => Promise<void>;
  revokeAction: (formData: FormData) => Promise<void>;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

export function accessLinkUrl(token: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ?? "";
  return `${base}/acesso/${token}`;
}

function isExpired(link: AccessLinkRow) {
  return Boolean(link.expires_at && new Date(link.expires_at).getTime() <= Date.now());
}

/** Links de acesso dos colaboradores de uma empresa (cada link pertence a uma única empresa). */
export function AccessLinksPanel({ links, organizationId, createAction, revokeAction }: AccessLinksPanelProps) {
  return (
    <section className="panel detail-panel" aria-labelledby="access-links-title">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">ACESSO DOS COLABORADORES</p>
          <h2 id="access-links-title">Links de acesso</h2>
        </div>
      </div>
      <p className="muted small-copy">
        Quem abrir um link ativo entra como colaborador desta empresa, sem cadastro. O link nunca dá acesso de gestão nem
        a outra empresa. Compartilhe apenas por canais internos e revogue se ele vazar.
      </p>

      <form className="idea-form access-link-form" action={createAction}>
        <input type="hidden" name="organizationId" value={organizationId} />
        <div className="date-fields">
          <div>
            <label htmlFor="linkLabel">Identificação do link</label>
            <input id="linkLabel" name="label" type="text" maxLength={120} placeholder="Ex.: Unidade Serra – turno A" />
          </div>
          <div>
            <label htmlFor="expiresInDays">Validade</label>
            <select id="expiresInDays" name="expiresInDays" defaultValue="90">
              <option value="7">7 dias</option>
              <option value="30">30 dias</option>
              <option value="90">90 dias</option>
              <option value="365">1 ano</option>
              <option value="">Sem prazo</option>
            </select>
          </div>
        </div>
        <div className="form-actions">
          <SubmitButton pendingLabel="Gerando…">Gerar novo link</SubmitButton>
        </div>
      </form>

      {!links.length ? (
        <p className="empty-inline">Nenhum link gerado ainda.</p>
      ) : (
        <ul className="access-link-list">
          {links.map((link) => {
            const expired = isExpired(link);
            const active = link.status === "active" && !expired;
            const url = accessLinkUrl(link.token);
            return (
              <li key={link.id} className={active ? "" : "access-link-inactive"}>
                <div className="access-link-head">
                  <strong>{link.label ?? "Link sem identificação"}</strong>
                  <span className={`status-badge status-badge-${active ? "active" : "inactive"}`}>
                    {link.status === "revoked" ? "Revogado" : expired ? "Expirado" : "Ativo"}
                  </span>
                </div>
                {active && <code className="access-link-url">{url}</code>}
                <p className="small-copy muted">
                  Criado em {dateFormat.format(new Date(link.created_at))}
                  {link.expires_at ? ` · válido até ${dateFormat.format(new Date(link.expires_at))}` : " · sem prazo"}
                  {` · ${link.join_count} ${link.join_count === 1 ? "entrada" : "entradas"}`}
                  {link.last_used_at ? ` · último uso em ${dateFormat.format(new Date(link.last_used_at))}` : ""}
                </p>
                {active && (
                  <div className="header-actions">
                    <CopyButton value={url} />
                    <form action={revokeAction}>
                      <input type="hidden" name="linkId" value={link.id} />
                      <input type="hidden" name="organizationId" value={organizationId} />
                      <SubmitButton className="button button-secondary button-small" pendingLabel="Revogando…">
                        Revogar
                      </SubmitButton>
                    </form>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
