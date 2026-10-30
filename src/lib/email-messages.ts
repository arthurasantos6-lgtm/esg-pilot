/**
 * Textos dos e-mails ao colaborador. Módulo puro para testes. Nunca incluem a
 * justificativa interna da gestão, e o e-mail de recebimento não repete texto
 * digitado por quem enviou, para o formulário não servir de canal de spam.
 */

export function ideaProtocol(ideaId: string) {
  return ideaId.replaceAll("-", "").slice(0, 8).toUpperCase();
}

type Message = { subject: string; text: string };

export function ideaReceivedMessage(input: { organizationName: string; protocol: string }): Message {
  return {
    subject: `Recebemos sua ideia (protocolo ${input.protocol})`,
    text: [
      `Sua ideia foi enviada para a gestão de ${input.organizationName}.`,
      `Protocolo: ${input.protocol}`,
      "Quando houver uma decisão, avisaremos por este e-mail.",
    ].join("\n\n"),
  };
}

/** Só decisões com retorno ao colaborador geram e-mail; as demais etapas são internas. */
export function ideaDecisionMessage(input: {
  status: string;
  organizationName: string;
  protocol: string;
  title: string;
  managerMessage?: string | null;
  ideaUrl?: string | null;
}): Message | null {
  const lead =
    input.status === "approved"
      ? `Sua ideia "${input.title}" foi aceita pela gestão de ${input.organizationName}.`
      : input.status === "rejected"
        ? `A gestão de ${input.organizationName} analisou sua ideia "${input.title}" e ela não seguirá adiante neste momento.`
        : input.status === "awaiting_info"
          ? `A gestão de ${input.organizationName} precisa de mais informações sobre sua ideia "${input.title}".`
          : null;
  if (!lead) return null;

  const subject =
    input.status === "approved"
      ? `Sua ideia foi aceita (protocolo ${input.protocol})`
      : input.status === "rejected"
        ? `Resposta sobre sua ideia (protocolo ${input.protocol})`
        : `Precisamos de mais informações (protocolo ${input.protocol})`;

  return {
    subject,
    text: [
      lead,
      input.managerMessage ? `Mensagem da gestão:\n${input.managerMessage}` : null,
      input.status === "awaiting_info" && input.ideaUrl
        ? `Para responder, abra este endereço no mesmo navegador em que enviou a ideia:\n${input.ideaUrl}`
        : null,
      `Protocolo: ${input.protocol}`,
    ]
      .filter(Boolean)
      .join("\n\n"),
  };
}
