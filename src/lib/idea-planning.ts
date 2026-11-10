import { z } from "zod";
import { classifyText } from "./esg-classifier.ts";
import type { ProposalFieldKey, StoredProposal } from "./idea-proposal.ts";

/**
 * Perguntas de planejamento da ideia, por regras e sem IA generativa. O tipo de
 * iniciativa é identificado pelo texto e direciona perguntas específicas; algumas
 * só aparecem conforme respostas anteriores. Nada é preenchido por suposição:
 * respostas vazias ficam pendentes, e a pessoa pode marcar "Não sei informar" ou
 * "Precisa ser avaliado". As respostas ficam em `structured_proposal.plan`.
 */

export const NOT_KNOWN = "Não sei informar";
export const TO_EVALUATE = "Precisa ser avaliado";

// ---------------------------------------------------------------------------
// Etapas, itens mínimos e tipos de iniciativa

export const PLAN_STEPS = [
  { key: "ideia", label: "A ideia", description: "Problema, objetivo, local e alcance." },
  { key: "especificas", label: "Detalhes da iniciativa", description: "Perguntas específicas para este tipo de ideia." },
  { key: "execucao", label: "Execução", description: "Etapas, recursos, pessoas, fornecedores e prazo." },
  { key: "custos", label: "Custos e resultados", description: "Custos, benefícios, indicadores e riscos." },
] as const;

export type PlanStepKey = (typeof PLAN_STEPS)[number]["key"];

/** As 15 informações mínimas de qualquer iniciativa (a 1ª, descrição, é o texto original). */
export const MINIMUM_ITEMS = {
  descricao: "Descrição detalhada da ideia",
  problema: "Problema ou oportunidade",
  objetivo: "Objetivo esperado",
  local: "Local de implementação",
  escopo: "Escopo da iniciativa",
  etapas: "Etapas necessárias",
  materiais: "Materiais, equipamentos e tecnologias",
  pessoas: "Recursos humanos",
  fornecedores: "Fornecedores ou serviços terceirizados",
  prazo: "Prazo estimado",
  custoInicial: "Custos iniciais",
  custoRecorrente: "Custos recorrentes",
  beneficios: "Benefícios esperados",
  indicadores: "Indicadores de resultado",
  riscos: "Dificuldades, riscos e limitações",
} as const;

export type MinimumItem = keyof typeof MINIMUM_ITEMS;

export const INITIATIVE_TYPES = {
  iluminacao: { label: "Iluminação e sensores de presença", pillar: "E" },
  solar: { label: "Energia solar", pillar: "E" },
  energia: { label: "Consumo de energia de equipamentos", pillar: "E" },
  agua_reuso: { label: "Reaproveitamento de água", pillar: "E" },
  agua_consumo: { label: "Redução do consumo de água", pillar: "E" },
  residuos: { label: "Resíduos e reciclagem", pillar: "E" },
  emissoes: { label: "Emissões, combustíveis e poluição", pillar: "E" },
  seguranca: { label: "Saúde e segurança no trabalho", pillar: "S" },
  capacitacao: { label: "Capacitação e treinamento", pillar: "S" },
  social: { label: "Inclusão, comunidade e impacto social", pillar: "S" },
  governanca: { label: "Processos, controles e governança", pillar: "G" },
  geral: { label: "Outra iniciativa", pillar: null },
} as const satisfies Record<string, { label: string; pillar: "E" | "S" | "G" | null }>;

export type InitiativeType = keyof typeof INITIATIVE_TYPES;
export const INITIATIVE_TYPE_KEYS = Object.keys(INITIATIVE_TYPES) as InitiativeType[];

const fold = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();

/** Ordem importa: termos mais específicos primeiro (sensor de presença antes de energia). */
const TYPE_PATTERNS: [InitiativeType, RegExp][] = [
  // Treinar é a ação principal mesmo quando o tema é energia, água ou resíduos.
  ["capacitacao", /\b(treinamento|capacitac|curso|palestra|workshop|oficina|formacao)/],
  ["iluminacao", /\b(sensor(es)? de presenca|iluminac|lampada|luminaria|\bled\b|luz(es)? acesa)/],
  ["solar", /\b(solar|fotovolt|placas? solares?|paine(l|is) solar)/],
  ["agua_reuso", /\b(reaproveit|reus[oa]|reutiliz)\w*.{0,40}\bagua|\bagua.{0,40}\b(reaproveit|reus|reutiliz)|agua (da|de) chuva|cisterna|captac\w* de chuva/],
  ["agua_consumo", /\b(vazamento|torneira|arejador|desperdicio de agua|consumo de agua|economi\w* (de )?agua|hidrometro)/],
  ["residuos", /\b(residuo|recicl|coleta seletiva|compost|descarte|lixo|sucata|logistica reversa|papelao|plastico)/],
  ["emissoes", /\b(emiss|combustivel|diesel|gasolina|frota|carbono|fumaca|poluic|poluente)/],
  ["energia", /\b(energia|eletric|kwh|motor(es)?\b|ar[- ]condicionado|compressor|maquinas? ligadas?|temporizador|desligar)/],
  ["seguranca", /\b(seguranca|acidente|\bepi\b|ergonom|saude|lesao|risco de queda|sinalizac)/],
  ["social", /\b(comunidade|inclusao|acessibilidade|diversidade|voluntari|doac|escola|bem-estar|social)/],
  ["governanca", /\b(procedimento|compliance|etica|transparencia|controle interno|auditoria|fornecedor|compras?|politica|relatorio|dados)/],
];

