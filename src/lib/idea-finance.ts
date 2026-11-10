import { numberAnswer, type BenefitLine, type FinanceInput, type IdeaPlan, type MoneyLine } from "./idea-planning.ts";

/**
 * Análise financeira da iniciativa: investimento, custos recorrentes, benefício
 * anual, payback e ROI por cenário. Funções puras, sem valores inventados: sem
 * dados suficientes, a análise devolve o que falta em vez de um número.
 *
 * ROI (%) = [(benefícios financeiros líquidos no período − investimento) / investimento] × 100
 * Payback (anos) = investimento / benefício líquido anual, quando ele é positivo.
 */

export const SCENARIOS = [
  { key: "conservative", label: "Conservador" },
  { key: "likely", label: "Provável" },
  { key: "optimistic", label: "Otimista" },
] as const;
export type ScenarioKey = (typeof SCENARIOS)[number]["key"];

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const decimal = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 1 });
export const formatBRL = (value: number) => brl.format(value);
export const formatNumber = (value: number) => decimal.format(value);

export type ScenarioResult = {
  key: ScenarioKey;
  label: string;
  calculable: boolean;
  annualBenefit: number | null;
  netAnnual: number | null;
  netOverPeriod: number | null;
  roiPercent: number | null;
  paybackYears: number | null;
  notes: string[];
};

export type FinanceAnalysis = {
  periodYears: number | null;
  investmentTotal: number | null;
  recurringAnnual: number;
  pending: string[];
  missing: string[];
  scenarios: ScenarioResult[];
  /** Memória de cálculo, linha a linha. */
  memory: string[];
  /** Pelo menos um cenário teve ROI calculado. */
  calculable: boolean;
};

const sumAmounts = (lines: MoneyLine[]) => lines.reduce((total, line) => total + (line.amount ?? 0), 0);
const pendingOf = (lines: MoneyLine[], kind: string) =>
  lines.filter((line) => line.amount === null && line.origin === "cotacao").map((line) => `${kind}: ${line.label} (precisa de cotação)`);

export function analyzeFinance(input: FinanceInput | null): FinanceAnalysis {
  const empty: FinanceAnalysis = {
    periodYears: null,
    investmentTotal: null,
    recurringAnnual: 0,
    pending: [],
    missing: ["Investimento inicial", "Benefício financeiro anual (economia ou receita)", "Período de análise"],
    scenarios: [],
    memory: [],
    calculable: false,
  };
  if (!input) return empty;

  const investmentLines = input.investment.filter((line) => line.amount !== null);
  const investmentTotal = investmentLines.length ? sumAmounts(investmentLines) : null;
  const recurringAnnual = sumAmounts(input.recurring);
  const pending = [...pendingOf(input.investment, "Investimento"), ...pendingOf(input.recurring, "Custo recorrente")];
  const period = input.periodYears && input.periodYears > 0 ? input.periodYears : null;
  const benefits = input.benefits.filter((line) => line.conservative !== null || line.likely !== null || line.optimistic !== null);

  const missing: string[] = [];
  if (investmentTotal === null) missing.push("Investimento inicial");
  if (!benefits.length) missing.push("Benefício financeiro anual (economia ou receita)");
  if (!period) missing.push("Período de análise");

  const memory: string[] = [];
  if (investmentTotal !== null) {
    memory.push(
      `Investimento inicial = ${investmentLines.map((line) => `${line.label} (${formatBRL(line.amount ?? 0)})`).join(" + ")} = ${formatBRL(investmentTotal)}.`,
    );
  }
  const recurringLines = input.recurring.filter((line) => line.amount !== null);
  memory.push(
    recurringLines.length
      ? `Custos recorrentes anuais = ${recurringLines.map((line) => `${line.label} (${formatBRL(line.amount ?? 0)})`).join(" + ")} = ${formatBRL(recurringAnnual)}.`
      : "Custos recorrentes anuais: nenhum informado (considerado R$ 0,00).",
  );
  if (period) memory.push(`Período de análise: ${formatNumber(period)} ${period === 1 ? "ano" : "anos"}.`);

  const blockedByPending = pending.length > 0;
  const scenarios = SCENARIOS.map(({ key, label }): ScenarioResult => {
    const notes: string[] = [];
    const values = benefits.map((line) => line[key]);
    const result: ScenarioResult = { key, label, calculable: false, annualBenefit: null, netAnnual: null, netOverPeriod: null, roiPercent: null, paybackYears: null, notes };
    if (!benefits.length) return result;
    if (values.some((value) => value === null)) {
      notes.push("Falta o valor deste cenário em pelo menos um benefício.");
      return result;
    }
    const annualBenefit = values.reduce<number>((total, value) => total + (value ?? 0), 0);
    const netAnnual = annualBenefit - recurringAnnual;
    result.annualBenefit = annualBenefit;
    result.netAnnual = netAnnual;
    memory.push(`[${label}] Benefício líquido anual = ${formatBRL(annualBenefit)} − ${formatBRL(recurringAnnual)} = ${formatBRL(netAnnual)}.`);

    if (investmentTotal === null || !period) return result;
    if (blockedByPending) {
      notes.push("Há valores aguardando cotação: ROI e payback não foram calculados.");
      return result;
    }
    if (investmentTotal <= 0) {
      notes.push("Sem investimento inicial: o ROI não se aplica. Avalie pelo benefício líquido anual.");
      return result;
    }
    const netOverPeriod = netAnnual * period;
    result.netOverPeriod = netOverPeriod;
    result.roiPercent = ((netOverPeriod - investmentTotal) / investmentTotal) * 100;
    result.calculable = true;
    memory.push(
      `[${label}] ROI = (${formatBRL(netAnnual)} × ${formatNumber(period)} − ${formatBRL(investmentTotal)}) / ${formatBRL(investmentTotal)} × 100 = ${formatNumber(result.roiPercent)}%.`,
    );
    if (netAnnual > 0) {
      result.paybackYears = investmentTotal / netAnnual;
      memory.push(`[${label}] Payback = ${formatBRL(investmentTotal)} / ${formatBRL(netAnnual)} = ${formatNumber(result.paybackYears)} anos.`);
      if (result.paybackYears > period) notes.push("O investimento não se paga dentro do período de análise.");
    } else {
      notes.push("Benefício líquido anual não é positivo: não há retorno financeiro do investimento.");
    }
    return result;
  });

  return {
    periodYears: period,
    investmentTotal,
    recurringAnnual,
    pending,
    missing,
    scenarios,
    memory,
    calculable: scenarios.some((scenario) => scenario.calculable),
  };
}

