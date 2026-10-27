import { z } from "zod";

const createLinkSchema = z.object({
  label: z.string().trim().max(120).optional(),
  expiresInDays: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().refine((days) => [7, 30, 90, 365].includes(days), "Validade inválida.").optional(),
  ),
});

/** Lê o formulário de novo link; validade em dias vira data absoluta. */
export function readCreateLinkForm(formData: FormData, now = Date.now()) {
  const parsed = createLinkSchema.safeParse({
    label: formData.get("label") || undefined,
    expiresInDays: formData.get("expiresInDays"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message } as const;
  return {
    label: parsed.data.label || null,
    expiresAt: parsed.data.expiresInDays ? new Date(now + parsed.data.expiresInDays * 86_400_000).toISOString() : null,
  } as const;
}
