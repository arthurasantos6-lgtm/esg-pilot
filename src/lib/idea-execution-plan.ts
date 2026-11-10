import { classifyText } from "./esg-classifier.ts";
import { ESG_SUBCATEGORIES } from "./esg-engine.ts";
import { estimateSavings, type SavingsEstimate } from "./idea-finance.ts";
import {
  answerText,
  INITIATIVE_TYPES,
  NOT_KNOWN,
  numberAnswer,
  planProgress,
  TO_EVALUATE,
  visibleQuestions,
  type IdeaPlan,
  type InitiativeType,
  type PlanProgress,
} from "./idea-planning.ts";

/**
 * Plano de execução montado por regras a partir das respostas. Cada item diz de
 * onde veio: do colaborador, da gestão ou de uma regra do sistema (sugestão a
 * validar). Prazos por etapa são estimativas genéricas, não compromissos.
 */

export type Source = "colaborador" | "gestao" | "regra";
export type Sourced = { text: string; source: Source };

export const SOURCE_LABELS: Record<Source, string> = {
  colaborador: "Informado pelo colaborador",
  gestao: "Informado pela gestão",
  regra: "Sugestão do sistema, a validar",
};

export type PlanStep = {
  order: number;
  key: string;
  title: string;
  activity: string;
  duration: string;
  dependsOn: number[];
  responsible: string;
};

export type ExecutionPlan = {
  identification: {
    name: string;
    pillar: string;
    initiativeType: string;
    themes: string[];
    description: string;
    objective: Sourced | null;
    problem: Sourced | null;
    location: Sourced | null;
    scope: Sourced[];
  };
  execution: { summary: string; activities: Sourced[]; areas: Sourced[] };
  steps: PlanStep[];
  resources: { label: string; items: Sourced[] }[];
  results: {
    environmental: Sourced[];
    social: Sourced[];
    economic: Sourced[];
    informed: Sourced | null;
    indicators: { name: string; how: string; source: Source }[];
  };
  savings: SavingsEstimate | null;
  risks: Sourced[];
  informedDeadline: string | null;
  pending: string[];
  progress: PlanProgress;
};

const PILLAR_LABELS = { E: "Ambiental", S: "Social", G: "Governança" } as const;

type Profile = {
  area: string;
  assessment: string;
  implementation: (plan: IdeaPlan) => string;
  equipment: string[];
  materials: string[];
  labor: string[];
  environmental: string[];
  social: string[];
  economic: string[];
  indicators: { name: string; how: string }[];
  /** A execução depende de mudança de hábito ou de rotina das pessoas. */
  behavioral: boolean;
};

const n = (plan: IdeaPlan, id: string) => numberAnswer(plan, id);
const qty = (value: number | null, unit: string) => (value ? `${value} ${unit}` : null);

