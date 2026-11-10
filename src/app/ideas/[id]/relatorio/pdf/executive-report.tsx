import { Document, Font, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import type { ExecutionPlan } from "@/lib/idea-execution-plan";
import type { Recommendation } from "@/lib/esg-project-proposal";
import type { Feasibility } from "@/lib/feasibility";
import { formatBRL, formatNumber } from "@/lib/idea-finance";

/** Cores da marca NUEVO (as mesmas do site, em versão clara para impressão). */
const C = {
  ink: "#1b1442",
  soft: "#453d6e",
  muted: "#6b6590",
  line: "#e7e3f6",
  brand: "#6d3fd4",
  brandDark: "#4f27a8",
  brandPale: "#f3effd",
  blue: "#2470c4",
  purple: "#9c48c6",
  green: "#13875f",
  greenPale: "#e3f4ec",
  amber: "#8a5a1c",
  amberPale: "#fbf3df",
  red: "#a33b37",
  redPale: "#fbeceb",
  surface: "#faf9fe",
};

let fontsRegistered = false;
export function registerFonts(origin: string) {
  if (fontsRegistered) return;
  Font.register({
    family: "Jakarta",
    fonts: [
      { src: `${origin}/fonts/PlusJakartaSans-400.ttf`, fontWeight: 400 },
      { src: `${origin}/fonts/PlusJakartaSans-600.ttf`, fontWeight: 600 },
      { src: `${origin}/fonts/PlusJakartaSans-700.ttf`, fontWeight: 700 },
      { src: `${origin}/fonts/PlusJakartaSans-800.ttf`, fontWeight: 800 },
    ],
  });
  // Sem hifenização automática: palavras em português não são quebradas.
  Font.registerHyphenationCallback((word) => [word]);
  fontsRegistered = true;
}

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 52, paddingHorizontal: 38, fontFamily: "Jakarta", fontSize: 9, color: C.ink, lineHeight: 1.45 },
  brandRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  brand: { flexDirection: "row", alignItems: "center", gap: 7 },
  logo: { width: 22, height: 22 },
  brandName: { fontSize: 11, fontWeight: 800, letterSpacing: 0.6 },
  docType: { fontSize: 7.5, fontWeight: 700, color: C.muted, letterSpacing: 1.4, textAlign: "right" },
  stripe: { flexDirection: "row", height: 4, marginTop: 10, marginBottom: 16, borderRadius: 2 },
  title: { fontSize: 19, fontWeight: 800, lineHeight: 1.2, marginBottom: 5 },
  meta: { fontSize: 8.5, color: C.muted, marginBottom: 8 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 5, marginBottom: 14 },
  tag: { fontSize: 7.5, fontWeight: 700, paddingVertical: 2.5, paddingHorizontal: 7, borderRadius: 9 },
  section: { marginTop: 14 },
  h2: { fontSize: 10.5, fontWeight: 800, color: C.brandDark, marginBottom: 6, letterSpacing: 0.2 },
  kpis: { flexDirection: "row", borderWidth: 1, borderColor: C.line, borderRadius: 8 },
  kpi: { flex: 1, paddingVertical: 9, paddingHorizontal: 9, borderRightWidth: 1, borderRightColor: C.line },
  kpiLast: { flex: 1, paddingVertical: 9, paddingHorizontal: 9 },
  kpiLabel: { fontSize: 6.8, fontWeight: 700, color: C.muted, letterSpacing: 0.6, marginBottom: 3 },
  kpiValue: { fontSize: 13, fontWeight: 800 },
  kpiHint: { fontSize: 6.8, color: C.muted, marginTop: 2 },
  box: { borderRadius: 8, padding: 10 },
  bullet: { flexDirection: "row", marginBottom: 2.5 },
  bulletDot: { width: 9, color: C.brand },
  bulletText: { flex: 1 },
  table: { borderWidth: 1, borderColor: C.line, borderRadius: 6 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.line },
  trLast: { flexDirection: "row" },
  th: { fontSize: 7, fontWeight: 700, color: C.muted, letterSpacing: 0.5, paddingVertical: 5, paddingHorizontal: 6, backgroundColor: C.surface },
  td: { fontSize: 8.3, paddingVertical: 5, paddingHorizontal: 6 },
  quote: { borderLeftWidth: 3, borderLeftColor: C.brand, backgroundColor: C.brandPale, padding: 10, borderRadius: 4 },
  small: { fontSize: 7.5, color: C.muted },
  footer: { position: "absolute", bottom: 22, left: 38, right: 38, flexDirection: "row", justifyContent: "space-between", fontSize: 7, color: C.muted, borderTopWidth: 1, borderTopColor: C.line, paddingTop: 6 },
});

