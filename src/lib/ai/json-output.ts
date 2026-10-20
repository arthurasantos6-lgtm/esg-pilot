import { z } from "zod";

/**
 * Instruções para provedores sem "structured outputs" nativo: o modelo recebe
 * o JSON Schema e a resposta é validada com o mesmo esquema Zod.
 */
export function jsonInstructions(schema: z.ZodType): string {
  return [
    "Responda SOMENTE com um objeto JSON válido, sem texto antes ou depois e sem blocos de código.",
    "Use exatamente as chaves deste JSON Schema; quando não houver informação para um campo que aceita null, use null.",
    JSON.stringify(z.toJSONSchema(schema)),
  ].join("\n");
}

/** Extrai o objeto JSON de uma resposta (tolerando cercas de código e texto ao redor). */
export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Mensagem curta (sem conteúdo do usuário) descrevendo por que o JSON não passou na validação. */
export function describeSchemaIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 5)
    .map((issue) => `${issue.path.join(".") || "(raiz)"}: ${issue.message}`)
    .join("; ");
}
