/** Interpretação da resposta do Gemini à transcrição. Módulo puro para testes. */

export const NO_SPEECH_MARKER = "[SEM_FALA]";

export type TranscriptionResponse = {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string; thought?: boolean }[] } }[];
  promptFeedback?: { blockReason?: string };
};

export type TranscriptionReading =
  | { kind: "text"; text: string }
  | { kind: "no_speech" }
  | { kind: "empty"; detail: string };

export function readTranscription(body: TranscriptionResponse): TranscriptionReading {
  const candidate = body.candidates?.[0];
  const parts = candidate?.content?.parts ?? [];
  const text = parts
    .filter((part) => !part.thought)
    .map((part) => part.text ?? "")
    .join("")
    .trim();
  if (text.includes(NO_SPEECH_MARKER)) return { kind: "no_speech" };
  if (text) return { kind: "text", text };
  const reason = body.promptFeedback?.blockReason ? `bloqueio=${body.promptFeedback.blockReason}` : `finishReason=${candidate?.finishReason ?? "ausente"}`;
  return { kind: "empty", detail: `resposta sem texto (${reason}, partes=${parts.length})` };
}
