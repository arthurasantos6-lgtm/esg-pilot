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
  investment: number;
  recurring: number;
  annualBenefit: number;
  netAnnual: number;
  paybackYears: number | null;
  roiPercent: number | null;
  notes: string[];
};

/**
 * Valores de referência para o cenário hipotético, usados só quando a pesquisa e
 * as respostas não trazem o dado. São premissas do sistema, sempre exibidas como
 * hipotéticas, para serem substituídas por cotação ou medição.
 */
type HypotheticalInvestment =
  | { unitPrice: number; unit: string; question?: string; defaultQuantity: number; toQuantity?: (value: number) => number; quantityNote?: string }
  | { total: number; label: string };

const HYPOTHETICAL_INVESTMENT: Record<InitiativeType, HypotheticalInvestment> = {
  iluminacao: { unitPrice: 150, unit: "sensor instalado", question: "il-pontos", defaultQuantity: 10 },
  solar: {
    unitPrice: 4000,
    unit: "kWp instalado",
    question: "so-consumo",
    defaultQuantity: 10,
    toQuantity: (kwhPerMonth) => Math.max(1, Math.round((kwhPerMonth / 120) * 10) / 10),
    quantityNote: "1 kWp gera cerca de 120 kWh por mês",
  },
  energia: { unitPrice: 800, unit: "equipamento (automação ou ajuste)", question: "en-quantidade", defaultQuantity: 5 },
  agua_reuso: { total: 15000, label: "sistema de captação, reservatório e bomba" },
  agua_consumo: { unitPrice: 120, unit: "ponto de uso ajustado", question: "ac-pontos", defaultQuantity: 10 },
  residuos: { unitPrice: 400, unit: "coletor ou baia", question: "re-coletores-qtd", defaultQuantity: 6 },
  emissoes: { total: 10000, label: "ajustes, filtros ou manutenção" },
  seguranca: { unitPrice: 250, unit: "pessoa exposta (proteção e orientação)", question: "se-expostos", defaultQuantity: 20 },
  capacitacao: { unitPrice: 200, unit: "participante", question: "ca-participantes", defaultQuantity: 20 },
  social: { total: 5000, label: "ação social de pequeno porte" },
  governanca: { total: 8000, label: "procedimento, controle ou ferramenta" },
  geral: { total: 10000, label: "iniciativa de pequeno porte" },
};

export const HYPOTHETICAL_TARIFF = { kWh: 0.9, "m³": 15 } as const;
const INVESTMENT_SPREAD = 0.3;
const BENEFIT_SPREAD = 0.2;
/** Meta de retorno quando não há base para estimar a economia: payback em 5, 3 e 2 anos. */
export const TARGET_PAYBACK: Record<ScenarioKey, number> = { conservative: 5, likely: 3, optimistic: 2 };

const spread = (value: number, ratio: number): Range => ({ min: value * (1 - ratio), median: value, max: value * (1 + ratio) });
const fixed = (value: number): Range => ({ min: value, median: value, max: value });