const PILLAR = { E: { label: "Ambiental", color: "#13875f", bg: "#e3f4ec" }, S: { label: "Social", color: "#2470c4", bg: "#e4f0fb" }, G: { label: "Governança", color: "#7a4fc9", bg: "#efe9fb" } } as const;
const RECOMMENDATION = {
  accept: { color: C.green, bg: C.greenPale },
  accept_with_conditions: { color: C.amber, bg: C.amberPale },
  not_now: { color: C.red, bg: C.redPale },
} as const;

const brlCompact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const compactBRL = (value: number) => brlCompact.format(value);
const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
const years = (value: number | null) => (value === null ? "—" : `${formatNumber(value)} ${value === 1 ? "ano" : "anos"}`);
const percent = (value: number | null) => (value === null ? "—" : `${formatNumber(value)}%`);

function Bullets({ items, color = C.brand }: { items: string[]; color?: string }) {
  return (
    <View>
      {items.map((item, index) => (
        <View key={`${index}-${item.slice(0, 20)}`} style={s.bullet} wrap={false}>
          <Text style={[s.bulletDot, { color }]}>•</Text>
          <Text style={s.bulletText}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function Table({ columns, rows }: { columns: { label: string; width: string; align?: "right" }[]; rows: string[][] }) {
  return (
    <View style={s.table}>
      <View style={s.tr} fixed>
        {columns.map((column) => (
          <Text key={column.label} style={[s.th, { width: column.width, textAlign: column.align ?? "left" }]}>{column.label.toUpperCase()}</Text>
        ))}
      </View>
      {rows.map((row, index) => (
        <View key={index} style={index === rows.length - 1 ? s.trLast : s.tr} wrap={false}>
          {row.map((cell, cellIndex) => (
            <Text key={cellIndex} style={[s.td, { width: columns[cellIndex].width, textAlign: columns[cellIndex].align ?? "left" }, cellIndex === 0 ? { fontWeight: 700 } : {}]}>
              {cell}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export type ExecutiveReportData = {
  origin: string;
  organization: string;
  /** Ex.: "250 funcionários · Serra/ES" (do perfil da empresa). */
  companyLine: string | null;
  generatedAt: Date;
  generatedBy: string | null;
  protocol: string;
  idea: { title: string; status: string; author: string | null; submittedAt: string | null; area: string | null; original: string };
  pillars: string[];
  initiativeType: string;
  esgScore: { value: number; partial: boolean } | null;
  recommendation: Recommendation | null;
  feasibility: Feasibility;
  plan: ExecutionPlan;
  lastDecision: { status: string; justification: string; at: string } | null;
};

const dateFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "long", timeZone: "America/Sao_Paulo" });
const dateTimeFormat = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });

/** Relatório executivo: só o essencial para decidir e registrar, em até duas páginas. */
export function ExecutiveReport({ data }: { data: ExecutiveReportData }) {
  const { feasibility, plan, idea } = data;
  const [conservative, likely, optimistic] = feasibility.scenarios;
  const meta = feasibility.benefitSource === "meta";
  const tone = data.recommendation ? RECOMMENDATION[data.recommendation.key] : null;
  const risks = plan.risks.map((risk) => risk.text).filter((text) => !/não vejo dificuldades/i.test(text)).slice(0, 5);
  const pending = [...feasibility.missing, ...plan.pending.filter((item) => item.startsWith("Sem resposta") === false)].slice(0, 6);
  const range = (low: number, high: number) =>
    Math.abs(high - low) < 0.5 ? undefined : `${compactBRL(Math.min(low, high))} a ${compactBRL(Math.max(low, high))}`;


  return (
    <Document title={`Relatório executivo · ${idea.title}`} author="NUEVO ESG" subject={`Protocolo ${data.protocol}`} language="pt-BR">
      <Page size="A4" style={s.page}>
        <View style={s.brandRow}>
          <View style={s.brand}>
            {/* eslint-disable-next-line jsx-a11y/alt-text -- o Image do react-pdf não tem alt */}
            <Image src={`${data.origin}/logo-nuevo.png`} style={s.logo} />
            <Text style={s.brandName}>NUEVO <Text style={{ color: C.brand }}>ESG</Text></Text>
          </View>
          <View>
            <Text style={s.docType}>RELATÓRIO EXECUTIVO</Text>
            <Text style={[s.small, { textAlign: "right" }]}>{data.organization}</Text>
            {data.companyLine && <Text style={[s.small, { textAlign: "right" }]}>{data.companyLine}</Text>}
          </View>
        </View>
        <View style={s.stripe}>
          <View style={{ flex: 1, backgroundColor: C.blue }} />
          <View style={{ flex: 1.4, backgroundColor: C.brand }} />
          <View style={{ flex: 1, backgroundColor: C.purple }} />
        </View>

        <Text style={s.title}>{idea.title}</Text>
        <Text style={s.meta}>
          Protocolo {data.protocol}
          {idea.submittedAt ? `  ·  Enviada em ${dateFormat.format(new Date(idea.submittedAt))}` : ""}
          {idea.author ? `  ·  Por ${idea.author}` : ""}
          {idea.area ? `  ·  ${idea.area}` : ""}
        </Text>
        <View style={s.tags}>
          <Text style={[s.tag, { color: C.brandDark, backgroundColor: C.brandPale }]}>{idea.status}</Text>
          {data.pillars.map((pillar) => {
            const info = PILLAR[pillar as keyof typeof PILLAR];
            return info ? <Text key={pillar} style={[s.tag, { color: info.color, backgroundColor: info.bg }]}>{info.label}</Text> : null;
          })}
          <Text style={[s.tag, { color: C.soft, backgroundColor: C.surface }]}>{data.initiativeType}</Text>
          {data.esgScore && (
            <Text style={[s.tag, { color: C.soft, backgroundColor: C.surface }]}>
              Potencial ESG {Math.round(data.esgScore.value)}/100{data.esgScore.partial ? " (parcial)" : ""}
            </Text>
          )}
        </View>

        <View style={s.kpis} wrap={false}>
          {[
            { label: "INVESTIMENTO", value: formatBRL(likely.investment), hint: range(optimistic.investment, conservative.investment) },
            { label: "CUSTO POR ANO", value: formatBRL(likely.recurring), hint: range(optimistic.recurring, conservative.recurring) },
            { label: meta ? "ECONOMIA NECESSÁRIA/ANO" : "ECONOMIA POR ANO", value: formatBRL(likely.annualBenefit), hint: range(conservative.annualBenefit, optimistic.annualBenefit) },
            { label: "PAYBACK", value: years(likely.paybackYears), hint: conservative.paybackYears !== null && optimistic.paybackYears !== null ? `de ${formatNumber(optimistic.paybackYears)} a ${formatNumber(conservative.paybackYears)} anos` : undefined },
            { label: `ROI EM ${formatNumber(feasibility.periodYears)} ANOS`, value: percent(likely.roiPercent), hint: feasibility.hypothetical ? "cenário hipotético" : "cenário provável" },
          ].map((kpi, index, list) => (
            <View key={kpi.label} style={index === list.length - 1 ? s.kpiLast : s.kpi}>
              <Text style={s.kpiLabel}>{kpi.label}</Text>
              <Text style={[s.kpiValue, index === list.length - 1 ? { color: C.brand } : {}]}>{kpi.value}</Text>
              {kpi.hint && <Text style={s.kpiHint}>{kpi.hint}</Text>}
            </View>
          ))}
        </View>

        {feasibility.hypothetical && (
          <View style={[s.box, { backgroundColor: C.amberPale, marginTop: 8 }]} wrap={false}>
            <Text style={{ fontWeight: 800, color: C.amber, marginBottom: 3 }}>CENÁRIO HIPOTÉTICO</Text>
            <Text style={{ marginBottom: 4 }}>Onde faltaram dados reais, o cálculo usa as suposições abaixo. Substitua por cotações e medições antes de decidir o investimento.</Text>
            <Bullets items={feasibility.hypotheses} color={C.amber} />
          </View>
        )}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Cenários</Text>
          <Table
            columns={[
              { label: "Cenário", width: "20%" },
              { label: "Investimento", width: "18%", align: "right" },
              { label: meta ? "Economia (meta)" : "Economia/ano", width: "18%", align: "right" },
              { label: "Custo/ano", width: "15%", align: "right" },
              { label: "Payback", width: "14%", align: "right" },
              { label: "ROI", width: "15%", align: "right" },
            ]}
            rows={feasibility.scenarios.map((scenario) => [
              scenario.label,
              formatBRL(scenario.investment),
              formatBRL(scenario.annualBenefit),
              formatBRL(scenario.recurring),
              years(scenario.paybackYears),
              percent(scenario.roiPercent),
            ])}
          />
          <Text style={[s.small, { marginTop: 3 }]}>
            Conservador: investimento mais alto e menor economia; otimista: o contrário. ROI = (economia − custo anual) × {formatNumber(feasibility.periodYears)} anos − investimento, ÷ investimento.
          </Text>
        </View>

        {data.recommendation && tone && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Recomendação do sistema</Text>
            <View style={[s.box, { backgroundColor: tone.bg }]}>
              <Text style={{ fontWeight: 800, color: tone.color, fontSize: 10.5, marginBottom: 3 }}>{data.recommendation.label}</Text>
              <Bullets items={data.recommendation.reasons.slice(0, 3)} color={tone.color} />
              {data.recommendation.conditions.length > 0 && (
                <Text style={[s.small, { marginTop: 3 }]}>Condições: {data.recommendation.conditions.slice(0, 3).join("; ")}.</Text>
              )}
            </View>
            <Text style={[s.small, { marginTop: 3 }]}>Sugestão por regras, sem valor de decisão. A decisão é da gestão.</Text>
          </View>
        )}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>A ideia, nas palavras do colaborador</Text>
          <View style={s.quote}>
            <Text>{clip(idea.original || "Não informado.", 900)}</Text>
          </View>
          {(plan.identification.problem || plan.identification.objective) && (
            <View style={{ marginTop: 6 }}>
              {plan.identification.problem && <Text><Text style={{ fontWeight: 700 }}>Problema: </Text>{clip(plan.identification.problem.text, 300)}</Text>}
              {plan.identification.objective && <Text><Text style={{ fontWeight: 700 }}>Objetivo: </Text>{clip(plan.identification.objective.text, 300)}</Text>}
            </View>
          )}
        </View>

        <View style={s.section} break>
          <Text style={s.h2}>Plano de execução</Text>
          <Table
            columns={[
              { label: "#", width: "6%" },
              { label: "Etapa", width: "34%" },
              { label: "Prazo estimado", width: "26%" },
              { label: "Responsável sugerido", width: "34%" },
            ]}
            rows={plan.steps.map((step) => [String(step.order), step.title, step.duration, step.responsible])}
          />
          {plan.informedDeadline && <Text style={[s.small, { marginTop: 3 }]}>Prazo total imaginado pelo colaborador: {plan.informedDeadline}.</Text>}
        </View>

        {risks.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>Riscos e pontos de atenção</Text>
            <Bullets items={risks} color={C.red} />
          </View>
        )}

        {pending.length > 0 && (
          <View style={s.section} wrap={false}>
            <Text style={s.h2}>O que falta confirmar</Text>
            <Bullets items={pending} color={C.amber} />
          </View>
        )}

        <View style={s.section} wrap={false}>
          <Text style={s.h2}>Registro</Text>
          <View style={[s.box, { backgroundColor: C.surface, borderWidth: 1, borderColor: C.line }]}>
            <Text>
              <Text style={{ fontWeight: 700 }}>Situação atual: </Text>
              {idea.status}
            </Text>
            {data.lastDecision ? (
              <Text style={{ marginTop: 2 }}>
                <Text style={{ fontWeight: 700 }}>Última decisão ({dateTimeFormat.format(new Date(data.lastDecision.at))}): </Text>
                {data.lastDecision.status}. {clip(data.lastDecision.justification, 400)}
              </Text>
            ) : (
              <Text style={{ marginTop: 2 }}>Ainda sem decisão registrada pela gestão.</Text>
            )}
            <Text style={[s.small, { marginTop: 5 }]}>
              Gerado em {dateTimeFormat.format(data.generatedAt)}{data.generatedBy ? ` por ${data.generatedBy}` : ""}. Documento de apoio à decisão: valores
              estimados por regras e pesquisa automática, sem verificação técnica.
            </Text>
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>NUEVO ESG  ·  {data.organization}  ·  Protocolo {data.protocol}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber} de ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