// ---------------------------------------------------------------------------
// Estimativas físicas a partir das respostas (com premissas explícitas)

export const OPERATING_DAYS_PER_YEAR = 250;

export type SavingsEstimate = {
  label: string;
  quantity: number;
  unit: string;
  annualValue: number | null;
  formula: string;
  assumptions: string[];
};

/**
 * Estimativa de economia física quando as respostas trazem os números necessários.
 * O valor em reais só aparece se a tarifa foi informada. É estimativa, não medição.
 */
export function estimateSavings(plan: IdeaPlan | null): SavingsEstimate | null {
  if (!plan) return null;
  const n = (id: string) => numberAnswer(plan, id);
  const daysNote = `${OPERATING_DAYS_PER_YEAR} dias de uso por ano (premissa a ajustar conforme a operação)`;

  if (plan.initiativeType === "iluminacao") {
    const [lamps, watts, idleHours, tariff] = [n("il-luminarias"), n("il-potencia"), n("il-horas-ociosas"), n("il-tarifa")];
    if (!lamps || !watts || !idleHours) return null;
    const kwh = (lamps * watts * idleHours * OPERATING_DAYS_PER_YEAR) / 1000;
    return {
      label: "Energia que deixaria de ser consumida com as luzes desligadas em períodos sem ocupação",
      quantity: kwh,
      unit: "kWh por ano",
      annualValue: tariff ? kwh * tariff : null,
      formula: `${formatNumber(lamps)} luminárias × ${formatNumber(watts)} W × ${formatNumber(idleHours)} h/dia × ${OPERATING_DAYS_PER_YEAR} dias ÷ 1000${tariff ? ` × ${formatBRL(tariff)}/kWh` : ""}`,
      assumptions: [daysNote, "Supõe que os sensores eliminam todo o tempo ocioso informado; na prática a redução tende a ser menor."],
    };
  }
  if (plan.initiativeType === "energia") {
    const [units, kw, idleHours, tariff] = [n("en-quantidade"), n("en-potencia"), n("en-ocioso"), n("en-tarifa")];
    if (!units || !kw || !idleHours) return null;
    const kwh = units * kw * idleHours * OPERATING_DAYS_PER_YEAR;
    return {
      label: "Energia que deixaria de ser consumida com os equipamentos desligados quando sem uso",
      quantity: kwh,
      unit: "kWh por ano",
      annualValue: tariff ? kwh * tariff : null,
      formula: `${formatNumber(units)} equipamentos × ${formatNumber(kw)} kW × ${formatNumber(idleHours)} h/dia × ${OPERATING_DAYS_PER_YEAR} dias${tariff ? ` × ${formatBRL(tariff)}/kWh` : ""}`,
      assumptions: [daysNote, "Usa a potência nominal; o consumo real em espera costuma ser menor."],
    };
  }
  if (plan.initiativeType === "agua_reuso" || plan.initiativeType === "agua_consumo") {
    const prefix = plan.initiativeType === "agua_reuso" ? "ar" : "ac";
    const [monthly, tariff] = [n(`${prefix}-reducao`), n(`${prefix}-tarifa`)];
    if (!monthly) return null;
    const yearly = monthly * 12;
    return {
      label: "Água da rede que deixaria de ser consumida",
      quantity: yearly,
      unit: "m³ por ano",
      annualValue: tariff ? yearly * tariff : null,
      formula: `${formatNumber(monthly)} m³/mês × 12${tariff ? ` × ${formatBRL(tariff)}/m³` : ""}`,
      assumptions: ["Usa a redução mensal informada pelo colaborador, sem medição."],
    };
  }
  return null;
}

/** Valores iniciais da análise a partir das respostas; a gestão revisa antes de salvar. */
export function initialFinance(plan: IdeaPlan | null, now = new Date()): FinanceInput {
  const initial = numberAnswer(plan, "g-custo-inicial");
  const monthly = numberAnswer(plan, "g-custo-recorrente");
  const estimate = estimateSavings(plan);
  const benefits: BenefitLine[] = estimate?.annualValue
    ? [{ label: estimate.label, conservative: null, likely: Math.round(estimate.annualValue * 100) / 100, optimistic: null, origin: "estimado", referenceId: null, basis: estimate.formula }]
    : [];
  return {
    periodYears: null,
    investment: initial !== null ? [{ label: "Estimativa do colaborador", amount: initial, origin: "informado", referenceId: null }] : [],
    recurring: monthly !== null ? [{ label: "Operação e manutenção (informado por mês × 12)", amount: monthly * 12, origin: "informado", referenceId: null }] : [],
    benefits,
    nonFinancialBenefits: null,
    assumptions: null,
    updatedAt: now.toISOString(),
  };
}
