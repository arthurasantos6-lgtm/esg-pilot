/// <reference lib="webworker" />
import { env, pipeline, type AutomaticSpeechRecognitionPipeline } from "@huggingface/transformers";

/**
 * Transcrição no próprio aparelho: só o modelo é baixado, e o áudio não sai
 * daqui. Roda em um worker para a tela continuar respondendo.
 */

export type WhisperRequest = { samples: Float32Array; modelId: string };
export type WhisperResponse =
  | { type: "download"; loaded: number; total: number }
  | { type: "transcribing" }
  | { type: "result"; text: string }
  | { type: "error"; message: string };

env.allowLocalModels = false;

let loaded: { modelId: string; asr: AutomaticSpeechRecognitionPipeline } | null = null;
const send = (message: WhisperResponse) => self.postMessage(message);

async function load(modelId: string) {
  if (loaded?.modelId === modelId) return loaded.asr;
  const files = new Map<string, { loaded: number; total: number }>();
  const asr = await pipeline("automatic-speech-recognition", modelId, {
    device: "wasm",
    dtype: { encoder_model: "q8", decoder_model_merged: "q8" },
    progress_callback: (event) => {
      if (event.status !== "progress") return;
      files.set(event.file, { loaded: event.loaded, total: event.total });
      const all = [...files.values()];
      send({ type: "download", loaded: all.reduce((sum, file) => sum + file.loaded, 0), total: all.reduce((sum, file) => sum + file.total, 0) });
    },
  });
  loaded = { modelId, asr };
  return asr;
}

self.onmessage = async ({ data }: MessageEvent<WhisperRequest>) => {
  try {
    const asr = await load(data.modelId);
    send({ type: "transcribing" });
    const result = await asr(data.samples, { language: "portuguese", task: "transcribe", chunk_length_s: 30, stride_length_s: 5 });
    send({ type: "result", text: (Array.isArray(result) ? result[0].text : result.text).trim() });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.name : "unknown" });
  }
};
