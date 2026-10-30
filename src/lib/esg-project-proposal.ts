import type { AssessmentSummary } from "./esg-assessment.ts";
import { detectSignals, type ClassificationResult, type Signals } from "./esg-classifier.ts";
import { ESG_SUBCATEGORIES } from "./esg-engine.ts";
import { readLocalAnalysis, type LocalAnalysis } from "./local-analysis.ts";
import { similarity, tokenize } from "./text-similarity.ts";
import type { StoredProposal } from "./idea-proposal.ts";

/**
 * Proposta de projeto, potencial de adesão e recomendação, por regras e a partir
 * do que foi enviado: o texto vem da própria ideia, sem fatos, custos ou retorno
 * financeiro inventados. É uma sugestão à gestão: nada é aprovado automaticamente.
 * Os limites abaixo são proposta metodológica, ainda não calibrada.
 */

const ACCEPT_MIN_PARTIAL_SCORE = 50;
const ACCEPT_MIN_ASSESSED_WEIGHT = 50;
const ACCEPT_MIN_IMPACT = 2;
const ACCEPT_MIN_MATURITY = 3;
const ASSESSABLE_MIN_MATURITY = 2;
const THIN_MAX_IMPACT = 1;
const THIN_MAX_MATURITY = 2;

const ADOPTION_FACTORS = [
  { signal: "action", label: "ação proposta clara" },
  { signal: "audience", label: "público identificado" },
  { signal: "benefit", label: "benefício esperado" },
  { signal: "resources", label: "recursos indicados" },
  { signal: "responsibility", label: "responsável ou dependência indicada" },
  { signal: "deadline", label: "prazo ou etapas" },
  { signal: "measurement", label: "forma de medir" },
] as const;

export type AdoptionPotential = {
  level: "alto" | "medio" | "baixo";
  label: string;
  present: string[];
  missing: string[];
};

/** Estimativa pelo que o texto já define: não prevê a adesão real das equipes. */
export function assessAdoption(classification: ClassificationResult): AdoptionPotential {
  const present = ADOPTION_FACTORS.filter(({ signal }) => classification.signals[signal]).map(({ label }) => label);
  const missing = ADOPTION_FACTORS.filter(({ signal }) => !classification.signals[signal]).map(({ label }) => label);
  if (present.length >= 5) return { level: "alto", label: "Alto", present, missing };
  if (present.length >= 3) return { level: "medio", label: "Médio", present, missing };
  return { level: "baixo", label: "Baixo", present, missing };
}

export type Recommendation = {
  key: "accept" | "accept_with_conditions" | "not_now";
  label: string;
  reasons: string[];
  conditions: string[];
};

/**
 * Aprendizado com as decisões da empresa: ideias aprovadas mostram o que seguir,
 * e as rejeitadas, o que evitar. Não é um modelo treinado: compara tema e texto,
 * de forma explicável, e só com ideias da mesma empresa. Palavras genéricas
 * aproximam textos de temas diferentes, por isso o tema em comum é obrigatório.
 */
export const APPROVED_STATUSES = ["approved", "in_progress", "implemented"];
export const REJECTED_STATUSES = ["rejected"];
export const LEARNING_STATUSES = [...APPROVED_STATUSES, ...REJECTED_STATUSES];
const PRECEDENT_MIN_SIMILARITY = 0.2;
/** Acima disso é provável cópia: conta como possível duplicidade, não como precedente. */
const DUPLICATE_MIN_SIMILARITY = 0.85;
const MAX_PRECEDENTS = 3;
const MAX_REASON_LENGTH = 200;

type LearningCandidate = {
  id: string;
  title: string;
  original_description: string | null;
  status: string;
  analysis: unknown;
  rejection_reason?: string | null;
};
type LearningOutcome = "approved" | "rejected";
export type LearningEntry = {
  id: string;
  title: string;
  tokens: Set<string>;
  subcategories: string[];
  outcome: LearningOutcome;
  reason: string | null;
};
export type Precedent = { id: string; title: string; similarity: number; outcome: LearningOutcome; reason: string | null };

