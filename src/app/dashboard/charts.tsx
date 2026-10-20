/**
 * Gráficos simples em HTML/CSS. Valores sempre visíveis ou disponíveis em
 * tabela; a cor nunca é o único meio de identificar uma categoria.
 */

export type BarItem = { key: string; label: string; value: number; barClass?: string };

/** Barras horizontais com rótulo e valor diretos (magnitude ou part-to-whole). */
export function BarList({ items, total, caption }: { items: BarItem[]; total: number; caption: string }) {
  const max = Math.max(1, ...items.map((item) => item.value));
  return (
    <ul className="bar-list" aria-label={caption}>
      {items.map((item) => {
        const share = total > 0 ? Math.round((item.value / total) * 100) : 0;
        return (
          <li key={item.key}>
            <div className="bar-list-label">
              <span>{item.label}</span>
              <strong>
                {item.value}
                {total > 0 && <span className="bar-list-share"> · {share}%</span>}
              </strong>
            </div>
            <div className="bar-track" aria-hidden="true">
              <span className={`bar-fill ${item.barClass ?? "bar-primary"}`} style={{ width: `${(item.value / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

const monthFormat = new Intl.DateTimeFormat("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });

function monthLabel(month: string) {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`)).replace(".", "");
}

/** Colunas mensais (uma série). Valor por coluna no foco/hover e tabela equivalente. */
export function MonthlyColumns({ data, caption }: { data: { month: string; count: number }[]; caption: string }) {
  if (!data.length) return <p className="empty-inline">Sem envios no período.</p>;
  const max = Math.max(1, ...data.map((item) => item.count));
  const labelEvery = data.length > 12 ? Math.ceil(data.length / 12) : 1;

  return (
    <figure className="column-chart">
      <div className="column-plot" role="list" aria-label={caption}>
        {data.map((item, index) => (
          <div
            className="column-slot"
            role="listitem"
            key={item.month}
            tabIndex={0}
            aria-label={`${monthLabel(item.month)}: ${item.count} ${item.count === 1 ? "ideia" : "ideias"}`}
          >
            <span className="column-tooltip" aria-hidden="true">
              {monthLabel(item.month)}: <strong>{item.count}</strong>
            </span>
            <span className="column-bar" style={{ height: `${(item.count / max) * 100}%` }} aria-hidden="true" />
            <span className="column-label" aria-hidden="true">{index % labelEvery === 0 ? monthLabel(item.month) : ""}</span>
          </div>
        ))}
      </div>
      <figcaption className="small-copy muted">Máximo no período: {max} {max === 1 ? "ideia" : "ideias"} em um mês.</figcaption>
      <details className="table-toggle">
        <summary>Ver dados em tabela</summary>
        <table>
          <thead>
            <tr><th scope="col">Mês</th><th scope="col">Ideias enviadas</th></tr>
          </thead>
          <tbody>
            {data.map((item) => (
              <tr key={item.month}><td>{monthLabel(item.month)}</td><td>{item.count}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
