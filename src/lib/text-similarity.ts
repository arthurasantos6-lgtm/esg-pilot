/**
 * Comparação simples de textos em português por termos em comum, usada para
 * escolher conhecimento relevante e sinalizar possíveis duplicidades.
 * Módulo puro para testes.
 */

const STOPWORDS = new Set([
  "para", "como", "com", "uma", "umas", "uns", "que", "dos", "das", "nos", "nas", "por", "pela", "pelo", "pelas", "pelos",
  "mais", "menos", "muito", "muita", "sem", "sobre", "entre", "este", "esta", "esse", "essa", "isso", "isto", "seu", "sua",
  "seus", "suas", "ser", "ter", "tem", "são", "foi", "mas", "quando", "onde", "qual", "quais", "cada", "todo", "toda", "aos",
]);

export function tokenize(text: string): Set<string> {
  const words = text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .match(/[a-z0-9]{3,}/g) ?? [];
  return new Set(words.filter((word) => !STOPWORDS.has(word)));
}

/** Coeficiente de Dice entre dois conjuntos de termos (0 a 1). */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return (2 * shared) / (a.size + b.size);
}

type Comparable = { id: string; text: string };

/** Ideias parecidas, da mais à menos semelhante. É uma sugestão: nada é excluído automaticamente. */
export function findSimilarIdeas<T extends Comparable>(target: Comparable, others: T[], threshold = 0.45) {
  const tokens = tokenize(target.text);
  return others
    .filter((other) => other.id !== target.id)
    .map((other) => ({ idea: other, similarity: similarity(tokens, tokenize(other.text)) }))
    .filter((match) => match.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);
}

type KnowledgeCandidate = { title: string; description: string; category: string };

const MAX_CONTEXTUAL_ITEMS = 8;

/**
 * Regras de classificação valem para toda avaliação; os demais registros
 * entram só quando têm termos em comum com a ideia, até o limite.
 */
export function selectRelevantKnowledge<T extends KnowledgeCandidate>(items: T[], text: string): T[] {
  const tokens = tokenize(text);
  const rules = items.filter((item) => item.category === "classification_rule");
  const contextual = items
    .filter((item) => item.category !== "classification_rule")
    .map((item) => {
      const itemTokens = tokenize(`${item.title} ${item.description}`);
      let shared = 0;
      for (const word of tokens) if (itemTokens.has(word)) shared += 1;
      return { item, shared };
    })
    .filter(({ shared }) => shared > 0)
    .sort((a, b) => b.shared - a.shared)
    .slice(0, MAX_CONTEXTUAL_ITEMS)
    .map(({ item }) => item);
  return [...rules, ...contextual];
}
