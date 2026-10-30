import Link from "next/link";
import { ideaStatusLabel } from "@/lib/idea-status";

export type AdminIdeaRow = {
  id: string;
  organization_id: string;
  organization_name: string;
  title: string;
  area: string | null;
  status: string;
  pillars: string[];
  created_at: string;
  submitted_at: string | null;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "medium" });

/** Lista resumida para a fornecedora: sem texto da ideia, análise ou autor. */
export function AdminIdeasTable({ ideas, showCompany }: { ideas: AdminIdeaRow[]; showCompany: boolean }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th scope="col">Ideia</th>
            {showCompany && <th scope="col">Empresa</th>}
            <th scope="col">Área</th>
            <th scope="col">Pilares</th>
            <th scope="col">Situação</th>
            <th scope="col">Enviada em</th>
          </tr>
        </thead>
        <tbody>
          {ideas.map((idea) => (
            <tr key={idea.id}>
              <td><strong>{idea.title}</strong></td>
              {showCompany && (
                <td><Link className="text-link" href={`/admin/companies/${idea.organization_id}`}>{idea.organization_name}</Link></td>
              )}
              <td>{idea.area || "Não informada"}</td>
              <td>
                <span className="dimension-group">
                  {idea.pillars.map((pillar) => (
                    <span key={pillar} className={`dimension-pill dimension-${pillar.toLowerCase()}`}>{pillar}</span>
                  ))}
                </span>
              </td>
              <td><span className={`status-badge status-badge-${idea.status}`}>{ideaStatusLabel(idea.status)}</span></td>
              <td>{dateFormat.format(new Date(idea.submitted_at ?? idea.created_at))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
