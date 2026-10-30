import type { Metadata } from "next";
import { connection } from "next/server";
import { AdminShell } from "@/app/admin/components/admin-shell";
import { requirePlatformAdmin } from "@/lib/auth";
import { assessCriteria, summarizeAssessment } from "@/lib/esg-assessment";
import { classifyText, LOCAL_ENGINE_VERSION } from "@/lib/esg-classifier";
import { ESG_SUBCATEGORIES } from "@/lib/esg-engine";
import { LEXICON_RULES, LEXICON_VERSION } from "@/lib/esg-lexicon";
import { selectQuestions } from "@/lib/esg-questions";

export const metadata: Metadata = { title: "Motor ESG local" };

/** Consulta do dicionário e simulador. Nada é gravado. */
export default async function AdminEsgEnginePage({ searchParams }: { searchParams: Promise<{ text?: string }> }) {
  await connection();
  const { user } = await requirePlatformAdmin();
  const text = (await searchParams).text?.trim().slice(0, 4000) ?? "";
  const classification = text ? classifyText(text) : null;
  const assessment = classification ? summarizeAssessment(assessCriteria(classification)) : null;

  return (
    <AdminShell userEmail={user.email ?? "Conta"}>
      <header className="page-header">
        <div>
          <p className="eyebrow">TECNOLOGIA</p>
          <h1>Motor ESG local</h1>
          <p className="muted">Motor {LOCAL_ENGINE_VERSION} · {LEXICON_VERSION} · {LEXICON_RULES.length} regras. Pesos e limiares ainda não foram calibrados com especialistas.</p>
        </div>
      </header>

      <section className="panel detail-panel" aria-labelledby="simulator-title">
        <h2 id="simulator-title">Simular uma classificação</h2>
        <form className="idea-form" action="/admin/esg-engine">
          <label htmlFor="text" className="sr-only">Texto da ideia</label>
          <textarea id="text" name="text" rows={4} maxLength={4000} defaultValue={text} placeholder="Escreva uma ideia de exemplo. Nada é gravado." />
          <div className="form-actions"><button className="button button-primary" type="submit">Simular</button></div>
        </form>
        {classification && assessment && (
          <>
            <p className="small-copy"><strong>Situação:</strong> {classification.status === "classified" ? "classificada" : "sem classificação, aguarda revisão"}</p>
            <p className="small-copy"><strong>Pilar principal:</strong> {classification.primary_pillar ?? "—"} · <strong>Secundários:</strong> {classification.secondary_pillars.join(", ") || "—"} · <strong>Subcategorias:</strong> {classification.subcategories.join(", ") || "—"}</p>
            <p className="small-copy"><strong>Escore heurístico:</strong> {classification.match_score} · <strong>Critérios avaliados:</strong> {assessment.assessed_weight}% dos pesos · <strong>Pontuação:</strong> {assessment.score === null ? "pendente" : Math.round(assessment.score)}</p>
            {classification.review_reasons.length > 0 && <p className="small-copy"><strong>Revisão:</strong> {classification.review_reasons.join("; ")}</p>}
            <h3 className="subsection-title">Evidências</h3>
            <ul className="evaluation-list">
              {classification.matches.map((match) => <li key={match.rule_id}>“{match.matched_text}” → {match.subcategory} ({match.rule_id}, {match.score}{match.negated ? ", negado" : ""})</li>)}
            </ul>
            <h3 className="subsection-title">Perguntas que seriam feitas</h3>
            <ul className="evaluation-list">{selectQuestions(classification).map((question) => <li key={question.id}>{question.text}</li>)}</ul>
          </>
        )}
      </section>

      <section className="panel detail-panel" aria-labelledby="lexicon-title">
        <h2 id="lexicon-title">Dicionário</h2>
        <p className="muted small-copy">Consulta. A edição e a publicação de versões por esta tela ainda não existem.</p>
        {ESG_SUBCATEGORIES.map(({ code, label }) => (
          <details key={code}>
            <summary className="small-copy"><strong>{code}</strong> {label}</summary>
            <ul className="evaluation-list">
              {LEXICON_RULES.filter((rule) => rule.subcategory === code).map((rule) => (
                <li key={rule.id}><strong>Peso {rule.weight}:</strong> {rule.terms.join(", ")}</li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </AdminShell>
  );
}
