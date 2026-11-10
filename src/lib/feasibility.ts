import { estimateSavings, formatBRL, formatNumber, SCENARIOS, type SavingsEstimate, type ScenarioKey } from "./idea-finance.ts";
import { numberAnswer, type IdeaPlan, type InitiativeType, type PlanReference, type ReferenceCategory } from "./idea-planning.ts";

/**
 * Viabilidade automática a partir da pesquisa. Cada valor em reais encontrado
 * nas fontes vira um item marcável; o sistema pré-seleciona os plausíveis e
 * calcula investimento, custo anual, economia, payback e ROI. Os cenários vêm
 * da faixa de preços encontrada (conservador = mais caro), não de percentuais
 * inventados. A gestão confere e desmarca o que não servir.
 */

export const COST_GROUPS = {
  equipamento: { label: "Equipamentos", role: "investment", perUnit: true },
  material: { label: "Materiais", role: "investment", perUnit: false },
  instalacao: { label: "Instalação", role: "investment", perUnit: true },
  servico: { label: "Serviços contratados", role: "investment", perUnit: false },
  mao_de_obra: { label: "Mão de obra", role: "investment", perUnit: false },
  manutencao: { label: "Manutenção (por ano)", role: "recurring", perUnit: false },
  tarifa: { label: "Tarifa", role: "tariff", perUnit: false },
} as const;
export type CostGroup = keyof typeof COST_GROUPS;

const GROUP_BY_CATEGORY: Partial<Record<ReferenceCategory, CostGroup>> = {
  preco_equipamento: "equipamento",
  fornecedor: "equipamento",
  preco_material: "material",
  instalacao: "instalacao",
  servico: "servico",
  mao_de_obra: "mao_de_obra",
  manutencao: "manutencao",
};

/** Tarifa de quê, por tipo de iniciativa. */
export const TARIFF_UNIT: Partial<Record<InitiativeType, { unit: "kWh" | "m³"; max: number; question: string }>> = {
  iluminacao: { unit: "kWh", max: 5, question: "il-tarifa" },
  energia: { unit: "kWh", max: 5, question: "en-tarifa" },
  solar: { unit: "kWh", max: 5, question: "en-tarifa" },
  agua_reuso: { unit: "m³", max: 80, question: "ar-tarifa" },
  agua_consumo: { unit: "m³", max: 80, question: "ac-tarifa" },
};

export type PriceCandidate = {
  id: string;
  referenceId: string;
  group: CostGroup;
  amount: number;
  text: string;
  context: string;
  installment: boolean;
  sourceTitle: string;
  url: string;
};