const TYPE_BY_SUBCATEGORY: Record<string, InitiativeType> = {
  E1: "energia",
  E2: "agua_consumo",
  E3: "residuos",
  E4: "emissoes",
  S1: "seguranca",
  S2: "capacitacao",
  S3: "social",
  S4: "social",
  G1: "governanca",
  G2: "governanca",
  G3: "governanca",
  G4: "governanca",
};

/** Tipo de iniciativa pelo texto; sem termo reconhecido, usa o tema ESG classificado. */
export function detectInitiativeType(text: string): InitiativeType {
  const folded = fold(text);
  const byPattern = TYPE_PATTERNS.find(([, pattern]) => pattern.test(folded));
  if (byPattern) return byPattern[0];
  const subcategory = classifyText(text).subcategories[0];
  return (subcategory && TYPE_BY_SUBCATEGORY[subcategory]) || "geral";
}

// ---------------------------------------------------------------------------
// Perguntas

export type PlanQuestion = {
  id: string;
  step: PlanStepKey;
  text: string;
  hint?: string;
  kind: "text" | "number" | "choice";
  unit?: string;
  options?: string[];
  /** Item mínimo coberto; a pergunta geral do mesmo item é omitida quando a específica existe. */
  item: MinimumItem;
  /** Só aparece quando a resposta de outra pergunta é uma destas opções. */
  showIf?: { question: string; anyOf: string[] };
  /** Campo da proposta usado como resposta inicial (texto da própria pessoa). */
  prefillFrom?: ProposalFieldKey;
};

const YES_NO = ["Sim", "Não"];
const WHO_INSTALLS = ["Equipe interna", "Empresa especializada", "As duas"];

const GENERAL: PlanQuestion[] = [
  { id: "g-problema", step: "ideia", item: "problema", kind: "text", prefillFrom: "problem", text: "Qual problema ou oportunidade a ideia resolve?", hint: "O que acontece hoje e por que isso importa." },
  { id: "g-objetivo", step: "ideia", item: "objetivo", kind: "text", text: "Qual é o objetivo esperado?", hint: "Ex.: reduzir o consumo, evitar acidentes, cumprir uma exigência." },
  { id: "g-local", step: "ideia", item: "local", kind: "text", text: "Onde a iniciativa seria implantada?", hint: "Unidade, prédio, setor ou processo." },
  { id: "g-escopo", step: "ideia", item: "escopo", kind: "text", text: "Qual seria o alcance da iniciativa?", hint: "Quantos locais, pessoas, equipamentos ou processos. Começaria por um piloto?" },
  { id: "g-etapas", step: "execucao", item: "etapas", kind: "text", text: "Você já sabe de alguma etapa necessária para executar a ideia?", hint: "Ex.: vistoria, compra, instalação, treinamento. Pode deixar em branco." },
  { id: "g-materiais", step: "execucao", item: "materiais", kind: "text", text: "Quais materiais, equipamentos ou tecnologias seriam necessários?" },
  { id: "g-pessoas", step: "execucao", item: "pessoas", kind: "text", text: "Quais pessoas ou áreas precisariam participar?", hint: "Ex.: manutenção, compras, segurança do trabalho, TI." },
  { id: "g-fornecedor", step: "execucao", item: "fornecedores", kind: "choice", options: YES_NO, text: "Será preciso contratar fornecedores ou serviços de terceiros?" },
  { id: "g-fornecedor-qual", step: "execucao", item: "fornecedores", kind: "text", showIf: { question: "g-fornecedor", anyOf: ["Sim"] }, text: "Quais serviços ou fornecedores?", hint: "Não cite pessoas. Pode ser só o tipo de serviço." },
  { id: "g-prazo", step: "execucao", item: "prazo", kind: "choice", options: ["Até 1 mês", "De 1 a 3 meses", "De 3 a 6 meses", "De 6 a 12 meses", "Mais de 12 meses"], text: "Em quanto tempo você imagina que daria para implantar?" },
  { id: "g-custo-inicial", step: "custos", item: "custoInicial", kind: "number", unit: "R$", text: "Existe uma estimativa de investimento inicial?", hint: "Valor aproximado, se souber. Não precisa ser exato." },
  { id: "g-custo-base", step: "custos", item: "custoInicial", kind: "text", showIf: { question: "g-custo-inicial", anyOf: ["__number__"] }, text: "De onde vem esse valor?", hint: "Ex.: orçamento recebido, compra parecida, pesquisa na internet, estimativa própria." },
  { id: "g-custo-recorrente", step: "custos", item: "custoRecorrente", kind: "number", unit: "R$ por mês", text: "Haveria custos mensais de operação ou manutenção?", hint: "Ex.: manutenção, assinatura, insumos, coleta. Informe 0 se não houver." },
  { id: "g-beneficios", step: "custos", item: "beneficios", kind: "text", prefillFrom: "expectedBenefits", text: "Quais benefícios você espera?", hint: "Ambientais, sociais e econômicos. Não invente números." },
  { id: "g-indicadores", step: "custos", item: "indicadores", kind: "text", prefillFrom: "indicators", text: "Como saberíamos que funcionou?", hint: "O que medir antes e depois." },
  { id: "g-riscos", step: "custos", item: "riscos", kind: "text", prefillFrom: "resourcesAndRisks", text: "Quais dificuldades, riscos ou limitações você enxerga?" },
];

