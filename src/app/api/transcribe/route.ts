import { NextResponse } from "next/server";
import { logTranscriptionFailure, toUserFacingAiError } from "@/lib/ai/errors";
import { getTranscriptionConfig, transcribeAudio } from "@/lib/ai/transcription";
import { assertModuleEnabled, requireCompanyContext } from "@/lib/auth";
import { isWav, MAX_WAV_BYTES } from "@/lib/audio-wav";
import { canCreateIdeas } from "@/lib/idea-permissions";

// Abaixo do limite de tempo da Vercel, com folga para as novas tentativas.
export const maxDuration = 60;

/** Limite por pessoa em 24 h: o acesso por link não exige cadastro e cada áudio tem custo. */
const MAX_TRANSCRIPTIONS_PER_DAY = 30;

const failure = (message: string, status: number) => NextResponse.json({ error: message }, { status });

export async function POST(request: Request) {
  const context = await requireCompanyContext();
  assertModuleEnabled(context.organization.enabled_modules, "ideas", "Ideias");
  if (!canCreateIdeas(context.membership)) return failure("A gravação é usada ao enviar ideias pelo link da empresa.", 403);
  if (!getTranscriptionConfig()) return failure("A transcrição de áudio não está configurada nesta plataforma.", 503);

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_WAV_BYTES) return failure("O áudio pode ter até 2 minutos.", 413);
  const wav = new Uint8Array(await request.arrayBuffer());
  if (wav.length > MAX_WAV_BYTES) return failure("O áudio pode ter até 2 minutos.", 413);
  if (!isWav(wav)) return failure("Formato de áudio não reconhecido.", 415);

  const { count, error: countError } = await context.supabase
    .from("transcription_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", context.user.id)
    .gte("created_at", new Date(Date.now() - 86_400_000).toISOString());
  if (countError) return failure("A transcrição de áudio não está disponível no momento.", 503);
  if ((count ?? 0) >= MAX_TRANSCRIPTIONS_PER_DAY) {
    return failure(`Você atingiu o limite de ${MAX_TRANSCRIPTIONS_PER_DAY} áudios em 24 horas. Você pode digitar a ideia.`, 429);
  }
  const { error: insertError } = await context.supabase.from("transcription_requests").insert({
    organization_id: context.membership.organization_id,
    user_id: context.user.id,
    audio_bytes: wav.length,
  });
  if (insertError) return failure("A transcrição de áudio não está disponível no momento.", 503);

  try {
    const text = await transcribeAudio(wav);
    if (!text) return failure("Não identificamos fala no áudio. Tente gravar de novo.", 422);
    return NextResponse.json({ text });
  } catch (error) {
    logTranscriptionFailure(error);
    return failure(toUserFacingAiError(error), 502);
  }
}
