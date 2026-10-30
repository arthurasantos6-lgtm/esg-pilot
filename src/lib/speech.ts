/**
 * Leitura em voz alta pelo navegador. O texto é dividido porque alguns
 * navegadores interrompem falas longas; `splitForSpeech` é puro para testes.
 */

const MAX_CHUNK_LENGTH = 220;

export function splitForSpeech(text: string): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]*\s*/g) ?? [];
  const chunks: string[] = [];
  for (const sentence of sentences) {
    const last = chunks.at(-1);
    if (last !== undefined && last.length + sentence.length <= MAX_CHUNK_LENGTH) {
      chunks[chunks.length - 1] = last + sentence;
    } else {
      for (let start = 0; start < sentence.length; start += MAX_CHUNK_LENGTH) {
        chunks.push(sentence.slice(start, start + MAX_CHUNK_LENGTH));
      }
    }
  }
  return chunks.map((chunk) => chunk.trim()).filter(Boolean);
}

/** Lê o texto em português; `onEnd` roda ao terminar ou ao ser interrompido. */
export function speak(text: string, onEnd: () => void) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const chunks = splitForSpeech(text);
  if (!chunks.length) {
    onEnd();
    return;
  }
  chunks.forEach((chunk, index) => {
    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = "pt-BR";
    utterance.onerror = onEnd;
    if (index === chunks.length - 1) utterance.onend = onEnd;
    synth.speak(utterance);
  });
}

export function stopSpeaking() {
  window.speechSynthesis.cancel();
}
