import type { Database, Json } from "@/lib/supabase/database.types";
import type { createClient } from "@/lib/supabase/server";

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AuditTargetType = Database["public"]["Tables"]["platform_audit_log"]["Row"]["target_type"];

/**
 * Registra uma ação administrativa na trilha de auditoria da plataforma.
 * Fica fora de arquivos "use server" para não ser exposta como Server Action.
 */
export async function logAudit(
  supabase: SupabaseServerClient,
  actorId: string,
  action: string,
  targetType: AuditTargetType,
  targetId: string | null,
  details?: Record<string, Json>,
) {
  await supabase.from("platform_audit_log").insert({
    actor_id: actorId,
    action,
    target_type: targetType,
    target_id: targetId,
    details: details ?? null,
  });
}
