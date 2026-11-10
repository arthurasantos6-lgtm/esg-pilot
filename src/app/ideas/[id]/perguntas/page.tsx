import { notFound, redirect } from "next/navigation";
import { z } from "zod";

/**
 * As perguntas guiadas foram ampliadas para o planejamento da execução, com
 * perguntas por tipo de iniciativa. Endereços antigos seguem para lá.
 */
export default async function GuidedQuestionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.guid().safeParse(id).success) notFound();
  redirect(`/ideas/${id}/planejamento`);
}