export function buildLearningBase(ideas: LearningCandidate[]): LearningEntry[] {
  return ideas.flatMap((idea) => {
    const local = readLocalAnalysis(idea.analysis);
    if (!LEARNING_STATUSES.includes(idea.status) || !local) return [];
    const outcome: LearningOutcome = REJECTED_STATUSES.includes(idea.status) ? "rejected" : "approved";
    return [{
      id: idea.id,
      title: idea.title,
      tokens: tokenize(`${idea.title} ${idea.original_description ?? ""}`),
      subcategories: local.classification.subcategories,
      outcome,
      reason: outcome === "rejected" ? idea.rejection_reason ?? null : null,
    }];
  });
}

export function findPrecedents(
  target: { id: string; title: string; original_description: string | null; subcategories: string[] },
  base: LearningEntry[],
): Precedent[] {
  const tokens = tokenize(`${target.title} ${target.original_description ?? ""}`);
  return base
    .filter((entry) => entry.id !== target.id && entry.subcategories.some((code) => target.subcategories.includes(code)))
    .map(({ id, title, tokens: other, outcome, reason }) => ({ id, title, outcome, reason, similarity: similarity(tokens, other) }))
    .filter((entry) => entry.similarity >= PRECEDENT_MIN_SIMILARITY && entry.similarity < DUPLICATE_MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, MAX_PRECEDENTS);
}

const quoted = (precedents: Precedent[]) => precedents.map(({ title }) => `"${title}"`).join(", ");

function precedentReasons(precedents: Precedent[]) {
  const approved = precedents.filter(({ outcome }) => outcome === "approved");
  const rejected = precedents.filter(({ outcome }) => outcome === "rejected");
  return [
    ...(approved.length ? [`Parecida com ${approved.length === 1 ? "uma ideia já aprovada" : `${approved.length} ideias já aprovadas`} nesta empresa: ${quoted(approved)}.`] : []),
    ...rejected.map(({ title, reason }) =>
      `Parecida com uma ideia não priorizada nesta empresa: "${title}".${reason ? ` Motivo registrado: ${reason.slice(0, MAX_REASON_LENGTH)}` : ""}`,
    ),
    ...(approved.length && rejected.length ? ["O histórico é misto: há decisões nos dois sentidos, então ele não muda a recomendação."] : []),
  ];
}

const gradeOf = (assessment: AssessmentSummary, code: string) =>
  assessment.criteria.find((item) => item.code === code)?.grade ?? null;

