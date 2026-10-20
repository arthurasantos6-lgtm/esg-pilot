"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireCompanyContext } from "@/lib/auth";
import { analyzeIdeaWithCriteria, DEFAULT_CRITERIA, parseEsgCriteria } from "@/lib/esg-analysis";
import { createClient } from "@/lib/supabase/server";

const loginSchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
  password: z.string().min(1, "Informe sua senha."),
});

const recoverySchema = z.object({
  email: z.string().email("Informe um e-mail válido."),
});

const newPasswordSchema = z
  .object({
    password: z.string().min(12, "A senha deve ter pelo menos 12 caracteres."),
    confirmPassword: z.string(),
  })
  .refine((value) => value.password === value.confirmPassword, {
    message: "As senhas não são iguais.",
    path: ["confirmPassword"],
  });

const ideaSchema = z.object({
  title: z.string().trim().min(3, "O título deve ter pelo menos 3 caracteres.").max(120),
  problem: z.string().trim().min(10, "Descreva o problema ou oportunidade (mínimo 10 caracteres).").max(4000),
  solution: z.string().trim().min(10, "Descreva a proposta de solução (mínimo 10 caracteres).").max(4000),
  area: z.string().trim().max(100).optional(),
});

const statusSchema = z.enum([
  "submitted",
  "in_review",
  "awaiting_info",
  "technical_review",
  "approved",
  "in_progress",
  "implemented",
  "rejected",
  "archived",
]);

const projectStatusSchema = z.enum([
  "planned",
  "in_progress",
  "completed",
  "paused",
  "cancelled",
]);

const projectSchema = z
  .object({
    title: z.string().trim().min(3, "O título deve ter pelo menos 3 caracteres.").max(160),
    objective: z.string().trim().min(10, "Descreva o objetivo do projeto.").max(4000),
    ideaId: z.string().uuid().optional(),
    startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .refine(
    (value) =>
      !value.startsOn || !value.targetDate || value.targetDate >= value.startsOn,
    { message: "A data prevista deve ser igual ou posterior à data de início.", path: ["targetDate"] },
  );

const indicatorSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(2).max(160),
  dimension: z.enum(["E", "S", "G"]),
  unit: z.string().trim().min(1).max(40),
  baseline: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().optional()),
  target: z.preprocess((value) => value === "" ? undefined : value, z.coerce.number().optional()),
});

export async function signIn(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect(`/login?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect(`/login?error=${encodeURIComponent("E-mail ou senha inválidos.")}`);
  }

  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    throw new Error(`Não foi possível encerrar a sessão: ${error.message}`);
  }

  redirect("/login");
}

export async function requestPasswordReset(formData: FormData) {
  const parsed = recoverySchema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    redirect(`/forgot-password?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!siteUrl) {
    redirect("/forgot-password?error=Configure%20NEXT_PUBLIC_SITE_URL%20para%20habilitar%20a%20recupera%C3%A7%C3%A3o.");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: new URL("/auth/callback?next=/reset-password", siteUrl).toString(),
  });

  if (error) {
    redirect("/forgot-password?error=Não%20foi%20possível%20enviar%20o%20e-mail.%20Tente%20novamente%20mais%20tarde.");
  }

  redirect("/forgot-password?sent=1");
}

