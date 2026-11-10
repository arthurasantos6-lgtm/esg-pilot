// TEMPORÁRIO: prévia local da janela de decisão com dados fictícios. Apagar depois do teste.
import { AppShell } from "@/app/components/app-shell";
import { DecisionBrief } from "@/app/ideas/[id]/decision-brief";
import { DecisionDialog } from "@/app/ideas/[id]/decision-dialog";
import { DecisionPanel } from "@/app/ideas/[id]/decision-panel";
import { DEFAULT_CRITERIA } from "@/lib/esg-analysis";
import { buildProjectProposal } from "@/lib/esg-project-proposal";
import { computeFeasibility } from "@/lib/feasibility";
import { buildExecutionPlan } from "@/lib/idea-execution-plan";
import { applyAnswerForm, emptyPlan, type IdeaPlan } from "@/lib/idea-planning";
import { buildLocalAnalysis, readLocalAnalysis } from "@/lib/local-analysis";

const TEXT = "As luzes dos corredores e banheiros ficam acesas a noite toda, mesmo sem ninguém. Sugiro instalar sensores de presença para reduzir o consumo de energia.";

function answer(plan: IdeaPlan, values: Record<string, string>) {
  const data = new FormData();
  data.append("shown", Object.keys(values).join(","));
  for (const [k, v] of Object.entries(values)) for (const part of v.split("|")) data.append(`answer:${k}`, part);
  return applyAnswerForm(plan, data, "collaborator").plan;
}

export default function Preview() {
  let plan = emptyPlan("iluminacao");
  plan = answer(plan, { "g-problema": "As luzes ficam acesas a noite toda, mesmo sem ninguém.", "g-objetivo": "Reduzir custos|Reduzir consumo de energia", "il-ambientes": "Corredores|Banheiros", "il-pontos": "14", "il-luminarias": "60", "il-potencia": "18", "il-ociosas": "Quase sempre", "il-instalacao": "Empresa contratada", "g-prazo": "De 1 a 3 meses", "g-beneficios": "Conta de energia menor", "g-riscos": "Resistência das pessoas à mudança" });
  plan = answer(plan, { "il-horas-ociosas": "6" });
  const ref = (id: string, category: "preco_equipamento" | "instalacao" | "economia", title: string, summary: string) => ({ id, title, url: `https://www.${id}.com.br/p`, category, summary, value: null, publishedAt: null, consultedAt: new Date().toISOString(), origin: "search_api" as const });
  const references = [
    ref("lojaeletrica", "preco_equipamento", "Sensor de presença de teto 360°", "Sensor de presença de teto por R$ 79,90 à vista."),
    ref("casadoeletricista", "preco_equipamento", "Sensor para lâmpada LED", "Sensor infravermelho R$ 119,00."),
    ref("servicospro", "instalacao", "Quanto custa instalar sensor", "Instalação: R$ 60,00 por ponto."),
    ref("tarifas", "economia", "Tarifa comercial 2026", "Tarifa média de R$ 0,82/kWh."),
  ];
  const analysis = readLocalAnalysis(buildLocalAnalysis(TEXT, DEFAULT_CRITERIA, { criteriaVersionId: null, criteriaVersionLabel: "padrão" }))!;
  const proposal = buildProjectProposal({ title: "x", originalText: TEXT, proposal: null, analysis, ideaId: "x" });
  const score = analysis.assessment.score ?? analysis.assessment.partial_score;
  return (
    <AppShell organizationName="Vale Claro Alimentos" userEmail="gestor@example.com" membership={{ role: "company_admin", access_link_id: null }} enabledModules={["ideas"]}>
      <h1>Prévia</h1>
      <pre id="dbg" />
      <script
        dangerouslySetInnerHTML={{
          __html: `setTimeout(function(){var d=document.getElementById('decision-dialog');var w=d.getBoundingClientRect();var out=['dialog '+w.left+' '+w.width+' sw '+d.scrollWidth+' vw '+innerWidth];d.querySelectorAll('*').forEach(function(e){var r=e.getBoundingClientRect();if(r.right>w.right+1&&out.length<15)out.push(e.tagName+'.'+e.className+' w='+Math.round(r.width)+' r='+Math.round(r.right))});document.body.setAttribute('data-dbg',out.join(' | '))},4000)`,
        }}
      />
      <DecisionDialog>
        <DecisionPanel
          ideaId="7c9e6679-7425-40de-944b-e07fc1f90ae7"
          status="submitted"
          transitions={[{ to_status: "in_review", action_label: "Aceitar para avaliação" }, { to_status: "rejected", action_label: "Não priorizar" }]}
          members={[{ user_id: "u1", email: "gestor@example.com", status: "active" }]}
          responsibleId={null}
          followUpDate={null}
          priority={null}
          projectsEnabled={false}
          title="Instalar sensores de presença nos corredores"
          summary={
            <DecisionBrief
              ideaId="x"
              original={TEXT}
              solution="Instalar sensores de presença nos corredores e banheiros."
              plan={buildExecutionPlan({ title: "x", originalText: TEXT, plan })}
              feasibility={computeFeasibility(plan, references)}
              references={references}
              proposal={proposal}
              analysis={analysis}
              score={score === null ? null : { value: score, partial: analysis.assessment.score === null }}
              aiEvaluation={null}
            />
          }
        />
      </DecisionDialog>
    </AppShell>
  );
}
