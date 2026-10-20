import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";

/**
 * Cliente com a chave service role, que ignora RLS. Usado apenas para gravar
 * o que o próprio servidor produz (respostas do copiloto e avaliações da IA),
 * sempre depois de a autorização do usuário ter sido verificada com a sessão
 * dele. Nunca use para leituras em nome do usuário.
 *
 * Retorna `null` quando `SUPABASE_SERVICE_ROLE_KEY` não está configurada; os
 * recursos de IA ficam então indisponíveis, sem afetar o envio de ideias.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return null;

  return createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ServiceClient = NonNullable<ReturnType<typeof createServiceClient>>;