const SPECIFIC: Record<InitiativeType, PlanQuestion[]> = {
  iluminacao: [
    { id: "il-ambientes", step: "especificas", item: "local", kind: "text", text: "Em quais ambientes os sensores ou a nova iluminação seriam instalados?" },
    { id: "il-pontos", step: "especificas", item: "escopo", kind: "number", unit: "ambientes ou pontos", text: "Quantos ambientes ou pontos de iluminação seriam contemplados?" },
    { id: "il-luminarias", step: "especificas", item: "escopo", kind: "number", unit: "luminárias", text: "Quantas luminárias existem nesses ambientes?" },
    { id: "il-tipo", step: "especificas", item: "materiais", kind: "choice", options: ["LED", "Fluorescente", "Incandescente ou halógena", "Mista"], text: "Qual o tipo de iluminação usada hoje?" },
    { id: "il-potencia", step: "especificas", item: "escopo", kind: "number", unit: "W por luminária", text: "Qual a potência média de cada luminária?", hint: "Costuma estar escrita na lâmpada ou na luminária." },
    { id: "il-ociosas", step: "especificas", item: "problema", kind: "choice", options: ["Sim, com frequência", "Às vezes", "Raramente"], text: "As luzes ficam ligadas em períodos sem ninguém no ambiente?" },
    { id: "il-horas-ociosas", step: "especificas", item: "beneficios", kind: "number", unit: "horas por dia", showIf: { question: "il-ociosas", anyOf: ["Sim, com frequência", "Às vezes"] }, text: "Quantas horas por dia, em média, ficam ligadas sem ninguém?" },
    { id: "il-horas", step: "especificas", item: "escopo", kind: "number", unit: "horas por dia", text: "Qual o tempo médio diário de funcionamento da iluminação?" },
    { id: "il-infra", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Já existe infraestrutura elétrica compatível com a instalação?" },
    { id: "il-infra-ajuste", step: "especificas", item: "materiais", kind: "text", showIf: { question: "il-infra", anyOf: ["Não"] }, text: "O que precisaria ser adequado na parte elétrica?" },
    { id: "il-instalacao", step: "especificas", item: "fornecedores", kind: "choice", options: WHO_INSTALLS, text: "Quem faria a instalação?" },
    { id: "il-tarifa", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por kWh", text: "Você sabe o valor pago por kWh de energia?", hint: "Aparece na conta de energia. Se não souber, a gestão pode completar." },
  ],
  solar: [
    { id: "so-local", step: "especificas", item: "local", kind: "choice", options: ["Telhado", "Solo", "Estacionamento (cobertura)", "Outro"], text: "Onde os painéis seriam instalados?" },
    { id: "so-area", step: "especificas", item: "escopo", kind: "number", unit: "m²", text: "Qual a área disponível, aproximadamente?" },
    { id: "so-consumo", step: "especificas", item: "escopo", kind: "number", unit: "kWh por mês", text: "Qual o consumo mensal de energia da unidade?" },
    { id: "so-conta", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por mês", text: "Qual o valor médio da conta de energia?" },
    { id: "so-estrutura", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, showIf: { question: "so-local", anyOf: ["Telhado"] }, text: "O telhado suporta o peso dos painéis?" },
    { id: "so-reforco", step: "especificas", item: "materiais", kind: "text", showIf: { question: "so-estrutura", anyOf: ["Não"] }, text: "Que reforço ou adequação seria necessário?" },
    { id: "so-sombra", step: "especificas", item: "riscos", kind: "choice", options: ["Sim", "Não", "Em parte do dia"], text: "Há sombra de prédios ou árvores sobre a área?" },
    { id: "so-instalacao", step: "especificas", item: "fornecedores", kind: "choice", options: WHO_INSTALLS, text: "Quem faria o projeto e a instalação?" },
  ],
  energia: [
    { id: "en-equipamentos", step: "especificas", item: "escopo", kind: "text", text: "Quais equipamentos ou sistemas estão envolvidos?" },
    { id: "en-quantidade", step: "especificas", item: "escopo", kind: "number", unit: "equipamentos", text: "Quantos equipamentos seriam contemplados?" },
    { id: "en-potencia", step: "especificas", item: "escopo", kind: "number", unit: "kW por equipamento", text: "Qual a potência média de cada equipamento?", hint: "Costuma estar na placa do equipamento." },
    { id: "en-ocioso", step: "especificas", item: "beneficios", kind: "number", unit: "horas por dia", text: "Quantas horas por dia ficam ligados sem necessidade?" },
    { id: "en-medicao", step: "especificas", item: "indicadores", kind: "choice", options: YES_NO, text: "Existe medição do consumo desses equipamentos?" },
    { id: "en-solucao", step: "especificas", item: "materiais", kind: "choice", options: ["Desligamento por rotina", "Temporizador ou automação", "Troca por equipamento mais eficiente", "Manutenção ou ajuste", "Outra"], text: "Qual seria a principal solução?" },
    { id: "en-parada", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "A implantação exigiria parar a produção ou a operação?" },
    { id: "en-parada-janela", step: "especificas", item: "prazo", kind: "text", showIf: { question: "en-parada", anyOf: ["Sim"] }, text: "Existe uma janela de parada possível (feriado, manutenção programada)?" },
    { id: "en-tarifa", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por kWh", text: "Você sabe o valor pago por kWh de energia?" },
  ],
  agua_reuso: [
    { id: "ar-origem", step: "especificas", item: "escopo", kind: "choice", options: ["Água da chuva", "Ar-condicionado", "Lavagem ou processo", "Efluente tratado", "Outra"], text: "Qual é a origem da água que seria reaproveitada?" },
    { id: "ar-finalidade", step: "especificas", item: "objetivo", kind: "choice", options: ["Descargas sanitárias", "Limpeza de pisos ou pátios", "Irrigação", "Processo industrial", "Outra"], text: "Qual seria a finalidade do reaproveitamento?" },
    { id: "ar-volume", step: "especificas", item: "escopo", kind: "number", unit: "m³ por mês", text: "Qual o volume disponível, aproximadamente?" },
    { id: "ar-reservatorio", step: "especificas", item: "materiais", kind: "choice", options: YES_NO, text: "Seria preciso instalar reservatórios?" },
    { id: "ar-reservatorio-cap", step: "especificas", item: "materiais", kind: "number", unit: "m³", showIf: { question: "ar-reservatorio", anyOf: ["Sim"] }, text: "Qual a capacidade estimada dos reservatórios?" },
    { id: "ar-hidraulica", step: "especificas", item: "materiais", kind: "choice", options: YES_NO, text: "Seria necessária adequação hidráulica (tubulação, bombas)?" },
    { id: "ar-hidraulica-qual", step: "especificas", item: "materiais", kind: "text", showIf: { question: "ar-hidraulica", anyOf: ["Sim"] }, text: "Que adequação seria necessária?" },
    { id: "ar-tratamento", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "A água precisaria de tratamento antes do uso?" },
    { id: "ar-tratamento-qual", step: "especificas", item: "materiais", kind: "text", showIf: { question: "ar-tratamento", anyOf: ["Sim"] }, text: "Que tipo de tratamento (filtro, cloração, outro)?" },
    { id: "ar-reducao", step: "especificas", item: "beneficios", kind: "number", unit: "m³ por mês", text: "Quanto do consumo atual de água poderia ser reduzido?" },
    { id: "ar-tarifa", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por m³", text: "Você sabe o valor pago por m³ de água?" },
  ],
  agua_consumo: [
    { id: "ac-onde", step: "especificas", item: "local", kind: "text", text: "Onde ocorre o desperdício ou o consumo alto?" },
    { id: "ac-causa", step: "especificas", item: "problema", kind: "choice", options: ["Vazamento", "Torneiras ou descargas", "Lavagem", "Processo industrial", "Outra"], text: "Qual a principal causa?" },
    { id: "ac-pontos", step: "especificas", item: "escopo", kind: "number", unit: "pontos de uso", text: "Quantos pontos de uso seriam contemplados?" },
    { id: "ac-consumo", step: "especificas", item: "escopo", kind: "number", unit: "m³ por mês", text: "Qual o consumo atual de água, aproximadamente?" },
    { id: "ac-solucao", step: "especificas", item: "materiais", kind: "text", text: "O que seria instalado ou mudado (arejadores, válvulas, reparos, rotina)?" },
    { id: "ac-reducao", step: "especificas", item: "beneficios", kind: "number", unit: "m³ por mês", text: "Quanto você estima que daria para economizar?" },
    { id: "ac-tarifa", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por m³", text: "Você sabe o valor pago por m³ de água?" },
  ],
  residuos: [
    { id: "re-tipo", step: "especificas", item: "escopo", kind: "text", text: "Qual resíduo ou material está envolvido?" },
    { id: "re-quantidade", step: "especificas", item: "escopo", kind: "number", unit: "kg por mês", text: "Qual a quantidade gerada, aproximadamente?" },
    { id: "re-destino-atual", step: "especificas", item: "problema", kind: "choice", options: ["Aterro ou lixo comum", "Coleta de empresa contratada", "Reciclagem parcial", "Armazenado sem destino"], text: "Para onde esse resíduo vai hoje?" },
    { id: "re-destino-novo", step: "especificas", item: "objetivo", kind: "choice", options: ["Reciclagem", "Compostagem", "Reutilização interna", "Logística reversa com fornecedor", "Outro"], text: "Qual seria o novo destino?" },
    { id: "re-coletores", step: "especificas", item: "materiais", kind: "choice", options: YES_NO, text: "Seriam necessários coletores, baias ou área de armazenamento?" },
    { id: "re-coletores-qtd", step: "especificas", item: "materiais", kind: "text", showIf: { question: "re-coletores", anyOf: ["Sim"] }, text: "Quantos e de que tipo?" },
    { id: "re-receptor", step: "especificas", item: "fornecedores", kind: "choice", options: YES_NO, text: "Já existe cooperativa ou empresa que receberia o material?" },
    { id: "re-custo-atual", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por mês", text: "Quanto se gasta hoje com o descarte?" },
    { id: "re-receita", step: "especificas", item: "beneficios", kind: "choice", options: ["Sim", "Não", "Talvez"], text: "O material poderia ser vendido?" },
    { id: "re-licenca", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "É um resíduo perigoso ou que exige licença ambiental?" },
  ],
  emissoes: [
    { id: "em-fonte", step: "especificas", item: "problema", kind: "text", text: "Qual a fonte da emissão ou da poluição?" },
    { id: "em-consumo", step: "especificas", item: "escopo", kind: "text", text: "Qual o consumo atual de combustível ou insumo (quantidade por mês)?" },
    { id: "em-solucao", step: "especificas", item: "materiais", kind: "choice", options: ["Troca de combustível", "Manutenção ou regulagem", "Filtros ou controle", "Troca de veículo ou equipamento", "Mudança de rotina ou roteiro", "Outra"], text: "Qual seria a principal solução?" },
    { id: "em-monitoramento", step: "especificas", item: "indicadores", kind: "choice", options: YES_NO, text: "Existe medição ou monitoramento dessa emissão?" },
    { id: "em-exigencia", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Há exigência legal ou de licença relacionada?" },
  ],
  seguranca: [
    { id: "se-risco", step: "especificas", item: "problema", kind: "text", text: "Qual risco você deseja reduzir?" },
    { id: "se-setor", step: "especificas", item: "local", kind: "text", text: "Em qual setor ou atividade?" },
    { id: "se-expostos", step: "especificas", item: "escopo", kind: "number", unit: "pessoas", text: "Quantas pessoas ficam expostas a esse risco?" },
    { id: "se-ocorrencias", step: "especificas", item: "indicadores", kind: "number", unit: "ocorrências em 12 meses", text: "Quantas ocorrências foram registradas no último ano?" },
    { id: "se-medida", step: "especificas", item: "materiais", kind: "choice", options: ["EPI", "Proteção coletiva", "Sinalização", "Treinamento", "Adequação ergonômica", "Mudança de procedimento"], text: "Qual seria a principal medida?" },
    { id: "se-parada", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "A implantação exigiria parar a atividade?" },
    { id: "se-norma", step: "especificas", item: "riscos", kind: "text", text: "Há norma regulamentadora ou exigência legal relacionada?", hint: "Ex.: NR-6, NR-12, NR-17. Se não souber, deixe em branco." },
  ],
  capacitacao: [
    { id: "ca-publico", step: "especificas", item: "escopo", kind: "text", text: "Quem participaria?" },
    { id: "ca-participantes", step: "especificas", item: "escopo", kind: "number", unit: "pessoas", text: "Quantas pessoas participariam?" },
    { id: "ca-tema", step: "especificas", item: "objetivo", kind: "text", text: "O que as pessoas precisam aprender?" },
    { id: "ca-formato", step: "especificas", item: "materiais", kind: "choice", options: ["Presencial", "Online", "Híbrido"], text: "Qual formato?" },
    { id: "ca-carga", step: "especificas", item: "prazo", kind: "number", unit: "horas", text: "Qual a carga horária por pessoa?" },
    { id: "ca-instrutor", step: "especificas", item: "fornecedores", kind: "choice", options: ["Interno", "Externo", "Ainda não definido"], text: "Quem daria o treinamento?" },
    { id: "ca-avaliacao", step: "especificas", item: "indicadores", kind: "text", text: "Como saber se o aprendizado funcionou?" },
  ],
  social: [
    { id: "so2-publico", step: "especificas", item: "escopo", kind: "text", text: "Qual grupo ou comunidade seria beneficiado?" },
    { id: "so2-pessoas", step: "especificas", item: "escopo", kind: "number", unit: "pessoas", text: "Quantas pessoas seriam beneficiadas, aproximadamente?" },
    { id: "so2-acao", step: "especificas", item: "objetivo", kind: "text", text: "Que ação seria realizada?" },
    { id: "so2-frequencia", step: "especificas", item: "prazo", kind: "choice", options: ["Ação pontual", "Recorrente"], text: "É uma ação pontual ou recorrente?" },
    { id: "so2-parceiros", step: "especificas", item: "fornecedores", kind: "choice", options: YES_NO, text: "Haveria parceiros externos (ONG, escola, prefeitura)?" },
    { id: "so2-parceiros-quais", step: "especificas", item: "fornecedores", kind: "text", showIf: { question: "so2-parceiros", anyOf: ["Sim"] }, text: "Que tipo de parceiro?" },
    { id: "so2-voluntarios", step: "especificas", item: "pessoas", kind: "number", unit: "pessoas", text: "Quantos colaboradores precisariam participar?" },
    { id: "so2-efeito", step: "especificas", item: "riscos", kind: "text", text: "Pode haver algum efeito negativo a considerar?" },
  ],
  governanca: [
    { id: "go-processo", step: "especificas", item: "escopo", kind: "text", text: "Qual processo seria fortalecido? Não cite nomes." },
    { id: "go-falha", step: "especificas", item: "problema", kind: "text", text: "Que falha ou risco existe hoje?" },
    { id: "go-mudanca", step: "especificas", item: "objetivo", kind: "choice", options: ["Novo procedimento", "Controle ou aprovação", "Sistema ou software", "Critério de compra", "Canal de comunicação", "Outra"], text: "O que mudaria?" },
    { id: "go-sistema", step: "especificas", item: "materiais", kind: "text", showIf: { question: "go-mudanca", anyOf: ["Sistema ou software"] }, text: "Já existe um sistema que poderia ser usado, ou seria preciso contratar?" },
    { id: "go-areas", step: "especificas", item: "pessoas", kind: "text", text: "Quais áreas seriam envolvidas?" },
    { id: "go-validacao", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Precisaria de validação jurídica ou de compliance?" },
    { id: "go-dados", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Envolve dados pessoais?" },
  ],
  geral: [
    { id: "ge-envolvido", step: "especificas", item: "escopo", kind: "text", text: "O que está envolvido (equipamentos, materiais, processos ou pessoas)?" },
    { id: "ge-quantidade", step: "especificas", item: "escopo", kind: "text", text: "Em que quantidade ou dimensão?" },
    { id: "ge-situacao", step: "especificas", item: "indicadores", kind: "text", text: "Você conhece algum número da situação atual (consumo, ocorrências, custo)?" },
  ],
};

const ALL_QUESTIONS = [...GENERAL, ...Object.values(SPECIFIC).flat()];

export function findPlanQuestion(id: string) {
  return ALL_QUESTIONS.find((question) => question.id === id) ?? null;
}

/** Itens mínimos cobertos pelas perguntas específicas do tipo (exceto as condicionais). */
function itemsCoveredBy(type: InitiativeType) {
  return new Set(SPECIFIC[type].filter((question) => !question.showIf).map((question) => question.item));
}

/** Perguntas gerais já cobertas por uma específica do tipo saem, para não repetir. */
const REPLACEABLE_GENERAL: MinimumItem[] = ["local", "escopo"];
/** Perguntas de "quem executa": com elas, a pergunta geral de terceiros vira detalhe condicional. */
const WHO_EXECUTES_QUESTIONS = ["il-instalacao", "so-instalacao", "ca-instrutor"];

export function questionsFor(type: InitiativeType): PlanQuestion[] {
  const covered = itemsCoveredBy(type);
  const general = GENERAL.filter((question) => !(REPLACEABLE_GENERAL.includes(question.item) && covered.has(question.item)));
  // Quando o tipo pergunta quem instala, a pergunta geral de fornecedores vira condicional a ela.
  const installQuestion = SPECIFIC[type].find((question) => WHO_EXECUTES_QUESTIONS.includes(question.id));
  const adjusted = general.flatMap((question): PlanQuestion[] => {
    if (!installQuestion) return [question];
    if (question.id === "g-fornecedor") return [];
    if (question.id === "g-fornecedor-qual") {
      const external = installQuestion.options?.filter((option) => /especializada|externo|as duas/i.test(option)) ?? [];
      return [{ ...question, showIf: { question: installQuestion.id, anyOf: external } }];
    }
    return [question];
  });
  return [...adjusted, ...SPECIFIC[type]];
}

// ---------------------------------------------------------------------------
// Respostas e armazenamento

export const ANSWER_STATUSES = ["answered", "unknown", "to_evaluate"] as const;
export type AnswerStatus = (typeof ANSWER_STATUSES)[number];

const answerSchema = z.object({
  value: z.string().nullable(),
  status: z.enum(ANSWER_STATUSES),
  by: z.enum(["collaborator", "management"]),
  updatedAt: z.string(),
});
export type PlanAnswer = z.infer<typeof answerSchema>;

export const REFERENCE_CATEGORIES = {
  preco_equipamento: "Preço de equipamento",
  preco_material: "Preço de material",
  instalacao: "Custo de instalação",
  mao_de_obra: "Custo de mão de obra",
  manutencao: "Custo de manutenção",
  servico: "Serviço especializado",
  fornecedor: "Fornecedor ou solução",
  caso: "Projeto semelhante ou estudo de caso",
  economia: "Economia potencial",
  roi: "Indicador de retorno (ROI ou payback)",
  outro: "Outro",
} as const;
export type ReferenceCategory = keyof typeof REFERENCE_CATEGORIES;
const referenceCategoryKeys = Object.keys(REFERENCE_CATEGORIES) as [ReferenceCategory, ...ReferenceCategory[]];

const referenceSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
  category: z.enum(referenceCategoryKeys),
  summary: z.string().nullable(),
  value: z.string().nullable(),
  publishedAt: z.string().nullable(),
  consultedAt: z.string(),
  origin: z.enum(["web_search", "management"]),
});
export type PlanReference = z.infer<typeof referenceSchema>;

export const VALUE_ORIGINS = {
  informado: "Informado pelo colaborador",
  pesquisa: "Encontrado em fonte pesquisada",
  estimado: "Estimado pela gestão",
  cotacao: "Precisa de cotação",
} as const;
export type ValueOrigin = keyof typeof VALUE_ORIGINS;
const valueOriginKeys = Object.keys(VALUE_ORIGINS) as [ValueOrigin, ...ValueOrigin[]];

const moneyLineSchema = z.object({
  label: z.string(),
  amount: z.number().nullable(),
  origin: z.enum(valueOriginKeys),
  referenceId: z.string().nullable(),
});
export type MoneyLine = z.infer<typeof moneyLineSchema>;

const benefitLineSchema = z.object({
  label: z.string(),
  conservative: z.number().nullable(),
  likely: z.number().nullable(),
  optimistic: z.number().nullable(),
  origin: z.enum(valueOriginKeys),
  referenceId: z.string().nullable(),
  basis: z.string().nullable(),
});
export type BenefitLine = z.infer<typeof benefitLineSchema>;

const financeSchema = z.object({
  periodYears: z.number().nullable(),
  investment: z.array(moneyLineSchema),
  /** Valores anuais. */
  recurring: z.array(moneyLineSchema),
  /** Economia ou receita anual, por cenário. */
  benefits: z.array(benefitLineSchema),
  nonFinancialBenefits: z.string().nullable(),
  assumptions: z.string().nullable(),
  updatedAt: z.string(),
});
export type FinanceInput = z.infer<typeof financeSchema>;

const researchSchema = z.object({
  runs: z.number(),
  lastRunAt: z.string().nullable(),
  model: z.string().nullable(),
  references: z.array(referenceSchema),
  /** Informações que a pesquisa indicou como faltantes. Texto de IA, a validar. */
  gaps: z.array(z.string()),
  notes: z.string().nullable(),
});
export type ResearchData = z.infer<typeof researchSchema>;

export const planSchema = z.object({
  version: z.literal(1),
  initiativeType: z.enum(INITIATIVE_TYPE_KEYS as [InitiativeType, ...InitiativeType[]]),
  answers: z.record(z.string(), answerSchema),
  /** Último texto escrito em cada campo da proposta a partir das respostas (para não sobrescrever edições). */
  synced: z.record(z.string(), z.string()),
  finance: financeSchema.nullable(),
  research: researchSchema.nullable(),
  updatedAt: z.string(),
});
export type IdeaPlan = z.infer<typeof planSchema>;

export function parsePlan(value: unknown): IdeaPlan | null {
  const parsed = planSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function emptyPlan(type: InitiativeType, now = new Date()): IdeaPlan {
  return { version: 1, initiativeType: type, answers: {}, synced: {}, finance: null, research: null, updatedAt: now.toISOString() };
}

export const MAX_ANSWER_LENGTH = 1500;

/** Pesquisas automáticas na internet por ideia, para conter o custo da IA. */
export const MAX_RESEARCH_RUNS = 5;

/** Número em formato brasileiro ("1.234,5") ou internacional ("1234.5"); `null` se não for número. */
export function parseNumber(raw: string): number | null {
  const text = raw.trim().replace(/^r\$\s*/i, "").replace(/\s/g, "");
  if (!text) return null;
  // "8.000" e "1.234.567" são milhares no padrão brasileiro.
  if (/^-?\d{1,3}(\.\d{3})+$/.test(text)) return Number(text.replace(/\./g, ""));
  const normalized = /,\d{1,2}$/.test(text) || (text.includes(",") && !text.includes("."))
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function numberAnswer(plan: IdeaPlan | null, id: string): number | null {
  const answer = plan?.answers[id];
  return answer?.status === "answered" && answer.value ? parseNumber(answer.value) : null;
}

export function answerText(plan: IdeaPlan | null, id: string): string | null {
  const answer = plan?.answers[id];
  return answer?.status === "answered" ? answer.value : null;
}

/** Pergunta visível: sem condição, ou com a condição atendida pelas respostas salvas. */
export function isVisible(question: PlanQuestion, answers: Record<string, PlanAnswer>) {
  if (!question.showIf) return true;
  const answer = answers[question.showIf.question];
  if (!answer || answer.status !== "answered" || !answer.value) return false;
  if (question.showIf.anyOf.includes("__number__")) return (parseNumber(answer.value) ?? 0) > 0;
  return question.showIf.anyOf.includes(answer.value);
}

export function visibleQuestions(plan: IdeaPlan, step?: PlanStepKey) {
  return questionsFor(plan.initiativeType).filter(
    (question) => (!step || question.step === step) && isVisible(question, plan.answers),
  );
}

/**
 * Lê as respostas de um formulário: `answer:<id>` (valor) e `status:<id>`
 * ("unknown" ou "to_evaluate"). Só altera as perguntas presentes no formulário.
 */
export function applyAnswerForm(
  plan: IdeaPlan,
  formData: FormData,
  by: PlanAnswer["by"],
  now = new Date(),
): { plan: IdeaPlan; errors: string[] } {
  const answers = { ...plan.answers };
  const errors: string[] = [];
  const shown = String(formData.get("shown") ?? "").split(",").filter(Boolean);
  for (const id of shown) {
    const question = findPlanQuestion(id);
    if (!question) continue;
    const raw = String(formData.get(`answer:${id}`) ?? "").trim().slice(0, MAX_ANSWER_LENGTH);
    const marked = String(formData.get(`status:${id}`) ?? "");
    const previous = answers[id];
    const at = now.toISOString();
    if (raw === NOT_KNOWN || marked === "unknown") {
      answers[id] = { value: null, status: "unknown", by, updatedAt: at };
    } else if (raw === TO_EVALUATE || marked === "to_evaluate") {
      answers[id] = { value: null, status: "to_evaluate", by, updatedAt: at };
    } else if (raw) {
      if (question.kind === "number" && parseNumber(raw) === null) {
        errors.push(`"${question.text}" precisa ser um número (ou marque "${NOT_KNOWN}").`);
        continue;
      }
      if (question.kind === "choice" && question.options && !question.options.includes(raw)) continue;
      const changed = previous?.value !== raw || previous.status !== "answered";
      answers[id] = changed ? { value: raw, status: "answered", by, updatedAt: at } : previous;
    } else if (previous) {
      delete answers[id];
    }
  }
  return { plan: { ...plan, answers, updatedAt: now.toISOString() }, errors };
}

export type PlanProgress = { total: number; handled: number; answered: number; percent: number };

/** "Tratada" = respondida ou marcada como não sei/precisa avaliar. */
export function planProgress(plan: IdeaPlan, step?: PlanStepKey): PlanProgress {
  const questions = visibleQuestions(plan, step);
  const handled = questions.filter((question) => plan.answers[question.id]).length;
  const answered = questions.filter((question) => plan.answers[question.id]?.status === "answered").length;
  return { total: questions.length, handled, answered, percent: questions.length ? Math.round((handled / questions.length) * 100) : 0 };
}

const STATUS_LABEL: Record<AnswerStatus, string> = { answered: "Respondida", unknown: NOT_KNOWN, to_evaluate: TO_EVALUATE };
export const answerStatusLabel = (status: AnswerStatus) => STATUS_LABEL[status];

/** Respostas como texto corrido, para o motor local e a avaliação por IA. */
export function planAnswersText(plan: IdeaPlan | null): string {
  if (!plan) return "";
  return visibleQuestions(plan)
    .flatMap((question) => {
      const answer = plan.answers[question.id];
      return answer?.status === "answered" && answer.value ? [`${question.text} ${answer.value}${question.unit ? ` ${question.unit}` : ""}`] : [];
    })
    .join("\n");
}

// ---------------------------------------------------------------------------
// Sincronização com a proposta (só para o autor, antes do envio)

const SYNC_SOURCES: Partial<Record<ProposalFieldKey, string[]>> = {
  problem: ["g-problema"],
  context: ["g-local", "g-escopo", "il-ambientes", "so-local", "en-equipamentos", "ar-origem", "ac-onde", "re-tipo", "em-fonte", "se-setor", "ca-publico", "so2-publico", "go-processo", "ge-envolvido"],
  expectedBenefits: ["g-objetivo", "g-beneficios"],
  indicators: ["g-indicadores"],
  resourcesAndRisks: ["g-materiais", "g-pessoas", "g-fornecedor-qual", "g-riscos"],
};

/**
 * Preenche campos da proposta com as respostas da própria pessoa. Um campo só é
 * escrito se estiver vazio ou ainda igual ao último texto gerado daqui: edições
 * feitas na revisão nunca são sobrescritas.
 */
export function syncProposalFromPlan(proposal: StoredProposal, plan: IdeaPlan): { proposal: StoredProposal; plan: IdeaPlan } {
  const next = { ...proposal };
  const synced = { ...plan.synced };
  for (const [field, ids] of Object.entries(SYNC_SOURCES) as [ProposalFieldKey, string[]][]) {
    const lines = ids.flatMap((id) => {
      const question = findPlanQuestion(id);
      const answer = plan.answers[id];
      if (!question || answer?.status !== "answered" || !answer.value) return [];
      // O problema vai como texto puro; os demais, com a pergunta para dar contexto.
      return [field === "problem" ? answer.value : `${question.text} ${answer.value}`];
    });
    if (!lines.length) continue;
    const text = lines.join("\n").slice(0, 4000);
    const current = next[field];
    if (!current || current === synced[field]) {
      next[field] = text;
      synced[field] = text;
    }
  }
  return { proposal: next, plan: { ...plan, synced } };
}
