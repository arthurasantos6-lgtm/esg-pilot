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
  constructor(
    readonly status: number,
    /** Motivo informado pelo provedor; exibido apenas no teste do administrador. */
    readonly detail: string | null = null,
  ) {
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

/** O provedor respondeu sem texto: é diferente de um áudio realmente sem fala. */
export class EmptyTranscriptionError extends AiUnavailableError {
  constructor(readonly detail: string) {
    super("A IA não devolveu a transcrição do áudio. Você pode digitar a ideia.");
    this.name = "EmptyTranscriptionError";
  }
}

/** Mensagem do teste de conexão do administrador (sem dados de clientes): inclui o motivo do provedor. */
export function toAdminAiTestError(error: unknown): string {
  const message = toUserFacingAiError(error);
  if (error instanceof EmptyTranscriptionError) return `${message} (${error.detail})`;
  if (!(error instanceof ProviderHttpError)) return message;
  return `${message} (HTTP ${error.status}${error.detail ? `: ${error.detail}` : ""})`;
}

/** Falha na transcrição, sem o áudio nem o texto. */
export function logTranscriptionFailure(error: unknown) {
  const detail =
    error instanceof ProviderHttpError
      ? `status=${error.status}`
      : error instanceof EmptyTranscriptionError
        ? error.detail
        : error instanceof Error
          ? error.name
          : "unknown";
  console.error(`[ai] transcrição falhou: ${detail}`);
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