export function recommendIdea({ classification, assessment }: LocalAnalysis, precedents: Precedent[] = []): Recommendation {
  const impact = gradeOf(assessment, "C1");
  const maturity = gradeOf(assessment, "C8");
  const adoption = assessAdoption(classification);
  const partial = assessment.partial_score;
  const conditions = classification.missing_information.map((item) => `Informar: ${item}`);

  if (classification.status !== "classified") {
    return {
      key: "not_now",
      label: "Não aceitar por enquanto",
      reasons: ["O texto não traz base para identificar um tema ESG."],
      conditions,
    };
  }
  // Tema real, mas com pouco para sustentar a decisão: pede mais informação em vez de aceitar.
  const thin = impact !== null && maturity !== null && impact <= THIN_MAX_IMPACT && maturity <= THIN_MAX_MATURITY;
  // Precedentes movem a recomendação um nível, nunca além. Com decisões nos dois
  // sentidos não movem, e em temas sensíveis só aparecem como informação.
  const sensitive = classification.needs_human_review;
  const approvedPrecedent = precedents.some(({ outcome }) => outcome === "approved");
  const rejectedPrecedent = precedents.some(({ outcome }) => outcome === "rejected");
  const raises = approvedPrecedent && !rejectedPrecedent && !sensitive;
  const lowers = rejectedPrecedent && !approvedPrecedent && !sensitive;
  const history = precedentReasons(precedents);
  const rejectedTitles = quoted(precedents.filter(({ outcome }) => outcome === "rejected"));
  const avoidCondition = `Explicar o que muda em relação à ideia não priorizada: ${rejectedTitles}`;

  if (impact === null || maturity === null || maturity < ASSESSABLE_MIN_MATURITY || (thin && !raises)) {
    return {
      key: "not_now",
      label: "Não aceitar por enquanto",
      reasons: ["A proposta ainda está pouco madura: faltam elementos básicos para avaliá-la.", ...history],
      conditions: lowers ? [avoidCondition, ...conditions] : conditions,
    };
  }

  const reasons = [
    ...history,
    `Maturidade ${maturity} de 5 e impacto potencial ${impact} de 5.`,
    `Potencial de adesão ${adoption.label.toLowerCase()}.`,
    partial === null ? "Sem pontuação parcial." : `Pontuação parcial de ${Math.round(partial)} de 100, sobre ${assessment.assessed_weight}% dos pesos.`,
  ];

  if (classification.needs_human_review) {
    return {
      key: "accept_with_conditions",
      label: "Aceitar com condições",
      reasons: [...reasons, ...classification.review_reasons],
      conditions: ["Passar por análise de especialista antes da aprovação", ...conditions],
    };
  }
  const strong =
    impact >= ACCEPT_MIN_IMPACT &&
    maturity >= ACCEPT_MIN_MATURITY &&
    assessment.assessed_weight >= ACCEPT_MIN_ASSESSED_WEIGHT &&
    partial !== null &&
    partial >= ACCEPT_MIN_PARTIAL_SCORE &&
    adoption.level !== "baixo";
  const nearlyStrong = impact >= ACCEPT_MIN_IMPACT && maturity >= ACCEPT_MIN_MATURITY && adoption.level !== "baixo";
  if (lowers) {
    return strong
      ? { key: "accept_with_conditions", label: "Aceitar com condições", reasons, conditions: [avoidCondition, ...conditions] }
      : { key: "not_now", label: "Não aceitar por enquanto", reasons, conditions: [avoidCondition, ...conditions] };
  }
  if (strong || (raises && nearlyStrong)) return { key: "accept", label: "Aceitar", reasons, conditions };
  return { key: "accept_with_conditions", label: "Aceitar com condições", reasons, conditions };
}

const INDICATORS: Record<string, string[]> = {
  E1: ["Consumo de energia (kWh)", "Consumo por unidade produzida (kWh/unidade)"],
  E2: ["Água captada (m³)", "Água reutilizada (m³)"],
  E3: ["Resíduos gerados (kg)", "Resíduos reciclados (kg)"],
  E4: ["Emissões estimadas (tCO₂e), com premissas explícitas", "Ocorrências de poluição registradas"],
  S1: ["Taxa de incidentes", "Ocorrências registradas por período"],
  S2: ["Horas de capacitação", "Avaliação antes e depois"],
  S3: ["Barreiras removidas", "Participação dos grupos beneficiados"],
  S4: ["Pessoas beneficiadas", "Ações realizadas com a comunidade"],
  G1: ["Relatos tratados no canal", "Pessoas orientadas sobre conduta"],
  G2: ["Não conformidades tratadas", "Controles revisados"],
  G3: ["Relatórios publicados no prazo", "Registros com rastreabilidade"],
  G4: ["Fornecedores avaliados", "Compras com critérios socioambientais"],
};

const PROPOSING = /\b(sugiro|sugerimos|proponho|propomos|podemos|poderiamos|da para|daria para|precisamos|seria bom|devemos)\b/;

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

export type ProjectProposal = {
  title: string;
  objective: string;
  problem: string | null;
  solution: string | null;
  beneficiaries: string | null;
  resources: string | null;
  deadline: string | null;
  costs: string | null;
  indicators: string[];
  nextSteps: string[];
  themes: string[];
  adoption: AdoptionPotential;
  recommendation: Recommendation;
  precedents: Precedent[];
  learningBaseCounts: { approved: number; rejected: number };
};

