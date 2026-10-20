"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requirePlatformAdmin } from "@/lib/auth";
import { logAudit } from "@/lib/platform-audit";
import type { Json } from "@/lib/supabase/database.types";

function parseList(value: FormDataEntryValue | null): string[] {
  return String(value ?? "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const dimensionSchema = z.object({
  keywords: z.array(z.string().min(1)).min(1, "Informe ao menos um termo por dimensão."),
  explanation: z.string().trim().min(5, "Descreva a explicação de cada dimensão."),
  suggestedMetrics: z.array(z.string().min(1)),
});

const criteriaSchema = z
  .object({
    label: z.string().trim().min(2, "Informe um nome para a versão.").max(160),
    notes: z.string().trim().max(2000).optional(),
    thresholdAlto: z.coerce.number().int().min(1, "Informe um limite válido."),
    thresholdMedio: z.coerce.number().int().min(1, "Informe um limite válido."),
    E: dimensionSchema,
    S: dimensionSchema,
    G: dimensionSchema,
  })
  .refine((value) => value.thresholdAlto >= value.thresholdMedio, {
    message: "O limite para potencial alto deve ser maior ou igual ao limite médio.",
    path: ["thresholdAlto"],
  });

function readCriteriaForm(formData: FormData) {
  return {
    label: formData.get("label"),
    notes: formData.get("notes") || undefined,
    thresholdAlto: formData.get("thresholdAlto"),
    thresholdMedio: formData.get("thresholdMedio"),
    E: {
      keywords: parseList(formData.get("E_keywords")),
      explanation: formData.get("E_explanation"),
      suggestedMetrics: parseList(formData.get("E_metrics")),
    },
    S: {
      keywords: parseList(formData.get("S_keywords")),
      explanation: formData.get("S_explanation"),
      suggestedMetrics: parseList(formData.get("S_metrics")),
    },
    G: {
      keywords: parseList(formData.get("G_keywords")),
      explanation: formData.get("G_explanation"),
      suggestedMetrics: parseList(formData.get("G_metrics")),
    },
  };
}

export async function createCriteriaVersion(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const parsed = criteriaSchema.safeParse(readCriteriaForm(formData));

  if (!parsed.success) {
    redirect(`/admin/esg-criteria/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { data, error } = await supabase
    .from("esg_criteria_versions")
    .insert({
      label: parsed.data.label,
      notes: parsed.data.notes || null,
      status: "draft",
      dimensions: { E: parsed.data.E, S: parsed.data.S, G: parsed.data.G } as unknown as Json,
      potential_thresholds: { alto: parsed.data.thresholdAlto, medio: parsed.data.thresholdMedio } as unknown as Json,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/admin/esg-criteria/new?error=${encodeURIComponent("Não foi possível criar a versão de critérios.")}`);
  }

  await logAudit(supabase, user.id, "esg_criteria_version_created", "esg_criteria_version", data.id, {
    label: parsed.data.label,
  });

  revalidatePath("/admin/esg-criteria");
  redirect(`/admin/esg-criteria/${data.id}?created=1`);
}