const PROFILES: Record<InitiativeType, Profile> = {
  iluminacao: {
    area: "Manutenção elétrica",
    assessment: "Vistoriar os ambientes, contar luminárias e circuitos e verificar onde os sensores podem ser instalados.",
    implementation: (plan) => `Instalar os sensores${qty(n(plan, "il-pontos"), "ambientes ou pontos") ? ` em ${qty(n(plan, "il-pontos"), "ambientes ou pontos")}` : ""} e ajustar o tempo de desligamento de cada ambiente.`,
    equipment: ["Sensores de presença compatíveis com o tipo de iluminação e o circuito"],
    materials: ["Cabos, caixas de passagem e acessórios de instalação elétrica"],
    labor: ["Eletricista habilitado (NR-10) para a instalação"],
    environmental: ["Menor consumo de energia elétrica e emissões indiretas associadas"],
    social: [],
    economic: ["Redução da conta de energia"],
    indicators: [
      { name: "Consumo de energia da iluminação (kWh/mês)", how: "Comparar a conta ou o medidor do circuito antes e depois da instalação." },
      { name: "Horas de iluminação acesa sem ocupação", how: "Registrar por amostragem antes e depois." },
    ],
    behavioral: false,
  },
  solar: {
    area: "Engenharia / manutenção elétrica",
    assessment: "Avaliar a área, o sombreamento, a estrutura de apoio e o padrão de entrada de energia.",
    implementation: () => "Instalar painéis, inversores e proteções conforme o projeto aprovado e solicitar a vistoria da distribuidora.",
    equipment: ["Painéis fotovoltaicos", "Inversor(es)", "Estrutura de fixação"],
    materials: ["Cabos solares, conectores e proteções elétricas (string box)"],
    labor: ["Projeto elétrico com responsável técnico", "Equipe de instalação"],
    environmental: ["Geração de energia renovável e redução de emissões indiretas"],
    social: [],
    economic: ["Redução da conta de energia (compensação de créditos)"],
    indicators: [
      { name: "Energia gerada (kWh/mês)", how: "Leitura do inversor ou do sistema de monitoramento." },
      { name: "Energia comprada da rede (kWh/mês)", how: "Comparar as contas antes e depois." },
    ],
    behavioral: false,
  },
  energia: {
    area: "Manutenção",
    assessment: "Levantar os equipamentos, os horários de uso e o consumo em espera.",
    implementation: (plan) => `Aplicar a solução escolhida${answerText(plan, "en-solucao") ? ` (${answerText(plan, "en-solucao")?.toLowerCase()})` : ""} nos equipamentos selecionados.`,
    equipment: ["Medidor de energia para a linha de base (se não houver medição)"],
    materials: [],
    labor: ["Equipe de manutenção"],
    environmental: ["Menor consumo de energia elétrica e emissões indiretas associadas"],
    social: [],
    economic: ["Redução da conta de energia", "Possível aumento da vida útil dos equipamentos"],
    indicators: [
      { name: "Consumo de energia (kWh/mês)", how: "Medidor ou conta, comparando antes e depois." },
      { name: "Consumo por unidade produzida (kWh/unidade)", how: "Dividir o consumo pela produção do período." },
    ],
    behavioral: true,
  },
  agua_reuso: {
    area: "Manutenção hidráulica / facilities",
    assessment: "Avaliar a origem, a qualidade e o volume da água disponível e o trajeto até o ponto de uso.",
    implementation: () => "Instalar o sistema de captação, armazenamento e distribuição até os pontos de reúso, com identificação de água não potável.",
    equipment: ["Bomba de recalque (se houver desnível)"],
    materials: ["Tubulações e conexões", "Sinalização de água não potável"],
    labor: ["Encanador ou equipe de manutenção hidráulica"],
    environmental: ["Menor captação de água da rede ou de poço"],
    social: [],
    economic: ["Redução da conta de água"],
    indicators: [
      { name: "Água reaproveitada (m³/mês)", how: "Hidrômetro na saída do reservatório de reúso." },
      { name: "Água comprada da rede (m³/mês)", how: "Comparar as contas antes e depois." },
    ],
    behavioral: false,
  },
  agua_consumo: {
    area: "Manutenção hidráulica / facilities",
    assessment: "Mapear os pontos de consumo e de perda de água.",
    implementation: (plan) => `Executar as mudanças nos pontos de uso${answerText(plan, "ac-solucao") ? `: ${answerText(plan, "ac-solucao")}` : ""}.`,
    equipment: [],
    materials: ["Peças de reposição ou dispositivos economizadores (conforme o levantamento)"],
    labor: ["Encanador ou equipe de manutenção"],
    environmental: ["Menor consumo de água"],
    social: [],
    economic: ["Redução da conta de água"],
    indicators: [{ name: "Consumo de água (m³/mês)", how: "Hidrômetro ou conta, antes e depois." }],
    behavioral: true,
  },
  residuos: {
    area: "Meio ambiente / facilities",
    assessment: "Caracterizar o resíduo, pesar a geração e verificar o armazenamento e a destinação atuais.",
    implementation: (plan) => `Implantar a separação e a nova destinação${answerText(plan, "re-destino-novo") ? ` (${answerText(plan, "re-destino-novo")?.toLowerCase()})` : ""}, com registro das quantidades enviadas.`,
    equipment: [],
    materials: ["Coletores identificados por tipo de resíduo (se necessário)"],
    labor: ["Equipe de limpeza / facilities para a rotina de coleta"],
    environmental: ["Menos resíduo enviado para aterro", "Reaproveitamento de materiais"],
    social: ["Possível geração de renda para cooperativas de reciclagem"],
    economic: ["Possível redução do custo de descarte", "Possível receita com venda de recicláveis"],
    indicators: [
      { name: "Resíduos gerados (kg/mês)", how: "Pesagem ou manifesto de transporte." },
      { name: "Resíduos reciclados ou reaproveitados (kg/mês)", how: "Comprovantes da destinação (MTR, certificados)." },
    ],
    behavioral: true,
  },
  emissoes: {
    area: "Meio ambiente / manutenção",
    assessment: "Identificar a fonte, o consumo de combustível ou insumo e a medição existente.",
    implementation: (plan) => `Aplicar a solução escolhida${answerText(plan, "em-solucao") ? ` (${answerText(plan, "em-solucao")?.toLowerCase()})` : ""} e registrar o consumo.`,
    equipment: [],
    materials: [],
    labor: ["Equipe de manutenção ou de frota"],
    environmental: ["Redução de emissões ou de poluentes (calcular com premissas explícitas)"],
    social: ["Possível melhora da qualidade do ar no entorno"],
    economic: ["Possível redução do gasto com combustível ou insumo"],
    indicators: [
      { name: "Consumo de combustível ou insumo (por mês)", how: "Notas de abastecimento ou controle de estoque." },
      { name: "Emissões estimadas (tCO₂e)", how: "Fatores de emissão oficiais, com premissas registradas." },
    ],
    behavioral: false,
  },
  seguranca: {
    area: "Segurança do trabalho (SESMT)",
    assessment: "Analisar o risco no local com a segurança do trabalho e registrar a situação atual.",
    implementation: (plan) => `Implantar a medida de controle${answerText(plan, "se-medida") ? ` (${answerText(plan, "se-medida")?.toLowerCase()})` : ""} e orientar as pessoas expostas.`,
    equipment: [],
    materials: [],
    labor: ["Técnico ou engenheiro de segurança do trabalho"],
    environmental: [],
    social: ["Redução do risco de acidentes e de afastamentos", "Melhores condições de trabalho"],
    economic: ["Possível redução de custos com afastamentos"],
    indicators: [
      { name: "Ocorrências registradas por período", how: "Registros de incidentes e quase acidentes." },
      { name: "Taxa de frequência de acidentes", how: "Cálculo padrão do SESMT." },
    ],
    behavioral: true,
  },
  capacitacao: {
    area: "Recursos humanos / treinamento",
    assessment: "Definir conteúdo, público, carga horária e forma de avaliação.",
    implementation: (plan) => `Realizar o treinamento${qty(n(plan, "ca-participantes"), "participantes") ? ` com ${qty(n(plan, "ca-participantes"), "participantes")}` : ""}, registrando presença e avaliação.`,
    equipment: [],
    materials: ["Material didático"],
    labor: ["Instrutor (interno ou externo)"],
    environmental: [],
    social: ["Desenvolvimento das pessoas participantes"],
    economic: [],
    indicators: [
      { name: "Horas de capacitação", how: "Lista de presença × carga horária." },
      { name: "Resultado da avaliação antes e depois", how: "Teste ou observação prática." },
    ],
    behavioral: false,
  },
  social: {
    area: "Recursos humanos / responsabilidade social",
    assessment: "Entender a necessidade do público beneficiado, de preferência com ele.",
    implementation: (plan) => `Realizar a ação${answerText(plan, "so2-acao") ? `: ${answerText(plan, "so2-acao")}` : ""}.`,
    equipment: [],
    materials: [],
    labor: ["Equipe organizadora"],
    environmental: [],
    social: ["Benefício direto ao público atendido"],
    economic: [],
    indicators: [
      { name: "Pessoas beneficiadas", how: "Registro de participação." },
      { name: "Satisfação ou resultado percebido", how: "Pesquisa simples com o público atendido." },
    ],
    behavioral: false,
  },
  governanca: {
    area: "Área dona do processo, com compliance",
    assessment: "Mapear o processo atual e os pontos de falha.",
    implementation: (plan) => `Implantar a mudança${answerText(plan, "go-mudanca") ? ` (${answerText(plan, "go-mudanca")?.toLowerCase()})` : ""}, formalizar o procedimento e orientar as áreas envolvidas.`,
    equipment: [],
    materials: [],
    labor: ["Responsável pelo processo"],
    environmental: [],
    social: [],
    economic: ["Possível redução de perdas, multas ou retrabalho"],
    indicators: [
      { name: "Não conformidades no processo", how: "Registros de auditoria ou de controle." },
      { name: "Cumprimento do procedimento", how: "Verificação por amostragem." },
    ],
    behavioral: true,
  },
  geral: {
    area: "Área responsável pela iniciativa",
    assessment: "Avaliar a viabilidade técnica com a área envolvida.",
    implementation: () => "Executar a iniciativa conforme o escopo aprovado.",
    equipment: [],
    materials: [],
    labor: [],
    environmental: [],
    social: [],
    economic: [],
    indicators: [],
    behavioral: true,
  },
};

