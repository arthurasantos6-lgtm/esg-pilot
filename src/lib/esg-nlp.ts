/**
 * Processamento de texto em português para o motor ESG local: normaliza para
 * comparação preservando o texto original, para que as evidências citem
 * exatamente o que a pessoa escreveu. Módulo puro, sem chamadas externas.
 */

export type Token = { value: string; stem: string; start: number; end: number; sentence: number };

/** Sem acentos e em minúsculas, com o índice original de cada caractere. */
export function normalizeForMatch(text: string) {
  let normalized = "";
  const offsets: number[] = [];
  for (let index = 0; index < text.length; index += 1) {
    const folded = text[index].normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    for (const character of folded) {
      normalized += character;
      offsets.push(index);
    }
  }
  return { normalized, offsets };
}

/** Plural e variações regulares; verbos ficam como variantes explícitas no dicionário. */
export function stem(word: string) {
  if (word.length <= 3 || /^\d/.test(word)) return word;
  if (word.endsWith("coes")) return `${word.slice(0, -4)}cao`;
  if (word.endsWith("oes") || word.endsWith("aes")) return `${word.slice(0, -3)}ao`;
  if (word.endsWith("ais")) return `${word.slice(0, -2)}l`;
  if (word.endsWith("eis")) return `${word.slice(0, -2)}l`;
  if (word.endsWith("ns")) return `${word.slice(0, -2)}m`;
  if (word.endsWith("res") || word.endsWith("zes")) return word.slice(0, -2);
  if (word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** Palavras sem conteúdo. Negações, números e unidades nunca entram aqui. */
const FILLERS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "em", "no", "na", "nos", "nas", "um", "uma", "uns", "umas",
  "e", "para", "pra", "pro", "por", "pelo", "pela", "pelos", "pelas", "com", "ao", "aos", "se", "que",
]);

const NEGATIONS = new Set(["nao", "nunca", "nem", "sem", "tampouco", "jamais", "falta", "faltam"]);

/** Termos de conteúdo do texto; as posições apontam para o texto original. */
export function tokenize(text: string): Token[] {
  const { normalized, offsets } = normalizeForMatch(text);
  const tokens: Token[] = [];
  let sentence = 0;
  let cursor = 0;
  for (const match of normalized.matchAll(/[a-z0-9]+(?:[.,]\d+)*/g)) {
    if (/[.!?\n;]/.test(normalized.slice(cursor, match.index))) sentence += 1;
    cursor = match.index + match[0].length;
    if (FILLERS.has(match[0])) continue;
    tokens.push({
      value: match[0],
      stem: stem(match[0]),
      start: offsets[match.index],
      end: offsets[match.index + match[0].length - 1] + 1,
      sentence,
    });
  }
  return tokens;
}

export function phraseStems(phrase: string) {
  return tokenize(phrase).map((token) => token.stem);
}

/** Todas as ocorrências da expressão, como posições na lista de termos. */
export function findPhrase(tokens: Token[], stems: string[]) {
  const found: { first: number; last: number }[] = [];
  if (!stems.length) return found;
  for (let index = 0; index + stems.length <= tokens.length; index += 1) {
    if (stems.every((value, offset) => tokens[index + offset].stem === value)) {
      found.push({ first: index, last: index + stems.length - 1 });
    }
  }
  return found;
}

/** Há negação até três termos antes, na mesma frase? */
export function isNegated(tokens: Token[], first: number) {
  for (let index = first - 1; index >= 0 && index >= first - 3; index -= 1) {
    if (tokens[index].sentence !== tokens[first].sentence) return false;
    if (NEGATIONS.has(tokens[index].value)) return true;
  }
  return false;
}

/** Algum dos termos aparece perto da posição, na mesma frase? */
export function hasNearby(tokens: Token[], first: number, last: number, stems: string[], window = 6) {
  const start = Math.max(0, first - window);
  const end = Math.min(tokens.length - 1, last + window);
  for (let index = start; index <= end; index += 1) {
    if (index >= first && index <= last) continue;
    if (tokens[index].sentence === tokens[first].sentence && stems.includes(tokens[index].stem)) return true;
  }
  return false;
}

/* ---------- Similaridade TF-IDF ---------- */

export function termsWithBigrams(text: string) {
  const stems = tokenize(text).map((token) => token.stem);
  return [...stems, ...stems.slice(1).map((value, index) => `${stems[index]} ${value}`)];
}

function counts(terms: string[]) {
  const map = new Map<string, number>();
  for (const term of terms) map.set(term, (map.get(term) ?? 0) + 1);
  return map;
}

export function buildTfIdf(documents: { id: string; text: string }[]) {
  const termLists = documents.map((document) => counts(termsWithBigrams(document.text)));
  const documentFrequency = new Map<string, number>();
  for (const terms of termLists) for (const term of terms.keys()) documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
  const idf = (term: string) => Math.log((documents.length + 1) / ((documentFrequency.get(term) ?? 0) + 1)) + 1;
  const vectorize = (terms: Map<string, number>) => {
    const vector = new Map<string, number>();
    let norm = 0;
    for (const [term, count] of terms) {
      const weight = (1 + Math.log(count)) * idf(term);
      vector.set(term, weight);
      norm += weight * weight;
    }
    return { vector, norm: Math.sqrt(norm) };
  };
  const vectors = termLists.map(vectorize);
  return {
    /** Cosseno do texto contra cada documento, de 0 a 1. */
    similarities(text: string) {
      const query = vectorize(counts(termsWithBigrams(text)));
      return documents.map((document, index) => {
        const target = vectors[index];
        let dot = 0;
        for (const [term, weight] of query.vector) dot += weight * (target.vector.get(term) ?? 0);
        const denominator = query.norm * target.norm;
        return { id: document.id, similarity: denominator ? dot / denominator : 0 };
      });
    },
  };
}
