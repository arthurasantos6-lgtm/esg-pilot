import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/database.types";
import { buildLearningBase, LEARNING_STATUSES } from "@/lib/esg-project-proposal";

/** Ideias já decididas da empresa, com o motivo das rejeições. A sessão é da gestão: a RLS limita à própria empresa. */
export async function loadLearningBase(supabase: SupabaseClient<Database>, organizationId: string) {
  const [{ data: ideas }, { data: rejections }] = await Promise.all([
    supabase
      .from("ideas")
      .select("id, title, original_description, status, analysis")
      .eq("organization_id", organizationId)
      .in("status", [...LEARNING_STATUSES] as "approved"[]),
    supabase
      .from("idea_decisions")
      .select("idea_id, justification, created_at")
      .eq("organization_id", organizationId)
      .eq("to_status", "rejected")
      .order("created_at", { ascending: true }),
  ]);
  // Em ordem de data: a última rejeição de cada ideia é a que fica.
  const reasons = new Map((rejections ?? []).map((item) => [item.idea_id, item.justification]));
  return buildLearningBase((ideas ?? []).map((idea) => ({ ...idea, rejection_reason: reasons.get(idea.id) ?? null })));
}