const fromAnswer = (plan: IdeaPlan, id: string, prefix = ""): Sourced | null => {
  const answer = plan.answers[id];
  if (answer?.status !== "answered" || !answer.value) return null;
  return { text: `${prefix}${answer.value}`, source: answer.by === "management" ? "gestao" : "colaborador" };
};
const rule = (text: string): Sourced => ({ text, source: "regra" });
const compact = <T>(items: (T | null | undefined | false)[]) => items.filter(Boolean) as T[];
const is = (plan: IdeaPlan, id: string, ...values: string[]) => values.includes(answerText(plan, id) ?? "");
const undecided = (plan: IdeaPlan, id: string) => {
  const status = plan.answers[id]?.status;
  return !status || status !== "answered";
};

type StepDraft = Omit<PlanStep, "order" | "dependsOn"> & { after: string[] };

export function buildExecutionPlan(input: { title: string; originalText: string; plan: IdeaPlan }): ExecutionPlan {
  const { plan } = input;
  const type = plan.initiativeType;
  const profile = PROFILES[type];
  const classification = classifyText(input.originalText);
  const pillarCode = INITIATIVE_TYPES[type].pillar ?? classification.primary_pillar;
  const themes = classification.subcategories.map((code) => {
    const subcategory = ESG_SUBCATEGORIES.find((item) => item.code === code);
    return `${code} ${subcategory?.label ?? ""}`.trim();
  });

  // Necessidades que mudam as etapas.
  const external =
    is(plan, "g-fornecedor", "Sim") ||
    is(plan, "il-instalacao", "Empresa especializada", "As duas") ||
    is(plan, "so-instalacao", "Empresa especializada", "As duas") ||
    is(plan, "ca-instrutor", "Externo") ||
    is(plan, "re-receptor", "Não") ||
    type === "solar";
  const supplierUnclear = visibleQuestions(plan).some((question) => question.id === "g-fornecedor") && undecided(plan, "g-fornecedor");
  const purchase =
    ["iluminacao", "solar", "agua_reuso"].includes(type) ||
    is(plan, "re-coletores", "Sim") ||
    is(plan, "en-solucao", "Temporizador ou automação", "Troca por equipamento mais eficiente") ||
    is(plan, "em-solucao", "Filtros ou controle", "Troca de veículo ou equipamento") ||
    is(plan, "se-medida", "EPI", "Proteção coletiva", "Sinalização", "Adequação ergonômica") ||
    is(plan, "go-mudanca", "Sistema ou software") ||
    Boolean(answerText(plan, "g-materiais")) ||
    (numberAnswer(plan, "g-custo-inicial") ?? 0) > 0;
  const infrastructure =
    is(plan, "il-infra", "Não") || is(plan, "so-estrutura", "Não") || is(plan, "ar-hidraulica", "Sim") || is(plan, "ar-reservatorio", "Sim") || is(plan, "re-coletores", "Sim");
  const licensing = compact([
    type === "solar" && "Projeto e homologação junto à distribuidora de energia",
    is(plan, "re-licenca", "Sim") && "Verificar licença ambiental e transporte do resíduo",
    is(plan, "em-exigencia", "Sim") && "Atender à exigência legal ou de licença informada",
    is(plan, "go-validacao", "Sim") && "Validação jurídica ou de compliance",
    is(plan, "go-dados", "Sim") && "Avaliação de proteção de dados (LGPD)",
    answerText(plan, "se-norma") && `Conferir a norma citada: ${answerText(plan, "se-norma")}`,
  ]);
  const stop = is(plan, "en-parada", "Sim") || is(plan, "se-parada", "Sim");
  const technical = profile.area;

  const drafts: StepDraft[] = compact<StepDraft>([
    { key: "avaliacao", title: type === "capacitacao" ? "Planejamento do conteúdo" : type === "governanca" ? "Mapeamento do processo atual" : "Avaliação técnica do local", activity: profile.assessment, duration: "1 a 2 semanas", responsible: technical, after: [] },
    { key: "linha_base", title: "Registro da situação atual", activity: `Medir e registrar os indicadores antes da mudança${profile.indicators[0] ? ` (ex.: ${profile.indicators[0].name.toLowerCase()})` : ""}, para comparar depois.`, duration: "2 a 4 semanas, em paralelo", responsible: `${technical}, com o responsável pela iniciativa`, after: ["avaliacao"] },
    (external || supplierUnclear) && { key: "fornecedores", title: "Levantamento de fornecedores", activity: external ? "Identificar ao menos três fornecedores ou prestadores qualificados." : "Definir se a execução será interna ou contratada e, se contratada, levantar fornecedores.", duration: "1 a 2 semanas", responsible: "Compras / suprimentos", after: ["avaliacao"] },
    (purchase || external) && { key: "cotacao", title: "Cotação de materiais, equipamentos e serviços", activity: "Obter propostas com especificação, prazo de entrega e garantia, com base no levantamento técnico.", duration: "1 a 3 semanas", responsible: "Compras / suprimentos", after: ["fornecedores", "avaliacao"] },
    { key: "aprovacao", title: purchase || external ? "Aprovação do investimento" : "Aprovação do plano", activity: "Apresentar plano, custos e análise de retorno à gestão para decisão.", duration: "1 a 2 semanas", responsible: "Gestão da empresa", after: ["cotacao", "avaliacao"] },
    licensing.length > 0 && { key: "licencas", title: "Licenças, normas e validações", activity: `${licensing.join("; ")}.`, duration: "2 a 8 semanas (depende de órgãos externos)", responsible: "Meio ambiente / jurídico / compliance", after: ["aprovacao"] },
    purchase && { key: "aquisicao", title: "Aquisição", activity: "Emitir pedidos e acompanhar a entrega dos materiais e equipamentos.", duration: "2 a 6 semanas (prazo de entrega)", responsible: "Compras / suprimentos", after: ["aprovacao"] },
    infrastructure && { key: "infraestrutura", title: "Preparação da infraestrutura", activity: compact([fromAnswer(plan, "il-infra-ajuste")?.text, fromAnswer(plan, "so-reforco")?.text, fromAnswer(plan, "ar-hidraulica-qual")?.text, is(plan, "ar-reservatorio", "Sim") && "Instalar os reservatórios", is(plan, "re-coletores", "Sim") && "Preparar a área de armazenamento e os coletores"]).join("; ") || "Executar as adequações apontadas na avaliação técnica.", duration: "1 a 4 semanas", responsible: technical, after: ["aquisicao", "aprovacao"] },
    { key: "implementacao", title: "Implementação", activity: `${profile.implementation(plan)}${stop ? " Programar na janela de parada para não interromper a operação." : ""}`, duration: "1 a 4 semanas", responsible: external ? `${technical}, com o fornecedor contratado` : technical, after: ["infraestrutura", "aquisicao", "licencas", "aprovacao"] },
    profile.behavioral && { key: "comunicacao", title: "Comunicação e orientação das equipes", activity: "Explicar a mudança às pessoas envolvidas e combinar a nova rotina.", duration: "1 semana", responsible: "Recursos humanos / comunicação interna", after: ["implementacao"] },
    { key: "testes", title: "Testes e validação", activity: "Verificar se a solução funciona como previsto e corrigir ajustes.", duration: "1 a 2 semanas", responsible: technical, after: ["implementacao"] },
    { key: "monitoramento", title: "Monitoramento dos resultados", activity: "Acompanhar os indicadores e comparar com a situação registrada antes da mudança. Decidir sobre ampliação após o período.", duration: "3 a 6 meses", responsible: `${technical}, com o responsável pela iniciativa`, after: ["testes", "linha_base"] },
  ]);

  const orderOf = new Map(drafts.map((draft, index) => [draft.key, index + 1]));
  const steps: PlanStep[] = drafts.map(({ after, ...draft }, index) => {
    // Depende da primeira etapa de "after" que existe no plano; implementação e
    // monitoramento dependem de todas as que existem.
    const found = after.map((key) => orderOf.get(key)).filter((order): order is number => order !== undefined);
    const dependsOn = ["implementacao", "monitoramento"].includes(draft.key) ? found : found.slice(0, 1);
    return { ...draft, order: index + 1, dependsOn: dependsOn.length || index === 0 ? dependsOn : [index] };
  });

  const answerOr = (id: string) => fromAnswer(plan, id);
  const resources = [
    { label: "Materiais", items: compact([answerOr("g-materiais"), ...profile.materials.map(rule), fromAnswer(plan, "re-coletores-qtd", "Coletores: "), fromAnswer(plan, "ac-solucao")]) },
    { label: "Equipamentos e tecnologias", items: compact([...profile.equipment.map(rule), fromAnswer(plan, "go-sistema", "Sistema: "), is(plan, "en-medicao", "Não") && rule("Medidor de consumo para comparar antes e depois")]) },
    { label: "Mão de obra", items: compact([answerOr("g-pessoas"), fromAnswer(plan, "go-areas", "Áreas: "), fromAnswer(plan, "so2-voluntarios", "Colaboradores participantes: "), ...profile.labor.map(rule)]) },
    { label: "Serviços terceirizados", items: compact([answerOr("g-fornecedor-qual"), fromAnswer(plan, "il-instalacao", "Instalação: "), fromAnswer(plan, "so-instalacao", "Projeto e instalação: "), fromAnswer(plan, "ca-instrutor", "Instrutor: "), fromAnswer(plan, "so2-parceiros-quais", "Parceiros: ")]) },
    { label: "Infraestrutura", items: compact([fromAnswer(plan, "il-infra-ajuste"), fromAnswer(plan, "so-reforco"), fromAnswer(plan, "ar-hidraulica-qual"), fromAnswer(plan, "ar-reservatorio-cap", "Reservatórios (m³): "), fromAnswer(plan, "ar-tratamento-qual", "Tratamento: ")]) },
    { label: "Outros", items: compact([licensing.length > 0 && rule(`Validações: ${licensing.join("; ")}`)]) },
  ];

  const risks = compact<Sourced>([
    answerOr("g-riscos"),
    fromAnswer(plan, "so2-efeito"),
    is(plan, "il-infra", "Não") && rule("A infraestrutura elétrica atual precisa de adequação."),
    is(plan, "so-estrutura", "Não") && rule("A estrutura do telhado pode não suportar os painéis."),
    is(plan, "so-sombra", "Sim", "Em parte do dia") && rule("Sombreamento reduz a geração de energia."),
    is(plan, "ar-tratamento", "Sim") && rule("Água de reúso exige tratamento e controle de qualidade."),
    is(plan, "re-licenca", "Sim") && rule("Resíduo perigoso: destinação exige empresa licenciada."),
    stop && rule("A implantação exige parar a operação."),
    is(plan, "go-dados", "Sim") && rule("Envolve dados pessoais: atenção à LGPD."),
    profile.behavioral && rule("O resultado depende da adesão das pessoas à nova rotina."),
  ]);

  const pending = visibleQuestions(plan).flatMap((question) => {
    const answer = plan.answers[question.id];
    if (!answer) return [`Sem resposta: ${question.text}`];
    if (answer.status === "unknown") return [`${NOT_KNOWN}: ${question.text}`];
    if (answer.status === "to_evaluate") return [`${TO_EVALUATE}: ${question.text}`];
    return [];
  });

  const activities = steps.filter((step) => ["avaliacao", "implementacao", "comunicacao", "monitoramento"].includes(step.key)).map((step) => rule(step.activity));
  const areas = [...new Set(steps.map((step) => step.responsible))].map(rule);
  const deadline = answerText(plan, "g-prazo");

  return {
    identification: {
      name: input.title,
      pillar: pillarCode ? PILLAR_LABELS[pillarCode] : "A definir",
      initiativeType: INITIATIVE_TYPES[type].label,
      themes,
      description: input.originalText,
      objective: answerOr("g-objetivo") ?? fromAnswer(plan, "ar-finalidade", "Reaproveitar a água para: ") ?? fromAnswer(plan, "ca-tema", "Capacitar em: ") ?? fromAnswer(plan, "so2-acao"),
      problem: answerOr("g-problema") ?? fromAnswer(plan, "se-risco") ?? fromAnswer(plan, "go-falha") ?? fromAnswer(plan, "em-fonte"),
      location: answerOr("g-local") ?? fromAnswer(plan, "il-ambientes") ?? fromAnswer(plan, "ac-onde") ?? fromAnswer(plan, "se-setor") ?? fromAnswer(plan, "so-local"),
      scope: compact(
        visibleQuestions(plan)
          .filter((question) => question.item === "escopo")
          .map((question) => {
            const answer = fromAnswer(plan, question.id);
            return answer && { ...answer, text: `${question.text} ${answer.text}${question.unit ? ` ${question.unit}` : ""}` };
          }),
      ),
    },
    execution: {
      summary: `${profile.implementation(plan)} A execução segue ${steps.length} etapas, da avaliação ao monitoramento dos resultados.`,
      activities,
      areas,
    },
    steps,
    resources,
    results: {
      environmental: profile.environmental.map(rule),
      social: profile.social.map(rule),
      economic: profile.economic.map(rule),
      informed: answerOr("g-beneficios"),
      indicators: [
        ...(answerOr("g-indicadores") ? [{ name: answerOr("g-indicadores")?.text ?? "", how: "Sugerido por quem enviou a ideia.", source: "colaborador" as const }] : []),
        ...profile.indicators.map((indicator) => ({ ...indicator, source: "regra" as const })),
      ],
    },
    savings: estimateSavings(plan),
    risks,
    informedDeadline: deadline,
    pending,
    progress: planProgress(plan),
  };
}
