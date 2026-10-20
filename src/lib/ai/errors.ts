import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** Erro já traduzido para exibição; nunca contém o conteúdo da ideia. */
export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

/** Resposta HTTP de erro de um provedor compatível com OpenAI. */
export class ProviderHttpError extends Error {
  constructor(readonly status: number) {
    super(`provider_http_${status}`);
    this.name = "ProviderHttpError";
  }
}

function messageForStatus(status: number | undefined): string {
  if (status === 401 || status === 403) return "A integração de IA está com problema de credencial. Avise o administrador da plataforma.";
  if (status === 404) return "O modelo de IA configurado não foi encontrado. Avise o administrador da plataforma.";
  if (status === 429) return "O serviço de IA atingiu o limite de uso no momento. Aguarde um pouco e tente novamente.";
  return "O serviço de IA está indisponível no momento. Tente novamente mais tarde.";
}

/** Converte erros dos provedores em mensagens seguras para o usuário. */
export function toUserFacingAiError(error: unknown): string {
  if (error instanceof AiUnavailableError) return error.message;
  if (error instanceof ProviderHttpError) return messageForStatus(error.status);
  if (error instanceof Anthropic.APIConnectionError) return "Não foi possível conectar ao serviço de IA. Tente novamente em instantes.";
  if (error instanceof Anthropic.APIError) return messageForStatus(error.status);
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "O serviço de IA demorou demais para responder. Tente novamente.";
  }
  if (error instanceof TypeError) return "Não foi possível conectar ao serviço de IA. Tente novamente em instantes.";
  return "Ocorreu um erro inesperado ao processar com a IA.";
}

/** Registra a falha sem o conteúdo da ideia ou da conversa. */
export function logAiFailure(operation: string, ideaId: string, error: unknown) {
  const detail =
    error instanceof Anthropic.APIError || error instanceof ProviderHttpError
      ? `status=${error.status}`
      : error instanceof Error
        ? error.name
        : "unknown";
  console.error(`[ai] ${operation} falhou para a ideia ${ideaId}: ${detail}`);
}
