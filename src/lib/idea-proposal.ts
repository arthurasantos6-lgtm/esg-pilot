import { z } from "zod";

/**
 * Campos da proposta estruturada. A mesma lista alimenta o formulário de
 * revisão, a exibição no detalhe da ideia e o esquema pedido à IA, para que
 * não existam versões divergentes da estrutura em partes diferentes do código.
 */
export const PROPOSAL_FIELDS = [
  { key: "problem", label: "Problema identificado", hint: "Qual situação atual precisa melhorar?" },
  { key: "solution", label: "Solução proposta", hint: "O que você sugere fazer e como funcionaria?" },
  { key: "context", label: "Contexto e justificativa", hint: "Onde acontece, com que frequência, por que importa." },
  { key: "beneficiaries", label: "Beneficiários ou áreas envolvidas", hint: "Quem ou o que será beneficiado." },
  { key: "esgDimensions", label: "Dimensões ESG possivelmente relacionadas", hint: "Ambiental, Social e/ou Governança, e por quê." },
  { key: "expectedBenefits", label: "Benefícios esperados", hint: "Resultados esperados. Não invente números." },
  { key: "indicators", label: "Indicadores sugeridos", hint: "Como medir se funcionou (um por linha)." },
  { key: "resourcesAndRisks", label: "Recursos, dependências e riscos conhecidos", hint: "O que é necessário e o que pode dar errado." },
  { key: "nextSteps", label: "Próximos passos sugeridos", hint: "O que precisaria acontecer primeiro." },
] as const;

export type ProposalFieldKey = (typeof PROPOSAL_FIELDS)[number]["key"];

export const PROPOSAL_FIELD_MAX_LENGTH = 4000;

/** Proposta como gravada em `ideas.structured_proposal`. `null` = não informado. */
export const storedProposalSchema = z.object({
  title: z.string(),
  problem: z.string().nullable(),
  solution: z.string().nullable(),
  context: z.string().nullable(),
  beneficiaries: z.string().nullable(),
  esgDimensions: z.string().nullable(),
  expectedBenefits: z.string().nullable(),
  indicators: z.string().nullable(),
  resourcesAndRisks: z.string().nullable(),
  nextSteps: z.string().nullable(),
  source: z.enum(["copilot", "manual"]),
  updatedAt: z.string(),
});

export type StoredProposal = z.infer<typeof storedProposalSchema>;

export function parseStoredProposal(value: unknown): StoredProposal | null {
  const parsed = storedProposalSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function normalizeOptionalText(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text.slice(0, PROPOSAL_FIELD_MAX_LENGTH) : null;
}

/**
 * Lê a proposta revisada pelo colaborador. Campos vazios viram `null`
 * (exibidos como "não informado"), nunca texto inventado.
 */
export function readProposalForm(
  formData: FormData,
  source: StoredProposal["source"],
  now = new Date(),
): StoredProposal {
  return {
    title: String(formData.get("title") ?? "").trim().slice(0, 120),
    problem: normalizeOptionalText(formData.get("problem")),
    solution: normalizeOptionalText(formData.get("solution")),
    context: normalizeOptionalText(formData.get("context")),
    beneficiaries: normalizeOptionalText(formData.get("beneficiaries")),
    esgDimensions: normalizeOptionalText(formData.get("esgDimensions")),
    expectedBenefits: normalizeOptionalText(formData.get("expectedBenefits")),
    indicators: normalizeOptionalText(formData.get("indicators")),
    resourcesAndRisks: normalizeOptionalText(formData.get("resourcesAndRisks")),
    nextSteps: normalizeOptionalText(formData.get("nextSteps")),
    source,
    updatedAt: now.toISOString(),
  };
}

/** Campos ainda pendentes, para orientar o colaborador antes do envio. */
export function missingProposalFields(proposal: StoredProposal): string[] {
  return PROPOSAL_FIELDS.filter(({ key }) => !proposal[key]).map(({ label }) => label);
}

/**
 * Problema/solução gravados nas colunas da ideia precisam respeitar o limite
 * mínimo do banco (10 caracteres); textos menores ficam apenas na proposta.
 */
export function columnText(value: string | null): string | null {
  return value && value.trim().length >= 10 ? value.trim() : null;
}
