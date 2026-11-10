import { renderToBuffer } from "@react-pdf/renderer";
import { z } from "zod";
import { ExecutiveReport, registerFonts } from "@/app/ideas/[id]/relatorio/pdf/executive-report";
import { requireCompanyContext } from "@/lib/auth";
import { buildProjectProposal } from "@/lib/esg-project-proposal";
import { loadCompanyProfile } from "@/lib/company-profile";
import { computeFeasibility } from "@/lib/feasibility";
import { buildExecutionPlan } from "@/lib/idea-execution-plan";
import { detectInitiativeType, emptyPlan, INITIATIVE_TYPES, parsePlan } from "@/lib/idea-planning";
import { parseStoredProposal } from "@/lib/idea-proposal";
import { ideaProtocol, ideaStatusLabel } from "@/lib/idea-status";
import { loadLearningBase } from "@/lib/learning-base";
import { readLocalAnalysis } from "@/lib/local-analysis";

export const runtime = "nodejs";

/** Relatório executivo em PDF (só para a gestão da empresa). */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) return new Response("Ideia inválida.", { status: 404 });

  const { supabase, user, membership, organization } = await requireCompanyContext();
  if (membership.role !== "company_admin") return new Response("Apenas a gestão pode gerar o relatório.", { status: 403 });

  const { data: idea } = await supabase
    .from("ideas")
    .select("id, title, original_description, status, author_name, submitted_at, area, structured_proposal, analysis")
    .eq("id", id)
    .eq("organization_id", membership.organization_id)
    .maybeSingle();
  if (!idea || idea.status === "draft") return new Response("Ideia não encontrada.", { status: 404 });

  const [{ data: decision }, learningBase, companyProfile] = await Promise.all([
    supabase
      .from("idea_decisions")
      .select("to_status, justification, created_at")
      .eq("idea_id", idea.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    loadLearningBase(supabase, membership.organization_id),
    loadCompanyProfile(supabase, membership.organization_id),
  ]);

  const proposal = parseStoredProposal(idea.structured_proposal);
  const plan = parsePlan(proposal?.plan) ?? emptyPlan(detectInitiativeType(`${idea.title} ${idea.original_description ?? ""}`));
  const references = plan.research?.references ?? [];
  const local = readLocalAnalysis(idea.analysis);
  const assessment = local?.assessment;
  const recommendation = local
    ? buildProjectProposal({ title: idea.title, originalText: idea.original_description ?? "", proposal, analysis: local, ideaId: idea.id, learningBase }).recommendation
    : null;

  const origin = new URL(request.url).origin;
  registerFonts(origin);
  const buffer = await renderToBuffer(
    <ExecutiveReport
      data={{
        origin,
        organization: organization.name,
        companyLine:
          [
            companyProfile?.employees ? `${companyProfile.employees.toLocaleString("pt-BR")} funcionários` : null,
            [companyProfile?.city, companyProfile?.state].filter(Boolean).join("/") || null,
          ]
            .filter(Boolean)
            .join(" · ") || null,
        generatedAt: new Date(),
        generatedBy: user.email ?? null,
        protocol: ideaProtocol(idea.id),
        idea: {
          title: idea.title,
          status: ideaStatusLabel(idea.status),
          author: idea.author_name,
          submittedAt: idea.submitted_at,
          area: idea.area,
          original: idea.original_description ?? "",
        },
        pillars: local?.classification.primary_pillar ? [local.classification.primary_pillar, ...local.classification.secondary_pillars] : [],
        initiativeType: INITIATIVE_TYPES[plan.initiativeType].label,
        esgScore:
          assessment?.score != null
            ? { value: assessment.score, partial: false }
            : assessment?.partial_score != null
              ? { value: assessment.partial_score, partial: true }
              : null,
        recommendation,
        feasibility: computeFeasibility(plan, references, plan.selection ?? {}, companyProfile),
        plan: buildExecutionPlan({ title: idea.title, originalText: idea.original_description ?? "", plan }),
        references,
        lastDecision: decision ? { status: ideaStatusLabel(decision.to_status), justification: decision.justification, at: decision.created_at } : null,
      }}
    />,
  );

  const slug = idea.title.normalize("NFD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toLowerCase().slice(0, 50) || "ideia";
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="relatorio-executivo-${ideaProtocol(idea.id)}-${slug}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
