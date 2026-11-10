import { z } from "zod";

/**
 * Perfil da empresa, preenchido no cadastro. Ajuda a coleta das ideias (áreas e
 * unidades viram opções nas perguntas) e o cálculo de retorno (tarifas e dias de
 * funcionamento reais no lugar das premissas hipotéticas). Fica em
 * `organizations.profile` (jsonb); todos os campos são opcionais.
 */

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

export const ESG_PRIORITIES = [
  "Energia",
  "Água",
  "Resíduos",
  "Emissões",
  "Saúde e segurança",
  "Capacitação",
  "Diversidade e inclusão",
  "Comunidade",
  "Governança e compliance",
] as const;

const MAX_LIST_ITEMS = 30;

export const companyProfileSchema = z.object({
  employees: z.number().nullable().default(null),
  state: z.string().nullable().default(null),
  city: z.string().nullable().default(null),
  units: z.array(z.string()).default([]),
  areas: z.array(z.string()).default([]),
  operatingDays: z.number().nullable().default(null),
  energyBill: z.number().nullable().default(null),
  energyTariff: z.number().nullable().default(null),
  waterBill: z.number().nullable().default(null),
  waterTariff: z.number().nullable().default(null),
  priorities: z.array(z.string()).default([]),
  goals: z.string().nullable().default(null),
});

export type CompanyProfile = z.infer<typeof companyProfileSchema>;

export const EMPTY_PROFILE: CompanyProfile = companyProfileSchema.parse({});

export function parseCompanyProfile(value: unknown): CompanyProfile {
  const parsed = companyProfileSchema.safeParse(value ?? {});
  return parsed.success ? parsed.data : EMPTY_PROFILE;
}

/** Número em formato brasileiro ("1.234,56") ou internacional; `null` se vazio ou inválido. */
function readNumber(raw: FormDataEntryValue | null, min: number, max: number): number | null {
  const text = String(raw ?? "").trim().replace(/^r\$\s*/i, "").replace(/\s/g, "");
  if (!text) return null;
  const normalized = /^\d{1,3}(\.\d{3})+$/.test(text)
    ? text.replace(/\./g, "")
    : text.includes(",")
      ? text.replace(/\./g, "").replace(",", ".")
      : text;
  const value = Number(normalized);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/** Uma entrada por linha (ou separadas por ponto e vírgula), sem repetições. */
export function readList(raw: FormDataEntryValue | null): string[] {
  const items = String(raw ?? "")
    .split(/\n|;/)
    .map((item) => item.trim().replace(/\s+/g, " ").slice(0, 80))
    .filter(Boolean);
  return [...new Set(items)].slice(0, MAX_LIST_ITEMS);
}

/** Lê os campos `profile-*` do formulário de cadastro da empresa. */
export function readProfileForm(formData: FormData): CompanyProfile {
  const state = String(formData.get("profile-state") ?? "").toUpperCase();
  return {
    employees: readNumber(formData.get("profile-employees"), 1, 1_000_000),
    state: (BR_STATES as readonly string[]).includes(state) ? state : null,
    city: String(formData.get("profile-city") ?? "").trim().slice(0, 100) || null,
    units: readList(formData.get("profile-units")),
    areas: readList(formData.get("profile-areas")),
    operatingDays: readNumber(formData.get("profile-operatingDays"), 1, 366),
    energyBill: readNumber(formData.get("profile-energyBill"), 0, 100_000_000),
    energyTariff: readNumber(formData.get("profile-energyTariff"), 0.01, 10),
    waterBill: readNumber(formData.get("profile-waterBill"), 0, 100_000_000),
    waterTariff: readNumber(formData.get("profile-waterTariff"), 0.01, 200),
    priorities: formData.getAll("profile-priorities").map(String).filter((item) => (ESG_PRIORITIES as readonly string[]).includes(item)),
    goals: String(formData.get("profile-goals") ?? "").trim().slice(0, 1000) || null,
  };
}

/** Quantos campos do perfil estão preenchidos (para indicar se vale completar). */
export function profileCompleteness(profile: CompanyProfile) {
  const filled = [
    profile.employees,
    profile.state,
    profile.units.length || null,
    profile.areas.length || null,
    profile.operatingDays,
    profile.energyTariff ?? profile.energyBill,
    profile.waterTariff ?? profile.waterBill,
    profile.priorities.length || null,
  ].filter((value) => value !== null && value !== undefined).length;
  return { filled, total: 8 };
}

/** Parte do perfil guardada no planejamento de cada ideia (para montar as perguntas). */
export type PlanCompanyContext = { areas: string[]; units: string[]; state: string | null };

export function planCompanyContext(profile: CompanyProfile | null): PlanCompanyContext | undefined {
  if (!profile || (!profile.areas.length && !profile.units.length && !profile.state)) return undefined;
  return { areas: profile.areas, units: profile.units, state: profile.state };
}

type ProfileClient = {
  from: (table: "organizations") => {
    select: (columns: "profile") => {
      eq: (column: "id", value: string) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
    };
  };
};

/**
 * Carrega o perfil sem quebrar a página se a coluna ainda não existir no banco
 * (migração 20261105 não aplicada): nesse caso, devolve `null`.
 */
export async function loadCompanyProfile(supabase: unknown, organizationId: string): Promise<CompanyProfile | null> {
  try {
    const { data, error } = await (supabase as ProfileClient).from("organizations").select("profile").eq("id", organizationId).maybeSingle();
    if (error || !data) return null;
    return parseCompanyProfile((data as { profile?: unknown }).profile);
  } catch {
    return null;
  }
}