const BRL = /R\$\s?(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?(\s?(?:milhões|milhão|mil))?/gi;

/** "R$ 1.299,00" → 1299; "R$ 12 mil" → 12000; "R$ 1,2 milhão" → 1200000. */
export function parseBrlAmount(text: string): number | null {
  BRL.lastIndex = 0;
  const match = BRL.exec(text);
  if (!match) return null;
  const integer = Number(match[1].replace(/[.\s]/g, ""));
  const cents = match[2] ? Number(`0.${match[2]}`) : 0;
  const scale = /milh/i.test(match[3] ?? "") ? 1_000_000 : /mil/i.test(match[3] ?? "") ? 1_000 : 1;
  const value = (integer + cents) * scale;
  return Number.isFinite(value) ? value : null;
}

/** Extrai os valores em reais de cada fonte, com o trecho em volta para conferência. */
export function priceCandidates(references: PlanReference[], type: InitiativeType): PriceCandidate[] {
  const tariff = TARIFF_UNIT[type];
  const candidates: PriceCandidate[] = [];
  for (const reference of references) {
    const text = [reference.summary, reference.origin === "management" ? reference.value : null].filter(Boolean).join(" ");
    const seen = new Set<number>();
    let index = 0;
    for (const match of text.matchAll(BRL)) {
      const amount = parseBrlAmount(match[0]);
      if (amount === null || amount <= 0 || seen.has(amount)) continue;
      seen.add(amount);
      const start = match.index ?? 0;
      const before = text.slice(Math.max(0, start - 60), start);
      const after = text.slice(start + match[0].length, start + match[0].length + 60);
      const unitNear = after.slice(0, 20).toLowerCase();
      const isTariff =
        tariff !== undefined &&
        amount <= tariff.max &&
        (tariff.unit === "kWh" ? /kwh/.test(unitNear) : /m³|m3|metro c/.test(unitNear));
      const group: CostGroup | undefined = isTariff ? "tarifa" : GROUP_BY_CATEGORY[reference.category];
      if (!group) continue;
      candidates.push({
        id: `${reference.id}:${index++}`,
        referenceId: reference.id,
        group,
        amount,
        text: match[0].replace(/\s+/g, " ").trim(),
        context: `${start > 60 ? "…" : ""}${before}${match[0]}${after}${start + match[0].length + 60 < text.length ? "…" : ""}`.replace(/\s+/g, " ").trim(),
        // "12x de R$ 9,90" é parcela, não preço total.
        installment: /\d+\s?x\s?(de)?\s*$/i.test(before) || /^\s?(\/\s?m[eê]s|por m[eê]s|mensais)/i.test(after),
        sourceTitle: reference.title,
        url: reference.url,
      });
    }
  }
  return candidates;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/**
 * Pré-seleção: descarta parcelas e valores muito distantes da mediana do grupo
 * (menos de 1/4 ou mais de 4 vezes), que costumam ser outro produto ou um kit.
 */
export function defaultSelection(candidates: PriceCandidate[]): string[] {
  const selected: string[] = [];
  for (const group of Object.keys(COST_GROUPS) as CostGroup[]) {
    const items = candidates.filter((candidate) => candidate.group === group && !candidate.installment);
    if (!items.length) continue;
    const middle = median(items.map((item) => item.amount));
    for (const item of items) if (item.amount >= middle / 4 && item.amount <= middle * 4) selected.push(item.id);
  }
  return selected;
}

/** Quantidade de cada grupo a partir das respostas (ex.: número de sensores). */
const QUANTITY_SOURCES: Partial<Record<InitiativeType, { question: string; label: string }>> = {
  iluminacao: { question: "il-pontos", label: "sensores" },
  energia: { question: "en-quantidade", label: "equipamentos" },
  agua_consumo: { question: "ac-pontos", label: "pontos de uso" },
  residuos: { question: "re-coletores-qtd", label: "coletores" },
  seguranca: { question: "se-expostos", label: "pessoas" },
  capacitacao: { question: "ca-participantes", label: "participantes" },
};

export function defaultQuantity(plan: IdeaPlan): { value: number; source: string } {
  const source = QUANTITY_SOURCES[plan.initiativeType];
  const value = source ? numberAnswer(plan, source.question) : null;
  return value && value > 0
    ? { value, source: `${formatNumber(value)} ${source?.label} (resposta do colaborador)` }
    : { value: 1, source: "1 unidade (quantidade não informada: confira)" };
}

export type Selection = {
  /** Ids escolhidos pela gestão; `null` = pré-seleção automática. */
  selected: string[] | null;
  /** Quantidade aplicada aos itens cobrados por unidade (equipamento e instalação). */
  quantity: number | null;
  periodYears: number;
  /** Economia anual informada pela gestão, quando não há como estimar pelas respostas. */
  benefitOverride: number | null;
};

export const DEFAULT_PERIOD_YEARS = 5;

type Range = { min: number; median: number; max: number };
const rangeOf = (values: number[]): Range | null =>
  values.length ? { min: Math.min(...values), median: median(values), max: Math.max(...values) } : null;
const pick = (range: Range, scenario: ScenarioKey, highIsBad = true) =>
  scenario === "likely" ? range.median : (scenario === "conservative") === highIsBad ? range.max : range.min;

export type GroupSummary = {
  group: CostGroup;
  label: string;
  role: "investment" | "recurring" | "tariff";
  unitPrice: Range;
  quantity: number;
  total: Range;
  count: number;
};

export type FeasibilityScenario = {
  key: ScenarioKey;
  label: string;
  investment: number | null;
  recurring: number;
  annualBenefit: number | null;
  netAnnual: number | null;
  paybackYears: number | null;
  roiPercent: number | null;
  notes: string[];
};

export type Feasibility = {
  candidates: PriceCandidate[];
  selectedIds: string[];
  quantity: { value: number; source: string };
  groups: GroupSummary[];
  informedInvestment: number | null;
  informedRecurring: number | null;
  tariff: { range: Range; source: "colaborador" | "pesquisa" } | null;
  savings: SavingsEstimate | null;
  benefitSource: "estimativa" | "gestao" | null;
  periodYears: number;
  scenarios: FeasibilityScenario[];
  missing: string[];
  memory: string[];
  calculable: boolean;
};

const SAVINGS_INPUTS: Partial<Record<InitiativeType, string[]>> = {
  iluminacao: ["il-luminarias", "il-potencia", "il-horas-ociosas"],
  energia: ["en-quantidade", "en-potencia", "en-ocioso"],
  agua_reuso: ["ar-reducao"],
  agua_consumo: ["ac-reducao"],
};

export function computeFeasibility(plan: IdeaPlan, references: PlanReference[], selection: Partial<Selection> = {}): Feasibility {
  const candidates = priceCandidates(references, plan.initiativeType);
  const selectedIds = selection.selected ?? defaultSelection(candidates);
  const chosen = candidates.filter((candidate) => selectedIds.includes(candidate.id));
  const autoQuantity = defaultQuantity(plan);
  const quantity = selection.quantity && selection.quantity > 0
    ? { value: selection.quantity, source: `${formatNumber(selection.quantity)} (definido pela gestão)` }
    : autoQuantity;
  const periodYears = selection.periodYears && selection.periodYears > 0 ? selection.periodYears : DEFAULT_PERIOD_YEARS;
  const memory: string[] = [];
  const missing: string[] = [];

  const groups: GroupSummary[] = (Object.keys(COST_GROUPS) as CostGroup[]).flatMap((group) => {
    const unit = rangeOf(chosen.filter((item) => item.group === group).map((item) => item.amount));
    if (!unit) return [];
    const info = COST_GROUPS[group];
    const factor = info.perUnit ? quantity.value : 1;
    const total = { min: unit.min * factor, median: unit.median * factor, max: unit.max * factor };
    return [{ group, label: info.label, role: info.role, unitPrice: unit, quantity: factor, total, count: chosen.filter((item) => item.group === group).length }];
  });

  const investmentGroups = groups.filter((group) => group.role === "investment");
  const recurringGroups = groups.filter((group) => group.role === "recurring");
  const informedInvestment = numberAnswer(plan, "g-custo-inicial");
  const monthly = numberAnswer(plan, "g-custo-recorrente");
  const informedRecurring = monthly !== null ? monthly * 12 : null;

  // Tarifa: a resposta do colaborador vale mais que a pesquisa.
  const tariffInfo = TARIFF_UNIT[plan.initiativeType];
  const answeredTariff = tariffInfo ? numberAnswer(plan, tariffInfo.question) : null;
  const tariffGroup = groups.find((group) => group.group === "tarifa");
  const tariff = answeredTariff
    ? { range: { min: answeredTariff, median: answeredTariff, max: answeredTariff }, source: "colaborador" as const }
    : tariffGroup
      ? { range: tariffGroup.unitPrice, source: "pesquisa" as const }
      : null;

  const savings = estimateSavings(plan, tariff?.range.median ?? null);
  const benefitOverride = selection.benefitOverride && selection.benefitOverride > 0 ? selection.benefitOverride : null;
  const benefitSource = benefitOverride ? "gestao" : savings && tariff ? "estimativa" : null;

  for (const group of investmentGroups) {
    memory.push(
      `${group.label}: ${group.count} ${group.count === 1 ? "preço" : "preços"} de ${formatBRL(group.unitPrice.min)} a ${formatBRL(group.unitPrice.max)} (mediana ${formatBRL(group.unitPrice.median)})${group.quantity > 1 ? ` × ${formatNumber(group.quantity)}` : ""}.`,
    );
  }
  for (const group of recurringGroups) memory.push(`${group.label}: ${formatBRL(group.total.min)} a ${formatBRL(group.total.max)} por ano (valor da fonte tratado como anual: confira).`);
  if (informedRecurring !== null) memory.push(`Custo mensal informado pelo colaborador: ${formatBRL(monthly ?? 0)} × 12 = ${formatBRL(informedRecurring)} por ano.`);
  if (tariff) memory.push(`Tarifa: ${tariff.source === "colaborador" ? "informada pelo colaborador" : "pesquisada"}, ${formatBRL(tariff.range.min)} a ${formatBRL(tariff.range.max)} por ${tariffInfo?.unit}.`);
  if (savings) memory.push(`Economia física estimada: ${formatNumber(savings.quantity)} ${savings.unit} (${savings.formula.replace(/ × R\$.*$/, "")}).`);
  if (benefitOverride) memory.push(`Economia anual informada pela gestão: ${formatBRL(benefitOverride)}.`);

  if (!investmentGroups.length && informedInvestment === null) missing.push("Preço dos itens: nenhum valor da pesquisa foi selecionado e o colaborador não estimou o investimento.");
  if (!benefitOverride) {
    if (!SAVINGS_INPUTS[plan.initiativeType]) missing.push("Economia anual: este tipo de iniciativa não tem cálculo automático. Informe a economia esperada, se houver.");
    else if (!savings) {
      const unanswered = (SAVINGS_INPUTS[plan.initiativeType] ?? []).filter((id) => numberAnswer(plan, id) === null);
      missing.push(`Economia anual: faltam respostas numéricas do colaborador (${unanswered.join(", ")}).`);
    } else if (!tariff) missing.push(`Economia anual: falta a tarifa por ${tariffInfo?.unit} (não informada e não encontrada na pesquisa).`);
  }

  const scenarios = SCENARIOS.map(({ key, label }): FeasibilityScenario => {
    const notes: string[] = [];
    const investment = investmentGroups.length
      ? investmentGroups.reduce((total, group) => total + pick(group.total, key), 0)
      : informedInvestment;
    if (!investmentGroups.length && informedInvestment !== null && key === "likely") notes.push("Investimento estimado pelo colaborador (sem preço da pesquisa).");
    const recurring = recurringGroups.reduce((total, group) => total + pick(group.total, key), 0) + (informedRecurring ?? 0);
    const annualBenefit = benefitOverride ?? (savings && tariff ? savings.quantity * pick(tariff.range, key, false) : null);
    const netAnnual = annualBenefit === null ? null : annualBenefit - recurring;
    let paybackYears: number | null = null;
    let roiPercent: number | null = null;
    if (investment !== null && investment > 0 && netAnnual !== null) {
      roiPercent = ((netAnnual * periodYears - investment) / investment) * 100;
      if (netAnnual > 0) paybackYears = investment / netAnnual;
      else notes.push("A economia não cobre os custos anuais: não há retorno financeiro.");
      if (paybackYears !== null && paybackYears > periodYears) notes.push(`Não se paga em ${formatNumber(periodYears)} anos.`);
      memory.push(
        `[${label}] ROI = (${formatBRL(netAnnual)} × ${formatNumber(periodYears)} − ${formatBRL(investment)}) / ${formatBRL(investment)} = ${formatNumber(roiPercent)}%${paybackYears !== null ? `; payback = ${formatBRL(investment)} / ${formatBRL(netAnnual)} = ${formatNumber(paybackYears)} anos` : ""}.`,
      );
    }
    return { key, label, investment, recurring, annualBenefit, netAnnual, paybackYears, roiPercent, notes };
  });

  return {
    candidates,
    selectedIds,
    quantity,
    groups,
    informedInvestment,
    informedRecurring,
    tariff,
    savings,
    benefitSource,
    periodYears,
    scenarios,
    missing,
    memory,
    calculable: scenarios.some((scenario) => scenario.roiPercent !== null),
  };
}