export async function updatePassword(formData: FormData) {
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
  });

  if (!parsed.success) {
    redirect(`/reset-password?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) {
    redirect("/forgot-password?error=O%20link%20expirou.%20Solicite%20uma%20nova%20recupera%C3%A7%C3%A3o.");
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    redirect(`/reset-password?error=${encodeURIComponent("Não foi possível atualizar a senha. Solicite um novo link.")}`);
  }

  redirect("/login?passwordUpdated=1");
}

export async function createIdea(formData: FormData) {
  const parsed = ideaSchema.safeParse({
    title: formData.get("title"),
    problem: formData.get("problem"),
    solution: formData.get("solution"),
    area: formData.get("area") || undefined,
  });

  if (!parsed.success) {
    redirect(`/ideas/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { supabase, user, membership } = await requireCompanyContext();
  const { data: activeCriteria } = await supabase
    .from("esg_criteria_versions")
    .select("id, label, dimensions, potential_thresholds")
    .eq("status", "active")
    .maybeSingle();

  const criteria = activeCriteria
    ? parseEsgCriteria(activeCriteria.dimensions, activeCriteria.potential_thresholds)
    : null;
  const analysis = analyzeIdeaWithCriteria(
    `${parsed.data.problem} ${parsed.data.solution}`,
    criteria ?? DEFAULT_CRITERIA,
    criteria && activeCriteria
      ? { criteriaVersionId: activeCriteria.id, criteriaVersionLabel: activeCriteria.label }
      : undefined,
  );
  const { data, error } = await supabase
    .from("ideas")
    .insert({
      organization_id: membership.organization_id,
      author_id: user.id,
      title: parsed.data.title,
      problem: parsed.data.problem,
      solution: parsed.data.solution,
      area: parsed.data.area || null,
      status: "submitted",
      analysis,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/ideas/new?error=${encodeURIComponent("Não foi possível salvar a ideia. Tente novamente.")}`);
  }

  revalidatePath("/dashboard");
  revalidatePath("/ideas");
  redirect(`/ideas/${data.id}`);
}

export async function updateIdeaStatus(formData: FormData) {
  const ideaId = z.string().uuid().safeParse(formData.get("ideaId"));
  const status = statusSchema.safeParse(formData.get("status"));

  if (!ideaId.success || !status.success) {
    redirect("/ideas?error=Não foi possível atualizar a situação.");
  }

  const { supabase, membership } = await requireCompanyContext();

  if (membership.role !== "company_admin") {
    redirect("/ideas?error=Apenas administradores da empresa podem alterar a situação.");
  }

  const { error } = await supabase
    .from("ideas")
    .update({ status: status.data })
    .eq("id", ideaId.data)
    .eq("organization_id", membership.organization_id);

  if (error) {
    redirect("/ideas?error=Não foi possível atualizar a situação.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/ideas");
  revalidatePath(`/ideas/${ideaId.data}`);
  redirect(`/ideas/${ideaId.data}`);
}

export async function createProject(formData: FormData) {
  const parsed = projectSchema.safeParse({
    title: formData.get("title"),
    objective: formData.get("objective"),
    ideaId: formData.get("ideaId") || undefined,
    startsOn: formData.get("startsOn") || undefined,
    targetDate: formData.get("targetDate") || undefined,
  });

  if (!parsed.success) {
    redirect(`/projects/new?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const { supabase, membership } = await requireCompanyContext();
  if (membership.role !== "company_admin") {
    redirect("/projects?error=Apenas administradores da empresa podem criar projetos.");
  }

  if (parsed.data.ideaId) {
    const { data: approvedIdea, error: ideaError } = await supabase
      .from("ideas")
      .select("id")
      .eq("id", parsed.data.ideaId)
      .eq("organization_id", membership.organization_id)
      .eq("status", "approved")
      .maybeSingle();

    if (ideaError) {
      redirect("/projects/new?error=Não%20foi%20possível%20validar%20a%20ideia%20selecionada.");
    }
    if (!approvedIdea) {
      redirect("/projects/new?error=Vincule%20apenas%20uma%20ideia%20aprovada%20da%20sua%20organização.");
    }
  }

  const { data: project, error } = await supabase
    .from("esg_projects")
    .insert({
      organization_id: membership.organization_id,
      title: parsed.data.title,
      objective: parsed.data.objective,
      idea_id: parsed.data.ideaId ?? null,
      starts_on: parsed.data.startsOn ?? null,
      target_date: parsed.data.targetDate ?? null,
    })
    .select("id")
    .single();

  if (error) {
    redirect("/projects/new?error=Não%20foi%20possível%20salvar%20o%20projeto.");
  }

  revalidatePath("/dashboard");
  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

export async function updateProjectStatus(formData: FormData) {
  const projectId = z.string().uuid().safeParse(formData.get("projectId"));
  const status = projectStatusSchema.safeParse(formData.get("status"));
  if (!projectId.success || !status.success) {
    redirect("/projects?error=Não%20foi%20possível%20atualizar%20a%20situação.");
  }

  const { supabase, membership } = await requireCompanyContext();
  if (membership.role !== "company_admin") {
    redirect("/projects?error=Apenas%20administradores%20da%20empresa%20podem%20alterar%20projetos.");
  }

  const { error } = await supabase
    .from("esg_projects")
    .update({ status: status.data })
    .eq("id", projectId.data)
    .eq("organization_id", membership.organization_id);

  if (error) redirect("/projects?error=Não%20foi%20possível%20atualizar%20a%20situação.");
  revalidatePath("/dashboard");
  revalidatePath("/projects");
  revalidatePath(`/projects/${projectId.data}`);
  redirect(`/projects/${projectId.data}`);
}

export async function createIndicator(formData: FormData) {
  const parsed = indicatorSchema.safeParse({
    projectId: formData.get("projectId"),
    name: formData.get("name"),
    dimension: formData.get("dimension"),
    unit: formData.get("unit"),
    baseline: formData.get("baseline"),
    target: formData.get("target"),
  });

  const projectId = z.string().uuid().safeParse(formData.get("projectId"));
  if (!parsed.success || !projectId.success) {
    redirect(`/projects/${encodeURIComponent(String(formData.get("projectId") ?? ""))}?error=Confira%20os%20dados%20do%20indicador.`);
  }

  const { supabase, membership } = await requireCompanyContext();
  if (membership.role !== "company_admin") {
    redirect("/projects?error=Apenas%20administradores%20da%20empresa%20podem%20gerenciar%20indicadores.");
  }

  const { error } = await supabase.from("esg_indicators").insert({
    organization_id: membership.organization_id,
    project_id: parsed.data.projectId,
    name: parsed.data.name,
    dimension: parsed.data.dimension,
    unit: parsed.data.unit,
    baseline: parsed.data.baseline ?? null,
    target: parsed.data.target ?? null,
  });

  if (error) {
    redirect(`/projects/${parsed.data.projectId}?error=Não%20foi%20possível%20salvar%20o%20indicador.`);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(`/projects/${parsed.data.projectId}`);
}

export async function recordIndicatorMeasurement(formData: FormData) {
  const parsed = z.object({
    indicatorId: z.string().uuid(),
    projectId: z.string().uuid(),
      measured: z.preprocess(
        (value) => value === "" ? Number.NaN : value,
        z.coerce.number().finite(),
      ),
    measuredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    evidenceNote: z.string().trim().max(800).optional(),
  }).safeParse({
    indicatorId: formData.get("indicatorId"),
    projectId: formData.get("projectId"),
    measured: formData.get("measured"),
    measuredAt: formData.get("measuredAt"),
    evidenceNote: formData.get("evidenceNote") || undefined,
  });

  if (!parsed.success) {
    redirect("/projects?error=Confira%20a%20medição%20informada.");
  }

  const { supabase, membership } = await requireCompanyContext();
  if (membership.role !== "company_admin") {
    redirect("/projects?error=Apenas%20administradores%20da%20empresa%20podem%20registrar%20medições.");
  }

  const { error } = await supabase
    .from("esg_indicators")
    .update({
      measured: parsed.data.measured,
      measured_at: parsed.data.measuredAt,
      evidence_note: parsed.data.evidenceNote ?? null,
    })
    .eq("id", parsed.data.indicatorId)
    .eq("project_id", parsed.data.projectId)
    .eq("organization_id", membership.organization_id);

  if (error) {
    redirect(`/projects/${parsed.data.projectId}?error=Não%20foi%20possível%20salvar%20a%20medição.`);
  }

  revalidatePath("/dashboard");
  revalidatePath(`/projects/${parsed.data.projectId}`);
  redirect(`/projects/${parsed.data.projectId}`);
}
