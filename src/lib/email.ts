import "server-only";
import nodemailer from "nodemailer";

export function isEmailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);
}

/**
 * Envia um e-mail de texto. Falhas só ficam no log, sem endereço nem conteúdo:
 * um problema no e-mail não pode impedir o envio da ideia nem a decisão.
 */
export async function sendEmail(to: string, message: { subject: string; text: string }) {
  if (!isEmailConfigured()) return;
  try {
    const port = Number(process.env.SMTP_PORT ?? 587);
    const transport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
    await transport.sendMail({ from: process.env.EMAIL_FROM, to, subject: message.subject, text: message.text });
  } catch (error) {
    console.error(`[email] falha no envio: ${error instanceof Error ? error.name : "unknown"}`);
  }
}