export type Feasibility = {
  candidates: PriceCandidate[];
  selectedIds: string[];
  quantity: { value: number; source: string };
  groups: GroupSummary[];
  informedInvestment: number | null;
  informedRecurring: number | null;
  tariff: { range: Range; source: "colaborador" | "pesquisa" | "hipotetico" } | null;
  savings: SavingsEstimate | null;
  investmentSource: "pesquisa" | "colaborador" | "hipotetico";
  /** meta = economia necessária para atingir o payback-alvo, não uma estimativa. */
  benefitSource: "gestao" | "estimativa" | "hipotetico" | "meta";
  /** Há pelo menos um valor hipotético no cálculo. */
  hypothetical: boolean;
  /** Premissas hipotéticas usadas, em linguagem clara. */
  hypotheses: string[];
  periodYears: number;
  scenarios: FeasibilityScenario[];
  /** Dados reais que substituiriam as hipóteses. */
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

/** Economia anual hipotética por regra do tipo, quando há algum número nas respostas. */
function hypotheticalBenefit(plan: IdeaPlan): { value: number; premise: string } | null {
  const n = (id: string) => numberAnswer(plan, id);
  switch (plan.initiativeType) {
    case "solar": {
      const bill = n("so-conta");
      if (bill) return { value: bill * 12 * 0.8, premise: `80% da conta de luz informada (${formatBRL(bill)}/mês) passaria a ser compensada pela geração.` };
      const kwh = n("so-consumo");
      if (kwh) return { value: kwh * 12 * HYPOTHETICAL_TARIFF.kWh * 0.8, premise: `80% do consumo informado (${formatNumber(kwh)} kWh/mês) compensado, a ${formatBRL(HYPOTHETICAL_TARIFF.kWh)}/kWh.` };
      return null;
    }
    case "residuos": {
      const cost = n("re-custo-atual");
      return cost ? { value: cost * 12 * 0.5, premise: `Metade do custo atual de descarte (${formatBRL(cost)}/mês) deixaria de ser pago.` } : null;
    }
    case "emissoes": {
      const liters = n("em-consumo");
      return liters ? { value: liters * 12 * 6.2 * 0.1, premise: `Redução de 10% no consumo de combustível informado (${formatNumber(liters)} L/mês), a R$ 6,20 por litro.` } : null;
    }
    case "seguranca": {
      const events = n("se-ocorrencias");
      return events
        ? { value: events * 0.5 * 4000, premise: `Metade das ${formatNumber(events)} ocorrências anuais evitadas, a um custo médio de R$ 4.000 cada (afastamento, atendimento, reposição).` }
        : null;
    }
    default:
      return null;
  }
}

const sumRange = (ranges: Range[]): Range => ({
  min: ranges.reduce((total, range) => total + range.min, 0),
  median: ranges.reduce((total, range) => total + range.median, 0),
  max: ranges.reduce((total, range) => total + range.max, 0),
});

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
  const hypotheses: string[] = [];

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

  // 1. Investimento: pesquisa > colaborador > referência hipotética do tipo.
  let investmentSource: Feasibility["investmentSource"];
  let investmentRange: Range;
  if (investmentGroups.length) {
    investmentSource = "pesquisa";
    investmentRange = sumRange(investmentGroups.map((group) => group.total));
    for (const group of investmentGroups) {
      memory.push(
        `${group.label}: ${group.count} ${group.count === 1 ? "preço" : "preços"} de ${formatBRL(group.unitPrice.min)} a ${formatBRL(group.unitPrice.max)} (mediana ${formatBRL(group.unitPrice.median)})${group.quantity > 1 ? ` × ${formatNumber(group.quantity)}` : ""}.`,
      );
    }
  } else if (informedInvestment !== null && informedInvestment > 0) {
    investmentSource = "colaborador";
    investmentRange = fixed(informedInvestment);
    memory.push(`Investimento estimado pelo colaborador: ${formatBRL(informedInvestment)}.`);
    missing.push("Preço dos itens na pesquisa ou em cotação, para confirmar a estimativa do colaborador.");
  } else {
    investmentSource = "hipotetico";
    const reference = HYPOTHETICAL_INVESTMENT[plan.initiativeType];
    let base: number;
    if ("total" in reference) {
      base = reference.total;
      hypotheses.push(`Investimento de referência de ${formatBRL(base)} para ${reference.label}, com variação de ±30% entre os cenários.`);
    } else {
      const answered = reference.question ? numberAnswer(plan, reference.question) : null;
      const units = answered && answered > 0 ? (reference.toQuantity ? reference.toQuantity(answered) : answered) : reference.defaultQuantity;
      base = reference.unitPrice * units;
      const origin = answered ? `quantidade pelas respostas${reference.quantityNote ? `; ${reference.quantityNote}` : ""}` : "quantidade suposta";
      hypotheses.push(`Investimento de referência de ${formatBRL(reference.unitPrice)} por ${reference.unit} × ${formatNumber(units)} (${origin}) = ${formatBRL(base)}, com variação de ±30%.`);
    }
    investmentRange = spread(base, INVESTMENT_SPREAD);
    missing.push("Preços reais (cotação ou pesquisa) para substituir o investimento hipotético.");
  }

  // 2. Custos anuais: pesquisa + colaborador (sem hipótese: zero se ninguém informou).
  const informedRecurringRange = informedRecurring !== null ? [fixed(informedRecurring)] : [];
  const recurringRange = sumRange([...recurringGroups.map((group) => group.total), ...informedRecurringRange]);
  for (const group of recurringGroups) memory.push(`${group.label}: ${formatBRL(group.total.min)} a ${formatBRL(group.total.max)} por ano (valor da fonte tratado como anual: confira).`);
  if (informedRecurring !== null) memory.push(`Custo mensal informado pelo colaborador: ${formatBRL(monthly ?? 0)} × 12 = ${formatBRL(informedRecurring)} por ano.`);
  if (!recurringGroups.length && informedRecurring === null) memory.push("Custos anuais: nenhum encontrado ou informado (considerado zero).");

  // 3. Tarifa: colaborador > pesquisa > referência hipotética.
  const tariffInfo = TARIFF_UNIT[plan.initiativeType];
  const answeredTariff = tariffInfo ? numberAnswer(plan, tariffInfo.question) : null;
  const tariffGroup = groups.find((group) => group.group === "tarifa");
  const physical = estimateSavings(plan, 1);
  let tariff: Feasibility["tariff"] = answeredTariff
    ? { range: fixed(answeredTariff), source: "colaborador" }
    : tariffGroup
      ? { range: tariffGroup.unitPrice, source: "pesquisa" }
      : null;
  if (!tariff && tariffInfo && physical) {
    const value = HYPOTHETICAL_TARIFF[tariffInfo.unit];
    tariff = { range: spread(value, BENEFIT_SPREAD), source: "hipotetico" };
    hypotheses.push(`Tarifa de referência de ${formatBRL(value)} por ${tariffInfo.unit} (±20%), por não ter sido informada nem encontrada na pesquisa.`);
  }
  const savings = estimateSavings(plan, tariff?.range.median ?? null);
  if (tariff && tariff.source !== "hipotetico") {
    memory.push(`Tarifa ${tariff.source === "colaborador" ? "informada pelo colaborador" : "pesquisada"}: ${formatBRL(tariff.range.min)} a ${formatBRL(tariff.range.max)} por ${tariffInfo?.unit}.`);
  }
  if (savings) memory.push(`Economia física estimada pelas respostas: ${formatNumber(savings.quantity)} ${savings.unit} (${savings.formula.replace(/ × R\$.*$/, "")}).`);

  // 4. Economia anual: gestão > estimativa pelas respostas > regra hipotética > meta de payback.
  const benefitOverride = selection.benefitOverride && selection.benefitOverride > 0 ? selection.benefitOverride : null;
  const ruleBenefit = hypotheticalBenefit(plan);
  let benefitSource: Feasibility["benefitSource"];
  let benefitRange: Range | null = null;
  if (benefitOverride) {
    benefitSource = "gestao";
    benefitRange = fixed(benefitOverride);
    memory.push(`Economia anual informada pela gestão: ${formatBRL(benefitOverride)}.`);
  } else if (savings && tariff) {
    benefitSource = tariff.source === "hipotetico" ? "hipotetico" : "estimativa";
    benefitRange = { min: savings.quantity * tariff.range.min, median: savings.quantity * tariff.range.median, max: savings.quantity * tariff.range.max };
    if (tariff.source === "hipotetico") missing.push(`Tarifa real por ${tariffInfo?.unit} (aparece na conta de ${tariffInfo?.unit === "kWh" ? "energia" : "água"}).`);
  } else if (ruleBenefit) {
    benefitSource = "hipotetico";
    benefitRange = spread(ruleBenefit.value, BENEFIT_SPREAD);
    hypotheses.push(`Economia anual hipotética de ${formatBRL(ruleBenefit.value)} (±20%): ${ruleBenefit.premise}`);
    missing.push("Medição real da economia, para substituir a hipótese.");
  } else {
    benefitSource = "meta";
    hypotheses.push(
      `Sem base para estimar a economia, o cálculo mostra uma meta: quanto a iniciativa precisaria gerar por ano para se pagar em ${TARGET_PAYBACK.conservative} anos (conservador), ${TARGET_PAYBACK.likely} anos (provável) ou ${TARGET_PAYBACK.optimistic} anos (otimista).`,
    );
    const inputs = SAVINGS_INPUTS[plan.initiativeType];
    missing.push(
      inputs
        ? `Respostas numéricas para estimar a economia (${inputs.filter((id) => numberAnswer(plan, id) === null).join(", ")}).`
        : "Economia ou receita anual esperada (pode ser informada pela gestão no cálculo).",
    );
  }

  const scenarios = SCENARIOS.map(({ key, label }): FeasibilityScenario => {
    const notes: string[] = [];
    const investment = pick(investmentRange, key);
    const recurring = pick(recurringRange, key);
    const annualBenefit = benefitRange ? pick(benefitRange, key, false) : investment / TARGET_PAYBACK[key] + recurring;
    const netAnnual = annualBenefit - recurring;
    let paybackYears: number | null = null;
    let roiPercent: number | null = null;
    if (investment > 0) {
      roiPercent = ((netAnnual * periodYears - investment) / investment) * 100;
      if (netAnnual > 0) paybackYears = investment / netAnnual;
      else notes.push("A economia não cobre os custos anuais: não há retorno financeiro.");
      if (paybackYears !== null && paybackYears > periodYears) notes.push(`Não se paga em ${formatNumber(periodYears)} anos.`);
      memory.push(
        `[${label}] ROI = (${formatBRL(netAnnual)} × ${formatNumber(periodYears)} − ${formatBRL(investment)}) / ${formatBRL(investment)} = ${formatNumber(roiPercent)}%${paybackYears !== null ? `; payback = ${formatBRL(investment)} / ${formatBRL(netAnnual)} = ${formatNumber(paybackYears)} anos` : ""}.`,
      );
    } else {
      notes.push("Sem investimento inicial: o ROI não se aplica.");
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
    investmentSource,
    benefitSource,
    hypothetical: hypotheses.length > 0,
    hypotheses,
    periodYears,
    scenarios,
    missing,
    memory,
    calculable: scenarios.some((scenario) => scenario.roiPercent !== null),
  };
}
