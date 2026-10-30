/**
 * Rótulos das situações de ideia. Fonte única para listas, detalhe e painéis.
 * As transições permitidas ficam no banco (`idea_status_transitions`).
 */
export const IDEA_STATUS_ORDER = [
  "draft",
  "submitted",
  "in_review",
  "awaiting_info",
  "technical_review",
  "prioritized",
  "approved",
  "in_progress",
  "implemented",
  "rejected",
  "archived",
] as const;

export type IdeaStatus = (typeof IDEA_STATUS_ORDER)[number];

export const IDEA_STATUS_LABELS: Record<IdeaStatus, string> = {
  draft: "Rascunho",
  submitted: "Enviada",
  in_review: "Em avaliação",
  awaiting_info: "Aguardando informações",
  technical_review: "Avaliação técnica",
  prioritized: "Priorizada",
  approved: "Aprovada",
  in_progress: "Em implementação",
  implemented: "Concluída",
  rejected: "Não priorizada",
  archived: "Arquivada",
};

export function ideaStatusLabel(status: string) {
  return IDEA_STATUS_LABELS[status as IdeaStatus] ?? status;
}

/** Próxima ação esperada, em linguagem simples, para quem enviou a ideia. */
export function nextStepForAuthor(status: string): string {
  switch (status) {
    case "draft":
      return "Revise a proposta e envie quando estiver pronta.";
    case "submitted":
      return "A gestão da empresa vai analisar sua ideia.";
    case "in_review":
    case "technical_review":
      return "Sua ideia está em avaliação pela gestão.";
    case "awaiting_info":
      return "A gestão pediu mais informações. Responda abaixo para a avaliação continuar.";
    case "prioritized":
      return "Sua ideia foi priorizada e aguarda a decisão final.";
    case "approved":
      return "Sua ideia foi aprovada. A gestão vai planejar a implementação.";
    case "in_progress":
      return "Sua ideia está sendo implementada.";
    case "implemented":
      return "A implementação foi concluída. Obrigado pela contribuição!";
    case "rejected":
      return "A ideia não foi priorizada neste momento. Veja o retorno da gestão, se houver.";
    default:
      return "Acompanhe a situação por aqui.";
  }
}

export const PRIORITY_LABELS: Record<string, string> = { baixa: "Baixa", media: "Média", alta: "Alta" };

export const AI_AGREEMENT_LABELS: Record<string, string> = {
  agrees: "Concorda com a avaliação da IA",
  partially: "Concorda parcialmente com a IA",
  disagrees: "Discorda da avaliação da IA",
};

/** Código curto que o colaborador recebe ao enviar a ideia. */
export function ideaProtocol(ideaId: string) {
  return ideaId.replaceAll("-", "").slice(0, 8).toUpperCase();
}
