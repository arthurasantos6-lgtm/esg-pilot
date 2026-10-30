/**
 * Resolução do provedor de IA a partir de variáveis de ambiente. Módulo puro
 * (recebe o ambiente como parâmetro) para poder ser testado.
 *
 * - AI_PROVIDER: "anthropic", "openai-compatible" ou um atalho: "ollama",
 *   "gemini", "groq" (que apenas preenchem o endereço da API).
 * - AI_MODEL: modelo a usar (obrigatório fora da Anthropic).
 * - AI_BASE_URL: endereço da API compatível com OpenAI (opcional com atalho).
 * - AI_API_KEY: chave do provedor compatível (opcional no Ollama local).
 * - ANTHROPIC_API_KEY / ANTHROPIC_MODEL: provedor Anthropic (Claude).
 */

export type AiProviderKind = "anthropic" | "openai-compatible";

export type AiConfig = {
  kind: AiProviderKind;
  /** Nome exibido no painel administrativo. */
  label: string;
  model: string;
  baseUrl: string | null;
  apiKey: string | null;
};

type Env = Record<string, string | undefined>;

export const OPENAI_COMPATIBLE_PRESETS: Record<string, { label: string; baseUrl: string; requiresKey: boolean }> = {
  ollama: { label: "Ollama (local)", baseUrl: "http://localhost:11434/v1", requiresKey: false },
  gemini: { label: "Google Gemini (API compatível com OpenAI)", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", requiresKey: true },
  groq: { label: "Groq", baseUrl: "https://api.groq.com/openai/v1", requiresKey: true },
};

const DEFAULT_ANTHROPIC_MODEL = "claude-opus-5-5";

function clean(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Retorna `null` quando nenhuma IA está configurada (a plataforma funciona sem IA). */
export function resolveAiConfig(env: Env): AiConfig | null {
  const provider = clean(env.AI_PROVIDER)?.toLowerCase() ?? null;
  const anthropicKey = clean(env.ANTHROPIC_API_KEY);

  if (provider === "anthropic" || (!provider && anthropicKey && !clean(env.AI_BASE_URL))) {
    if (!anthropicKey) return null;
    return {
      kind: "anthropic",
      label: "Anthropic (Claude)",
      model: clean(env.ANTHROPIC_MODEL) ?? clean(env.AI_MODEL) ?? DEFAULT_ANTHROPIC_MODEL,
      baseUrl: null,
      apiKey: anthropicKey,
    };
  }

  const preset = provider ? OPENAI_COMPATIBLE_PRESETS[provider] : undefined;
  if (provider && provider !== "openai-compatible" && !preset) return null;

  const baseUrl = clean(env.AI_BASE_URL) ?? preset?.baseUrl ?? null;
  const model = clean(env.AI_MODEL);
  const apiKey = clean(env.AI_API_KEY);
  if (!baseUrl || !model) return null;
  if (preset?.requiresKey && !apiKey) return null;

  return {
    kind: "openai-compatible",
    label: preset?.label ?? "API compatível com OpenAI",
    model,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
  };
}

/**
 * Transcrição de áudio: hoje disponível com o Gemini, cuja API nativa aceita
 * áudio. Usa AI_TRANSCRIPTION_MODEL e, se ela falhar ou não existir, AI_MODEL.
 */
export function resolveTranscriptionConfig(env: Env): { models: string[]; apiKey: string } | null {
  if (clean(env.AI_PROVIDER)?.toLowerCase() !== "gemini") return null;
  const apiKey = clean(env.AI_API_KEY);
  const models = [clean(env.AI_TRANSCRIPTION_MODEL), clean(env.AI_MODEL)].flatMap((model) =>
    model ? [model.replace(/^models\//, "")] : [],
  );
  return apiKey && models.length ? { models: [...new Set(models)], apiKey } : null;
}

/** Modelos de transcrição não conversam nem geram JSON: não servem como AI_MODEL. */
export function isTranscriptionOnlyModel(model: string | null | undefined) {
  return Boolean(model && /transcri/i.test(model));
}

/** Variáveis que impedem a configuração da IA; nunca repete os valores do ambiente. */
export function diagnoseAiEnv(env: Env): string[] {
  if (resolveAiConfig(env)) return [];
  const provider = clean(env.AI_PROVIDER)?.toLowerCase() ?? null;
  if (provider === "anthropic") return ["ANTHROPIC_API_KEY não definida."];

  const preset = provider ? OPENAI_COMPATIBLE_PRESETS[provider] : undefined;
  if (provider && provider !== "openai-compatible" && !preset) {
    const accepted = ["anthropic", "openai-compatible", ...Object.keys(OPENAI_COMPATIBLE_PRESETS)].join(", ");
    return [`AI_PROVIDER com valor não reconhecido. Use: ${accepted}.`];
  }
  if (!provider && !clean(env.AI_BASE_URL)) return ["AI_PROVIDER não definida."];

  const problems: string[] = [];
  if (!preset && !clean(env.AI_BASE_URL)) problems.push("AI_BASE_URL não definida.");
  if (!clean(env.AI_MODEL)) problems.push("AI_MODEL não definida.");
  if (preset?.requiresKey && !clean(env.AI_API_KEY)) problems.push("AI_API_KEY não definida.");
  return problems;
}

/** Descrição segura para exibição: nunca inclui a chave. */
export function describeAiConfig(config: AiConfig | null) {
  if (!config) return null;
  let host: string | null = null;
  if (config.baseUrl) {
    try {
      host = new URL(config.baseUrl).host;
    } catch {
      host = "endereço inválido";
    }
  }
  return { provider: config.label, model: config.model, host, hasApiKey: Boolean(config.apiKey) };
}