/** Monta a proposta: campos preenchidos pela pessoa têm prioridade; depois, frases do próprio texto. */
export function buildProjectProposal(input: {
  title: string;
  originalText: string;
  proposal: StoredProposal | null;
  analysis: LocalAnalysis;
  /** Id da ideia e ideias já decididas da mesma empresa, para aprender com as decisões anteriores. */
  ideaId?: string;
  learningBase?: LearningEntry[];
}): ProjectProposal {
  const { classification } = input.analysis;
  const learningBase = input.learningBase ?? [];
  const precedents = findPrecedents(
    { id: input.ideaId ?? "", title: input.title, original_description: input.originalText, subcategories: classification.subcategories },
    learningBase,
  );
  const sentences = splitSentences(input.originalText).map((text) => ({ text, signals: detectSignals(text), proposing: PROPOSING.test(fold(text)) }));
  const pick = (test: (sentence: (typeof sentences)[number]) => boolean) => sentences.find(test)?.text ?? null;

  const solutionSentences = sentences.filter((sentence) => sentence.proposing).map((sentence) => sentence.text);
  const solution = input.proposal?.solution ?? (solutionSentences.join(" ") || pick((sentence) => sentence.signals.action));
  const problem = input.proposal?.problem ?? pick((sentence) => sentence.signals.problem && !sentence.proposing);

  // Trechos por vírgula, e cada um em um só campo: sem trecho próprio, o campo fica como não informado.
  const clauses = sentences.flatMap(({ text }) =>
    text.split(/,\s+/).map((clause) => ({ text: clause.trim(), signals: detectSignals(clause) })),
  );
  const used = [problem, solution].filter((text): text is string => Boolean(text));
  const pickClause = (test: (signals: Signals) => boolean) => {
    const found = clauses.find((clause) => test(clause.signals) && !used.some((text) => text.includes(clause.text)))?.text ?? null;
    if (found) used.push(found);
    return found;
  };
  const costs = pickClause((signals) => signals.money || signals.cost);
  const deadline = pickClause((signals) => signals.deadline);
  const beneficiaries = input.proposal?.beneficiaries ?? pickClause((signals) => signals.audience);
  const resources = input.proposal?.resourcesAndRisks ?? pickClause((signals) => signals.resources);

  const themes = classification.subcategories.map((code) => {
    const subcategory = ESG_SUBCATEGORIES.find((item) => item.code === code);
    return `${code} ${subcategory?.label ?? ""}`.trim();
  });

  const nextSteps = [
    ...classification.missing_information.map((item) => `Levantar com a equipe: ${item}.`),
    "Definir responsável e prazo do projeto.",
    "Registrar a situação atual, para comparar antes e depois.",
    "Fazer um teste em escala pequena antes de ampliar.",
  ];

  return {
    title: input.title,
    objective: themes.length
      ? `Estudar e executar a ideia "${input.title}", relacionada a: ${themes.join("; ")}.`
      : `Estudar a ideia "${input.title}" e definir seu objetivo com quem a enviou.`,
    problem,
    solution,
    beneficiaries,
    resources,
    deadline,
    costs,
    indicators: classification.subcategories.flatMap((code) => INDICATORS[code] ?? []),
    nextSteps,
    themes,
    adoption: assessAdoption(classification),
    recommendation: recommendIdea(input.analysis, precedents),
    precedents,
    learningBaseCounts: {
      approved: learningBase.filter(({ outcome }) => outcome === "approved").length,
      rejected: learningBase.filter(({ outcome }) => outcome === "rejected").length,
    },
  };
}

/** Texto inicial do campo "objetivo" ao criar o projeto; a gestão edita antes de salvar. */
export function projectObjectiveText(proposal: ProjectProposal) {
  return [
    proposal.objective,
    proposal.problem && `Situação atual: ${proposal.problem}`,
    proposal.solution && `O que fazer: ${proposal.solution}`,
    proposal.indicators.length > 0 && `Indicadores possíveis: ${proposal.indicators.join("; ")}.`,
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 4000);
}
