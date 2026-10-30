import { ESG_SUBCATEGORIES } from "./esg-engine.ts";
import { LEXICON_RULES, LEXICON_VERSION, MONEY_PATTERN, QUANTITY_PATTERN, SIGNAL_TERMS, SUBCATEGORY_EXAMPLES } from "./esg-lexicon.ts";
import { buildTfIdf, findPhrase, hasNearby, isNegated, normalizeForMatch, phraseStems, tokenize, type Token } from "./esg-nlp.ts";

/**
 * Classificação temática local, sem IA externa: regras explicáveis mais
 * similaridade TF-IDF. Os escores são heurísticos, não probabilidades, e os
 * limiares ainda não foram calibrados com propostas rotuladas por especialistas.
 */

export const LOCAL_ENGINE_VERSION = "2.0.0";

/** A regra soma no máximo uma vez, e a subcategoria satura aqui: repetir palavras não aumenta o escore. */
const MAX_SUBCATEGORY_POINTS = 6;
const NEGATED_FACTOR = 0.5;
const RULE_SHARE = 0.75;
const SELECT_MIN_POINTS = 2;
/** Um sinal fraco isolado (peso 1) não classifica, mesmo repetido. */
const SELECT_MIN_POINTS_WITH_SIMILARITY = 1.5;
const SELECT_MIN_SIMILARITY = 0.1;

export type RuleMatch = {
  rule_id: string;
  subcategory: string;
  matched_text: string;
  score: number;
  negated: boolean;
  explanation: string;
};

const compiledRules = LEXICON_RULES.map((rule) => ({
  ...rule,
  phrases: rule.terms.map(phraseStems),
  context: rule.contextTerms?.flatMap(phraseStems),
  exclude: rule.exclusions?.flatMap(phraseStems),
}));

const similarityIndex = buildTfIdf(Object.entries(SUBCATEGORY_EXAMPLES).map(([id, text]) => ({ id, text })));

function matchRule(rule: (typeof compiledRules)[number], tokens: Token[], text: string): RuleMatch | null {
  let negatedMatch: RuleMatch | null = null;
  // Expressões mais longas primeiro: a evidência fica mais precisa.
  for (const phrase of [...rule.phrases].sort((a, b) => b.length - a.length)) {
    for (const { first, last } of findPhrase(tokens, phrase)) {
      if (rule.exclude && hasNearby(tokens, first, last, rule.exclude)) continue;
      if (rule.context && !hasNearby(tokens, first, last, rule.context, 8)) continue;
      const negated = isNegated(tokens, first);
      const match: RuleMatch = {
        rule_id: rule.id,
        subcategory: rule.subcategory,
        matched_text: text.slice(tokens[first].start, tokens[last].end),
        score: negated ? rule.weight * NEGATED_FACTOR : rule.weight,
        negated,
        explanation: rule.explanation,
      };
      if (!negated) return match;
      negatedMatch ??= match;
    }
  }
  return negatedMatch;
}

export type Signals = Record<keyof typeof SIGNAL_TERMS | "quantity" | "money", boolean>;

export function detectSignals(text: string): Signals {
  const tokens = tokenize(text);
  const signals = {} as Signals;
  for (const [signal, terms] of Object.entries(SIGNAL_TERMS)) {
    signals[signal as keyof typeof SIGNAL_TERMS] = terms.some((term) => findPhrase(tokens, phraseStems(term)).length > 0);
  }
  const { normalized } = normalizeForMatch(text);
  signals.quantity = QUANTITY_PATTERN.test(normalized);
  signals.money = MONEY_PATTERN.test(normalized);
  return signals;
}

const MISSING_LABELS: [keyof Signals, string][] = [
  ["problem", "situação atual ou problema"],
  ["action", "ação proposta"],
  ["audience", "quem é afetado"],
  ["baseline", "linha de base (como é hoje)"],
  ["measurement", "como medir o resultado"],
  ["resources", "recursos ou equipamentos envolvidos"],
];

export type ClassificationResult = {
  status: "classified" | "unclassified_pending_review";
  primary_pillar: "E" | "S" | "G" | null;
  secondary_pillars: ("E" | "S" | "G")[];
  subcategories: string[];
  matches: RuleMatch[];
  match_score: number;
  match_score_type: "heuristic_not_probability";
  needs_human_review: boolean;
  review_reasons: string[];
  missing_information: string[];
  signals: Signals;
  engine_version: string;
  lexicon_version: string;
};

const pillarOf = (code: string) => ESG_SUBCATEGORIES.find((item) => item.code === code)?.pillar as "E" | "S" | "G";

export function classifyText(text: string): ClassificationResult {
  const tokens = tokenize(text);
  const matches = compiledRules.flatMap((rule) => matchRule(rule, tokens, text) ?? []);

  const similarities = new Map(similarityIndex.similarities(text).map((item) => [item.id, item.similarity]));
  const subcategoryScores = ESG_SUBCATEGORIES.map(({ code }) => {
    const own = matches.filter((match) => match.subcategory === code);
    const points = Math.min(MAX_SUBCATEGORY_POINTS, own.reduce((sum, match) => sum + match.score, 0));
    const similarity = similarities.get(code) ?? 0;
    const selected =
      points >= SELECT_MIN_POINTS || (points >= SELECT_MIN_POINTS_WITH_SIMILARITY && similarity >= SELECT_MIN_SIMILARITY);
    return { code, points, similarity, selected, score: (points / MAX_SUBCATEGORY_POINTS) * RULE_SHARE + similarity * (1 - RULE_SHARE) };
  }).filter((item) => item.selected);

  const pillarPoints = new Map<"E" | "S" | "G", number>();
  for (const item of subcategoryScores) {
    const pillar = pillarOf(item.code);
    pillarPoints.set(pillar, (pillarPoints.get(pillar) ?? 0) + item.points);
  }
  const ranked = [...pillarPoints.entries()].sort((a, b) => b[1] - a[1]);
  const tied = ranked.length > 1 && ranked[0][1] === ranked[1][1];

  const signals = detectSignals(text);
  const selectedCodes = new Set<string>(subcategoryScores.map((item) => item.code));
  // Menções negadas ficam visíveis à gestão mesmo sem classificar.
  const relevant = matches.filter((match) => selectedCodes.has(match.subcategory) || match.negated);

  const reviewReasons: string[] = [];
  if (!subcategoryScores.length) reviewReasons.push("Evidências insuficientes para classificar");
  if (tied) reviewReasons.push("Empate entre pilares");
  if (relevant.length && relevant.every((match) => match.negated)) {
    reviewReasons.push("O texto menciona o tema em forma negativa ou como ausência");
  }
  if (signals.critical) reviewReasons.push("Menciona tema sensível: requer análise de especialista");

  return {
    status: subcategoryScores.length ? "classified" : "unclassified_pending_review",
    primary_pillar: ranked[0]?.[0] ?? null,
    secondary_pillars: ranked.slice(1).map(([pillar]) => pillar),
    subcategories: [...subcategoryScores].sort((a, b) => b.score - a.score).map((item) => item.code),
    matches: relevant,
    match_score: Math.round(Math.max(0, ...subcategoryScores.map((item) => item.score)) * 100) / 100,
    match_score_type: "heuristic_not_probability",
    needs_human_review: reviewReasons.length > 0,
    review_reasons: reviewReasons,
    missing_information: MISSING_LABELS.filter(([signal]) => !signals[signal]).map(([, label]) => label),
    signals,
    engine_version: LOCAL_ENGINE_VERSION,
    lexicon_version: LEXICON_VERSION,
  };
}
