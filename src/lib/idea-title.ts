/**
 * Título curto da ideia, a partir do texto que a pessoa escreveu, por regras e
 * sem IA: prefere a frase em que ela propõe algo, tira o "sugiro", "acho que",
 * "podemos" do começo e corta em até 7 palavras, sem terminar em "de", "e" etc.
 * Ex.: "Sugiro instalar sensores de presença nos corredores e banheiros..." →
 * "Instalar sensores de presença nos corredores".
 */

const MAX_WORDS = 7;
const MAX_LENGTH = 60;
export const FALLBACK_TITLE = "Ideia ESG";

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Expressões de abertura que não dizem o que é a ideia (comparadas sem acento). */
const LEADS = [
  "eu acho que", "acho que", "acredito que", "eu sugiro que", "eu sugiro", "sugiro que", "sugiro", "sugestao:", "sugestao",
  "eu proponho", "proponho que", "proponho", "minha ideia e", "minha ideia", "a ideia e", "ideia:", "seria bom", "seria legal",
  "seria interessante", "seria otimo", "seria possivel", "nos podemos", "a gente podia", "a gente pode", "podemos", "poderiamos",
  "precisamos", "deveriamos", "devemos", "gostaria de", "que tal", "vamos", "da para", "daria para", "dava para", "por que nao",
  "a empresa poderia", "a empresa deveria", "poderia", "deveria", "e importante", "seria",
];

const PROPOSING = /\b(sugiro|proponho|podemos|poderiamos|precisamos|deveriamos|devemos|seria bom|que tal|daria para|dava para|da para|minha ideia|gostaria)\b/;

const TRAILING_STOPWORDS = new Set([
  "a", "o", "as", "os", "um", "uma", "de", "da", "do", "das", "dos", "e", "ou", "em", "no", "na", "nos", "nas", "para", "pra",
  "com", "sem", "por", "pelo", "pela", "que", "ao", "aos", "à", "às", "mais", "muito", "se", "como", "acima", "abaixo", "entre",
  "sobre", "até", "cerca", "durante", "quando", "onde",
].map(fold));

function stripLeads(sentence: string) {
  let text = sentence.trim();
  for (let changed = true; changed; ) {
    changed = false;
    const folded = fold(text);
    for (const lead of LEADS) {
      if (folded.startsWith(`${lead} `) || folded === lead) {
        text = text.slice(lead.length).replace(/^[\s,:;-]+/, "");
        changed = true;
        break;
      }
    }
  }
  return text;
}

export function shortTitle(description: string): string {
  const sentences = description
    .split(/[\n.!?;]+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
  if (!sentences.length) return FALLBACK_TITLE;

  // A frase em que a pessoa propõe algo descreve melhor a ideia que a do problema.
  const chosen = sentences.find((sentence) => PROPOSING.test(fold(sentence))) ?? sentences[0];
  let core = stripLeads(chosen);
  // Até a primeira vírgula, se o trecho antes dela já diz algo.
  const beforeComma = core.split(",")[0].trim();
  if (beforeComma.split(/\s+/).length >= 3) core = beforeComma;

  let words = core.replace(/["“”'()]/g, "").split(/\s+/).filter(Boolean).slice(0, MAX_WORDS);
  while (words.length > 1 && TRAILING_STOPWORDS.has(fold(words[words.length - 1]))) words = words.slice(0, -1);
  let title = words.join(" ");
  if (title.length > MAX_LENGTH) title = title.slice(0, MAX_LENGTH).replace(/\s+\S*$/, "");
  title = title.replace(/[\s,:;-]+$/, "");
  if (title.length < 3) return FALLBACK_TITLE;
  return title.charAt(0).toLocaleUpperCase("pt-BR") + title.slice(1);
}