export async function updateCriteriaVersion(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const criteriaVersionId = formData.get("criteriaVersionId");
  const parsed = criteriaSchema.safeParse(readCriteriaForm(formData));

  if (!parsed.success) {
    redirect(`/admin/esg-criteria/${criteriaVersionId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const idResult = z.string().uuid().safeParse(criteriaVersionId);
  if (!idResult.success) {
    redirect("/admin/esg-criteria?error=Identificador%20inv%C3%A1lido.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("esg_criteria_versions")
    .select("status")
    .eq("id", idResult.data)
    .maybeSingle();

  if (existingError || !existing) {
    redirect("/admin/esg-criteria?error=Vers%C3%A3o%20n%C3%A3o%20encontrada.");
  }
  if (existing.status !== "draft") {
    redirect(
      `/admin/esg-criteria/${idResult.data}?error=${encodeURIComponent(
        "Apenas versões em rascunho podem ser editadas. Duplique esta versão para criar um novo rascunho.",
      )}`,
    );
  }

  const { error } = await supabase
    .from("esg_criteria_versions")
    .update({
      label: parsed.data.label,
      notes: parsed.data.notes || null,
      dimensions: { E: parsed.data.E, S: parsed.data.S, G: parsed.data.G } as unknown as Json,
      potential_thresholds: { alto: parsed.data.thresholdAlto, medio: parsed.data.thresholdMedio } as unknown as Json,
    })
    .eq("id", idResult.data);

  if (error) {
    redirect(`/admin/esg-criteria/${idResult.data}?error=${encodeURIComponent("Não foi possível salvar as alterações.")}`);
  }

  await logAudit(supabase, user.id, "esg_criteria_version_updated", "esg_criteria_version", idResult.data, {
    label: parsed.data.label,
  });

  revalidatePath("/admin/esg-criteria");
  revalidatePath(`/admin/esg-criteria/${idResult.data}`);
  redirect(`/admin/esg-criteria/${idResult.data}?updated=1`);
}

export async function activateCriteriaVersion(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const idResult = z.string().uuid().safeParse(formData.get("criteriaVersionId"));

  if (!idResult.success) {
    redirect("/admin/esg-criteria?error=Identificador%20inv%C3%A1lido.");
  }

  const { error } = await supabase.rpc("platform_activate_criteria_version", { target_id: idResult.data });

  if (error) {
    redirect(`/admin/esg-criteria/${idResult.data}?error=${encodeURIComponent("Não foi possível ativar esta versão.")}`);
  }

  await logAudit(supabase, user.id, "esg_criteria_version_activated", "esg_criteria_version", idResult.data);

  revalidatePath("/admin/esg-criteria");
  revalidatePath(`/admin/esg-criteria/${idResult.data}`);
  redirect(`/admin/esg-criteria/${idResult.data}?activated=1`);
}

export async function cloneCriteriaVersion(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const idResult = z.string().uuid().safeParse(formData.get("sourceId"));

  if (!idResult.success) {
    redirect("/admin/esg-criteria?error=Identificador%20inv%C3%A1lido.");
  }

  const { data: source, error: sourceError } = await supabase
    .from("esg_criteria_versions")
    .select("label, dimensions, potential_thresholds, notes")
    .eq("id", idResult.data)
    .maybeSingle();

  if (sourceError || !source) {
    redirect("/admin/esg-criteria?error=Vers%C3%A3o%20de%20origem%20n%C3%A3o%20encontrada.");
  }

  const { data, error } = await supabase
    .from("esg_criteria_versions")
    .insert({
      label: `${source.label} (cópia)`,
      status: "draft",
      dimensions: source.dimensions,
      potential_thresholds: source.potential_thresholds,
      notes: source.notes,
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect("/admin/esg-criteria?error=N%C3%A3o%20foi%20poss%C3%ADvel%20duplicar%20a%20vers%C3%A3o.");
  }

  await logAudit(supabase, user.id, "esg_criteria_version_created", "esg_criteria_version", data.id, {
    cloned_from: idResult.data,
  });

  revalidatePath("/admin/esg-criteria");
  redirect(`/admin/esg-criteria/${data.id}?created=1`);
}

const knowledgeCategories = [
  "concept",
  "evaluation_criteria",
  "classification_rule",
  "reference",
  "guiding_question",
  "recommendation",
] as const;

const knowledgeSchema = z.object({
  title: z.string().trim().min(2, "Informe um título.").max(160),
  description: z.string().trim().min(2, "Descreva o conteúdo.").max(4000),
  category: z.enum(knowledgeCategories),
  source: z.string().trim().max(300).optional(),
  status: z.enum(["draft", "active", "archived"]),
});

export async function createKnowledgeItem(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const parsed = knowledgeSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    source: formData.get("source") || undefined,
    status: formData.get("status") || "active",
  });

  if (!parsed.success) {
    redirect(`/admin/knowledge/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { data, error } = await supabase
    .from("esg_knowledge_items")
    .insert({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      source: parsed.data.source || null,
      status: parsed.data.status,
      created_by: user.id,
      updated_by: user.id,
    })
    .select("id")
    .single();

  if (error || !data) {
    redirect(`/admin/knowledge/new?error=${encodeURIComponent("Não foi possível criar o registro.")}`);
  }

  await logAudit(supabase, user.id, "esg_knowledge_item_created", "esg_knowledge_item", data.id, {
    title: parsed.data.title,
    category: parsed.data.category,
  });

  revalidatePath("/admin/knowledge");
  redirect(`/admin/knowledge/${data.id}?created=1`);
}

export async function updateKnowledgeItem(formData: FormData) {
  const { supabase, user } = await requirePlatformAdmin();
  const itemId = formData.get("itemId");
  const parsed = knowledgeSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    category: formData.get("category"),
    source: formData.get("source") || undefined,
    status: formData.get("status"),
  });

  if (!parsed.success) {
    redirect(`/admin/knowledge/${itemId}?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const idResult = z.string().uuid().safeParse(itemId);
  if (!idResult.success) {
    redirect("/admin/knowledge?error=Identificador%20inv%C3%A1lido.");
  }

  const { data: existing, error: existingError } = await supabase
    .from("esg_knowledge_items")
    .select("version")
    .eq("id", idResult.data)
    .maybeSingle();

  if (existingError || !existing) {
    redirect("/admin/knowledge?error=Registro%20n%C3%A3o%20encontrado.");
  }

  const nextVersion = existing.version + 1;
  const { error } = await supabase
    .from("esg_knowledge_items")
    .update({
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      source: parsed.data.source || null,
      status: parsed.data.status,
      version: nextVersion,
      updated_by: user.id,
    })
    .eq("id", idResult.data);

  if (error) {
    redirect(`/admin/knowledge/${idResult.data}?error=${encodeURIComponent("Não foi possível salvar as alterações.")}`);
  }

  await logAudit(supabase, user.id, "esg_knowledge_item_updated", "esg_knowledge_item", idResult.data, {
    version: nextVersion,
  });

  revalidatePath("/admin/knowledge");
  revalidatePath(`/admin/knowledge/${idResult.data}`);
  redirect(`/admin/knowledge/${idResult.data}?updated=1`);
}
