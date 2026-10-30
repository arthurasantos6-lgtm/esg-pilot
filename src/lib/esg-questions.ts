import type { ClassificationResult, Signals } from "./esg-classifier.ts";
import type { ProposalFieldKey } from "./idea-proposal.ts";

/**
 * Perguntas de complementação por regras, sem IA generativa. Cada resposta vai
 * para um campo da proposta como dado informado pela pessoa, nunca como conclusão.
 */

export type GuidedQuestion = { id: string; text: string; field: ProposalFieldKey };

const MAX_QUESTIONS = 4;

const BY_SUBCATEGORY: Record<string, GuidedQuestion[]> = {
  E1: [
    { id: "e1-local", text: "Qual equipamento ou ambiente seria afetado?", field: "context" },
    { id: "e1-consumo", text: "Você conhece o consumo atual?", field: "context" },
    { id: "e1-medir", text: "Como mediríamos a economia?", field: "indicators" },
    { id: "e1-restricao", text: "Existe alguma restrição de segurança ou de operação?", field: "resourcesAndRisks" },
  ],
  E2: [
    { id: "e2-uso", text: "Em qual uso ou etapa essa água é utilizada?", field: "context" },
    { id: "e2-volume", text: "Você sabe o volume usado hoje?", field: "context" },
    { id: "e2-medir", text: "Como poderíamos medir o resultado?", field: "indicators" },
  ],
  E3: [
    { id: "e3-material", text: "Qual material ou resíduo está envolvido?", field: "context" },
    { id: "e3-destino", text: "Para onde esse material vai hoje?", field: "problem" },
    { id: "e3-medir", text: "Como poderíamos medir a redução?", field: "indicators" },
  ],
  E4: [
    { id: "e4-fonte", text: "O que causa a emissão ou a poluição?", field: "problem" },
    { id: "e4-afetado", text: "Quem ou o que é afetado?", field: "beneficiaries" },
    { id: "e4-risco", text: "Há produtos perigosos envolvidos?", field: "resourcesAndRisks" },
  ],
  S1: [
    { id: "s1-risco", text: "Qual risco você deseja reduzir?", field: "problem" },
    { id: "s1-afetados", text: "Quem é afetado?", field: "beneficiaries" },
    { id: "s1-ocorrencias", text: "Há registro de ocorrências?", field: "context" },
    { id: "s1-avaliar", text: "Como avaliar a melhoria?", field: "indicators" },
  ],
  S2: [
    { id: "s2-publico", text: "Quem participaria?", field: "beneficiaries" },
    { id: "s2-conteudo", text: "O que as pessoas precisam aprender?", field: "solution" },
    { id: "s2-avaliar", text: "Como saber se o aprendizado funcionou?", field: "indicators" },
  ],
  S3: [
    { id: "s3-barreira", text: "Qual barreira ou situação você percebeu? Não cite nomes.", field: "problem" },
    { id: "s3-afetados", text: "Qual grupo seria beneficiado?", field: "beneficiaries" },
    { id: "s3-avaliar", text: "Como saber se a situação melhorou?", field: "indicators" },
  ],
  S4: [
    { id: "s4-quem", text: "Qual comunidade ou grupo seria beneficiado?", field: "beneficiaries" },
    { id: "s4-efeito", text: "Pode haver algum efeito negativo a considerar?", field: "resourcesAndRisks" },
    { id: "s4-avaliar", text: "Como saber se ajudou?", field: "indicators" },
  ],
  G1: [
    { id: "g1-processo", text: "Qual processo seria fortalecido? Não cite nomes.", field: "context" },
    { id: "g1-prevencao", text: "O que a proposta ajudaria a prevenir?", field: "problem" },
    { id: "g1-valida", text: "Quem poderia validar a proposta?", field: "resourcesAndRisks" },
  ],
  G2: [
    { id: "g2-processo", text: "Qual processo precisa de controle?", field: "context" },
    { id: "g2-falha", text: "Que falha ou risco existe?", field: "problem" },
    { id: "g2-valida", text: "Quem validaria o procedimento?", field: "resourcesAndRisks" },
  ],
  G3: [
    { id: "g3-dado", text: "Qual informação precisa ficar mais clara ou registrada?", field: "context" },
    { id: "g3-quem", text: "Quem usaria essa informação?", field: "beneficiaries" },
    { id: "g3-privacidade", text: "Envolve dados pessoais?", field: "resourcesAndRisks" },
  ],
  G4: [
    { id: "g4-compra", text: "Qual compra ou fornecedor está envolvido? Não cite pessoas.", field: "context" },
    { id: "g4-criterio", text: "Qual critério você sugere usar?", field: "solution" },
    { id: "g4-risco", text: "Há algum risco na mudança?", field: "resourcesAndRisks" },
  ],
};

const BY_MISSING_SIGNAL: [keyof Signals, GuidedQuestion][] = [
  ["problem", { id: "geral-problema", text: "O que acontece hoje que poderia melhorar?", field: "problem" }],
  ["action", { id: "geral-acao", text: "O que você sugere fazer?", field: "solution" }],
  ["audience", { id: "geral-publico", text: "Quem seria beneficiado?", field: "beneficiaries" }],
  ["measurement", { id: "geral-medir", text: "Como saberíamos que funcionou?", field: "indicators" }],
  ["resources", { id: "geral-recursos", text: "O que seria necessário para fazer isso?", field: "resourcesAndRisks" }],
];

/** Primeiro o que falta no texto; depois as perguntas do tema, sem repetir o campo já coberto. */
export function selectQuestions(classification: ClassificationResult): GuidedQuestion[] {
  const missing = BY_MISSING_SIGNAL.filter(([signal]) => !classification.signals[signal]).map(([, question]) => question);
  const themed = classification.subcategories.flatMap((code) => BY_SUBCATEGORY[code] ?? []);
  const selected: GuidedQuestion[] = [];
  const usedFields = new Set<ProposalFieldKey>();
  // As perguntas gerais de ação e problema vêm antes: sem elas, a proposta não se sustenta.
  for (const question of [...missing.filter(({ field }) => field === "problem" || field === "solution"), ...themed, ...missing]) {
    if (selected.length >= MAX_QUESTIONS) break;
    if (usedFields.has(question.field)) continue;
    usedFields.add(question.field);
    selected.push(question);
  }
  return selected;
}

export function findQuestion(id: string): GuidedQuestion | null {
  const all = [...Object.values(BY_SUBCATEGORY).flat(), ...BY_MISSING_SIGNAL.map(([, question]) => question)];
  return all.find((question) => question.id === id) ?? null;
}
