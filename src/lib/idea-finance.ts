import { numberAnswer, type IdeaPlan } from "./idea-planning.ts";

/**
 * Cenários, formatação e estimativa física de economia a partir das respostas.
 * O cálculo de investimento, payback e ROI fica em feasibility.ts.
 *
 * ROI (%) = [(benefício líquido anual × período − investimento) / investimento] × 100
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
export function estimateSavings(
  plan: IdeaPlan | null,
  researchedTariff: number | null = null,
  operatingDays: number | null = null,
): SavingsEstimate | null {
  if (!plan) return null;
  const n = (id: string) => numberAnswer(plan, id);
  const days = operatingDays ?? OPERATING_DAYS_PER_YEAR;
  const daysNote = operatingDays
    ? `${days} dias de funcionamento por ano (cadastro da empresa)`
    : `${days} dias de uso por ano (premissa a ajustar conforme a operação)`;

  if (plan.initiativeType === "iluminacao") {
    const [lamps, watts, idleHours, tariff] = [n("il-luminarias"), n("il-potencia"), n("il-horas-ociosas"), n("il-tarifa") ?? researchedTariff];
    if (!lamps || !watts || !idleHours) return null;
    const kwh = (lamps * watts * idleHours * days) / 1000;
    return {
      label: "Energia que deixaria de ser consumida com as luzes desligadas em períodos sem ocupação",
      quantity: kwh,
      unit: "kWh por ano",
      annualValue: tariff ? kwh * tariff : null,
      formula: `${formatNumber(lamps)} luminárias × ${formatNumber(watts)} W × ${formatNumber(idleHours)} h/dia × ${days} dias ÷ 1000${tariff ? ` × ${formatBRL(tariff)}/kWh` : ""}`,
      assumptions: [daysNote, "Supõe que os sensores eliminam todo o tempo ocioso informado; na prática a redução tende a ser menor."],
    };
  }
  if (plan.initiativeType === "energia") {
    const [units, kw, idleHours, tariff] = [n("en-quantidade"), n("en-potencia"), n("en-ocioso"), n("en-tarifa") ?? researchedTariff];
    if (!units || !kw || !idleHours) return null;
    const kwh = units * kw * idleHours * days;
    return {
      label: "Energia que deixaria de ser consumida com os equipamentos desligados quando sem uso",
      quantity: kwh,
      unit: "kWh por ano",
      annualValue: tariff ? kwh * tariff : null,
      formula: `${formatNumber(units)} equipamentos × ${formatNumber(kw)} kW × ${formatNumber(idleHours)} h/dia × ${days} dias${tariff ? ` × ${formatBRL(tariff)}/kWh` : ""}`,
      assumptions: [daysNote, "Usa a potência nominal; o consumo real em espera costuma ser menor."],
    };
  }
  if (plan.initiativeType === "agua_reuso" || plan.initiativeType === "agua_consumo") {
    const prefix = plan.initiativeType === "agua_reuso" ? "ar" : "ac";
    const [monthly, tariff] = [n(`${prefix}-reducao`), n(`${prefix}-tarifa`) ?? researchedTariff];
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
