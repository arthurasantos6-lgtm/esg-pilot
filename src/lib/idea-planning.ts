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
  /** choice: uma opção; multi: várias opções marcáveis. */
  kind: "text" | "number" | "choice" | "multi";
  unit?: string;
  options?: string[];
  /** Item mínimo coberto; a pergunta geral do mesmo item é omitida quando a específica existe. */
  item: MinimumItem;
  /** Só aparece quando a resposta de outra pergunta inclui uma destas opções. */
  showIf?: { question: string; anyOf: string[] };
  /** Campo da proposta usado como resposta inicial (texto da própria pessoa). */
  prefillFrom?: ProposalFieldKey;
};

/** Separador das opções marcadas em perguntas de várias escolhas. */
export const MULTI_SEPARATOR = "; ";

const YES_NO = ["Sim", "Não"];
const WHO_INSTALLS = ["Eletricista ou equipe da empresa", "Empresa contratada", "Os dois"];
const TARIFF_HINT = "Se não souber, marque \"Não sei informar\": o sistema pesquisa uma referência de preço.";

const GENERAL: PlanQuestion[] = [
  { id: "g-problema", step: "ideia", item: "problema", kind: "text", prefillFrom: "problem", text: "O que acontece hoje que precisa mudar?", hint: "Uma ou duas frases. Ex.: as luzes do corredor ficam acesas a noite toda." },
  { id: "g-objetivo", step: "ideia", item: "objetivo", kind: "multi", options: ["Reduzir custos", "Reduzir consumo de energia", "Reduzir consumo de água", "Reduzir resíduos ou poluição", "Aumentar a segurança das pessoas", "Capacitar as equipes", "Melhorar processos ou controles", "Beneficiar a comunidade"], text: "Que resultado você espera? Marque todos que se aplicam." },
  { id: "g-local", step: "ideia", item: "local", kind: "text", text: "Em qual unidade, prédio ou setor isso seria feito?", hint: "Ex.: prédio administrativo, 2º andar." },
  { id: "g-escopo", step: "ideia", item: "escopo", kind: "choice", options: ["Um teste em um único local", "Alguns setores", "Toda a unidade", "Todas as unidades da empresa"], text: "Qual seria o tamanho da primeira implantação?" },
  { id: "g-materiais", step: "execucao", item: "materiais", kind: "text", text: "O que precisaria ser comprado?", hint: "Liste os itens, se souber. Ex.: 20 sensores de presença, 2 caixas d'água." },
  { id: "g-pessoas", step: "execucao", item: "pessoas", kind: "multi", options: ["Manutenção", "Compras", "Segurança do trabalho", "Meio ambiente", "RH ou treinamento", "TI", "Produção ou operação", "Jurídico ou compliance"], text: "Quais áreas da empresa precisariam participar?" },
  { id: "g-fornecedor", step: "execucao", item: "fornecedores", kind: "choice", options: ["Sim", "Não, a equipe interna resolve"], text: "Seria preciso contratar uma empresa de fora?" },
  { id: "g-fornecedor-qual", step: "execucao", item: "fornecedores", kind: "multi", showIf: { question: "g-fornecedor", anyOf: ["Sim"] }, options: ["Instalação ou obra", "Projeto técnico", "Fornecimento de equipamentos", "Treinamento", "Consultoria", "Coleta ou destinação de materiais"], text: "Para que serviço?" },
  { id: "g-prazo", step: "execucao", item: "prazo", kind: "choice", options: ["Até 1 mês", "De 1 a 3 meses", "De 3 a 6 meses", "De 6 a 12 meses", "Mais de 12 meses"], text: "Na sua opinião, em quanto tempo daria para implantar?" },
  { id: "g-custo-inicial", step: "custos", item: "custoInicial", kind: "number", unit: "R$ (total)", text: "Você tem ideia de quanto custaria para implantar?", hint: "Valor total aproximado. Ex.: 5000. Se não souber, marque \"Não sei informar\": o sistema pesquisa preços." },
  { id: "g-custo-base", step: "custos", item: "custoInicial", kind: "choice", showIf: { question: "g-custo-inicial", anyOf: ["__number__"] }, options: ["Orçamento de fornecedor", "Compra parecida feita antes", "Pesquisa na internet", "Estimativa minha"], text: "De onde vem esse valor?" },
  { id: "g-tem-recorrente", step: "custos", item: "custoRecorrente", kind: "choice", options: YES_NO, text: "Depois de implantado, haveria algum gasto todo mês?", hint: "Ex.: manutenção, assinatura, coleta, insumos." },
  { id: "g-custo-recorrente", step: "custos", item: "custoRecorrente", kind: "number", unit: "R$ por mês", showIf: { question: "g-tem-recorrente", anyOf: ["Sim"] }, text: "Quanto, aproximadamente, por mês?" },
  { id: "g-beneficios", step: "custos", item: "beneficios", kind: "multi", options: ["Conta de energia menor", "Conta de água menor", "Menos resíduos enviados ao lixo", "Menos acidentes ou afastamentos", "Equipes mais capacitadas", "Cumprir lei ou norma", "Melhor imagem da empresa", "Benefício para a comunidade"], text: "Quais benefícios você espera? Marque todos que se aplicam." },
  { id: "g-indicadores", step: "custos", item: "indicadores", kind: "choice", options: ["Sim, com números", "Sim, mas sem números", "Não existe"], text: "Hoje existe algum registro da situação (contas, planilhas, relatórios)?", hint: "Serve para comparar o antes e o depois." },
  { id: "g-riscos", step: "custos", item: "riscos", kind: "multi", options: ["Parar a operação durante a implantação", "Resistência das pessoas à mudança", "Exigência de licença ou norma", "Custo alto", "Depender de fornecedor externo", "Falta de espaço ou de infraestrutura", "Não vejo dificuldades"], text: "O que poderia atrapalhar? Marque todos que se aplicam." },
];

const SPECIFIC: Record<InitiativeType, PlanQuestion[]> = {
  iluminacao: [
    { id: "il-ambientes", step: "especificas", item: "local", kind: "multi", options: ["Corredores", "Banheiros", "Escritórios", "Salas de reunião", "Depósito ou almoxarifado", "Área de produção", "Estacionamento ou área externa"], text: "Em quais ambientes?" },
    { id: "il-pontos", step: "especificas", item: "escopo", kind: "number", unit: "sensores", text: "Quantos sensores seriam necessários?", hint: "Conte um por ambiente ou por trecho de corredor. Ex.: 12." },
    { id: "il-luminarias", step: "especificas", item: "escopo", kind: "number", unit: "lâmpadas", text: "Quantas lâmpadas ficariam ligadas a esses sensores, no total?" },
    { id: "il-tipo", step: "especificas", item: "materiais", kind: "choice", options: ["LED", "Fluorescente (tubular)", "Incandescente ou halógena", "Mais de um tipo"], text: "Que tipo de lâmpada é usada hoje?" },
    { id: "il-potencia", step: "especificas", item: "escopo", kind: "number", unit: "watts por lâmpada", text: "Qual a potência de cada lâmpada?", hint: "Vem escrita na lâmpada. Ex.: 9 W, 18 W, 40 W." },
    { id: "il-ociosas", step: "especificas", item: "problema", kind: "choice", options: ["Quase sempre", "Algumas vezes por dia", "Raramente"], text: "Com que frequência as luzes ficam acesas sem ninguém no ambiente?" },
    { id: "il-horas-ociosas", step: "especificas", item: "beneficios", kind: "number", unit: "horas por dia", showIf: { question: "il-ociosas", anyOf: ["Quase sempre", "Algumas vezes por dia"] }, text: "Somando o dia todo, quantas horas as luzes ficam acesas sem ninguém?", hint: "Ex.: 4." },
    { id: "il-infra", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Dá para ligar o sensor na fiação que já existe?", hint: "Se for preciso passar fios novos ou abrir paredes, responda Não." },
    { id: "il-infra-ajuste", step: "especificas", item: "materiais", kind: "multi", showIf: { question: "il-infra", anyOf: ["Não"] }, options: ["Passar fiação nova", "Separar circuitos", "Trocar luminárias", "Instalar caixas de passagem"], text: "O que seria preciso fazer na parte elétrica?" },
    { id: "il-instalacao", step: "especificas", item: "fornecedores", kind: "choice", options: WHO_INSTALLS, text: "Quem faria a instalação?" },
    { id: "il-tarifa", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por kWh", text: "Quanto a empresa paga por kWh de energia?", hint: `Aparece na conta de luz. Ex.: 0,85. ${TARIFF_HINT}` },
  ],
  solar: [
    { id: "so-local", step: "especificas", item: "local", kind: "choice", options: ["Telhado", "No chão (solo)", "Cobertura de estacionamento"], text: "Onde os painéis ficariam?" },
    { id: "so-area", step: "especificas", item: "escopo", kind: "number", unit: "m²", text: "Qual o tamanho da área disponível?", hint: "Ex.: 200. Cada painel ocupa cerca de 2 m²." },
    { id: "so-consumo", step: "especificas", item: "escopo", kind: "number", unit: "kWh por mês", text: "Quantos kWh a unidade consome por mês?", hint: "Aparece na conta de luz como consumo." },
    { id: "so-conta", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por mês", text: "Qual o valor médio da conta de luz por mês?" },
    { id: "so-estrutura", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, showIf: { question: "so-local", anyOf: ["Telhado"] }, text: "O telhado está firme e sem goteiras para receber peso extra?" },
    { id: "so-sombra", step: "especificas", item: "riscos", kind: "choice", options: ["Não", "Em parte do dia", "Sim, boa parte do dia"], text: "A área recebe sombra de prédios ou árvores?" },
    { id: "so-instalacao", step: "especificas", item: "fornecedores", kind: "choice", options: WHO_INSTALLS, text: "Quem faria o projeto e a instalação?" },
  ],
  energia: [
    { id: "en-equipamentos", step: "especificas", item: "escopo", kind: "multi", options: ["Ar-condicionado", "Motores ou máquinas de produção", "Compressores", "Computadores e monitores", "Fornos ou estufas", "Bombas", "Outros"], text: "Quais equipamentos?" },
    { id: "en-quantidade", step: "especificas", item: "escopo", kind: "number", unit: "equipamentos", text: "Quantos equipamentos seriam incluídos?" },
    { id: "en-potencia", step: "especificas", item: "escopo", kind: "number", unit: "kW por equipamento", text: "Qual a potência de cada equipamento, em kW?", hint: "Vem na placa do equipamento. 1.000 W = 1 kW. Ex.: 3,5." },
    { id: "en-ocioso", step: "especificas", item: "beneficios", kind: "number", unit: "horas por dia", text: "Quantas horas por dia cada um fica ligado sem uso?" },
    { id: "en-medicao", step: "especificas", item: "indicadores", kind: "choice", options: YES_NO, text: "Existe medidor que mostre o consumo desses equipamentos?" },
    { id: "en-solucao", step: "especificas", item: "materiais", kind: "choice", options: ["Desligamento por rotina", "Temporizador ou automação", "Troca por equipamento mais eficiente", "Manutenção ou ajuste", "Outra"], text: "Qual seria a principal solução?" },
    { id: "en-parada", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Para implantar, seria preciso parar a produção?" },
    { id: "en-parada-janela", step: "especificas", item: "prazo", kind: "choice", showIf: { question: "en-parada", anyOf: ["Sim"] }, options: ["Feriado ou fim de semana", "Parada de manutenção programada", "Não há momento possível"], text: "Quando a parada poderia acontecer?" },
    { id: "en-tarifa", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por kWh", text: "Quanto a empresa paga por kWh de energia?", hint: `Aparece na conta de luz. Ex.: 0,85. ${TARIFF_HINT}` },
  ],
  agua_reuso: [
    { id: "ar-origem", step: "especificas", item: "escopo", kind: "choice", options: ["Água da chuva", "Ar-condicionado", "Lavagem ou processo", "Efluente tratado", "Outra"], text: "De onde viria a água reaproveitada?" },
    { id: "ar-finalidade", step: "especificas", item: "objetivo", kind: "multi", options: ["Descargas sanitárias", "Limpeza de pisos ou pátios", "Irrigação", "Processo industrial"], text: "Onde essa água seria usada?" },
    { id: "ar-volume", step: "especificas", item: "escopo", kind: "number", unit: "m³ por mês", text: "Quanta água estaria disponível por mês?", hint: "1 m³ = 1.000 litros." },
    { id: "ar-reservatorio", step: "especificas", item: "materiais", kind: "choice", options: YES_NO, text: "Seria preciso instalar caixa d'água ou cisterna nova?" },
    { id: "ar-reservatorio-cap", step: "especificas", item: "materiais", kind: "number", unit: "m³ (1 m³ = 1.000 litros)", showIf: { question: "ar-reservatorio", anyOf: ["Sim"] }, text: "De que tamanho, aproximadamente?" },
    { id: "ar-hidraulica", step: "especificas", item: "materiais", kind: "choice", options: YES_NO, text: "Seria preciso instalar tubos ou bomba novos?" },
    { id: "ar-tratamento", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "A água precisaria de filtro ou tratamento antes de ser usada?" },
    { id: "ar-reducao", step: "especificas", item: "beneficios", kind: "number", unit: "m³ por mês", text: "Quanta água da rede deixaria de ser comprada por mês?" },
    { id: "ar-tarifa", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por m³", text: "Quanto a empresa paga por m³ de água?", hint: `Aparece na conta de água. ${TARIFF_HINT}` },
  ],
  agua_consumo: [
    { id: "ac-onde", step: "especificas", item: "local", kind: "multi", options: ["Banheiros", "Copa ou cozinha", "Área de produção", "Lavagem de pátios ou veículos", "Jardins", "Tubulação (vazamento)"], text: "Onde está o desperdício?" },
    { id: "ac-causa", step: "especificas", item: "problema", kind: "choice", options: ["Vazamento", "Torneiras ou descargas que gastam muito", "Lavagem com mangueira", "Processo industrial", "Outra"], text: "Qual a principal causa?" },
    { id: "ac-pontos", step: "especificas", item: "escopo", kind: "number", unit: "pontos", text: "Quantas torneiras, descargas ou pontos seriam ajustados?" },
    { id: "ac-consumo", step: "especificas", item: "escopo", kind: "number", unit: "m³ por mês", text: "Quanta água a unidade consome por mês?", hint: "Aparece na conta de água. 1 m³ = 1.000 litros." },
    { id: "ac-solucao", step: "especificas", item: "materiais", kind: "multi", options: ["Consertar vazamentos", "Instalar arejadores ou redutores de vazão", "Trocar descargas ou válvulas", "Mudar a rotina de lavagem", "Instalar medidor"], text: "O que seria feito?" },
    { id: "ac-reducao", step: "especificas", item: "beneficios", kind: "number", unit: "m³ por mês", text: "Quanta água daria para economizar por mês?" },
    { id: "ac-tarifa", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por m³", text: "Quanto a empresa paga por m³ de água?", hint: `Aparece na conta de água. ${TARIFF_HINT}` },
  ],
  residuos: [
    { id: "re-tipo", step: "especificas", item: "escopo", kind: "multi", options: ["Papel e papelão", "Plástico", "Metal", "Madeira", "Restos de comida", "Óleo de cozinha", "Eletrônicos", "Resíduo perigoso (químicos, contaminados)"], text: "Qual resíduo?" },
    { id: "re-quantidade", step: "especificas", item: "escopo", kind: "number", unit: "kg por mês", text: "Quanto é gerado por mês?", hint: "Ex.: 300." },
    { id: "re-destino-atual", step: "especificas", item: "problema", kind: "choice", options: ["Lixo comum ou aterro", "Coleta de empresa contratada", "Reciclagem de parte dele", "Fica armazenado sem destino"], text: "Para onde esse resíduo vai hoje?" },
    { id: "re-destino-novo", step: "especificas", item: "objetivo", kind: "choice", options: ["Reciclagem", "Compostagem", "Reutilização interna", "Devolução ao fornecedor (logística reversa)"], text: "Qual seria o novo destino?" },
    { id: "re-coletores", step: "especificas", item: "materiais", kind: "choice", options: YES_NO, text: "Seria preciso comprar coletores ou montar uma área de armazenamento?" },
    { id: "re-coletores-qtd", step: "especificas", item: "materiais", kind: "number", unit: "coletores", showIf: { question: "re-coletores", anyOf: ["Sim"] }, text: "Quantos coletores?" },
    { id: "re-receptor", step: "especificas", item: "fornecedores", kind: "choice", options: YES_NO, text: "Já existe cooperativa ou empresa que receberia o material?" },
    { id: "re-custo-atual", step: "especificas", item: "beneficios", kind: "number", unit: "R$ por mês", text: "Quanto a empresa paga hoje, por mês, para descartar esse resíduo?" },
    { id: "re-receita", step: "especificas", item: "beneficios", kind: "choice", options: YES_NO, text: "Esse material tem valor de venda (ex.: papelão, metal)?" },
    { id: "re-licenca", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "É resíduo perigoso ou que exige licença ambiental?" },
  ],
  emissoes: [
    { id: "em-fonte", step: "especificas", item: "problema", kind: "choice", options: ["Veículos da frota", "Caldeira ou forno", "Gerador a diesel", "Processo industrial", "Outra"], text: "De onde vem a emissão?" },
    { id: "em-consumo", step: "especificas", item: "escopo", kind: "number", unit: "litros por mês", text: "Quantos litros de combustível são consumidos por mês?" },
    { id: "em-solucao", step: "especificas", item: "materiais", kind: "choice", options: ["Troca de combustível", "Manutenção ou regulagem", "Filtros ou controle", "Troca de veículo ou equipamento", "Mudança de rotina ou roteiro"], text: "Qual seria a principal solução?" },
    { id: "em-monitoramento", step: "especificas", item: "indicadores", kind: "choice", options: YES_NO, text: "Essa emissão é medida hoje?" },
    { id: "em-exigencia", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Existe exigência legal ou de licença ligada a ela?" },
  ],
  seguranca: [
    { id: "se-risco", step: "especificas", item: "problema", kind: "choice", options: ["Queda", "Choque elétrico", "Corte ou prensagem em máquina", "Produto químico", "Esforço repetitivo ou postura", "Atropelamento ou trânsito interno", "Incêndio", "Outro"], text: "Qual o risco principal?" },
    { id: "se-setor", step: "especificas", item: "local", kind: "text", text: "Em qual setor ou atividade?", hint: "Ex.: expedição, carregamento de caminhões." },
    { id: "se-expostos", step: "especificas", item: "escopo", kind: "number", unit: "pessoas", text: "Quantas pessoas ficam expostas a esse risco?" },
    { id: "se-ocorrencias", step: "especificas", item: "indicadores", kind: "number", unit: "ocorrências", text: "Quantos acidentes ou quase acidentes aconteceram nos últimos 12 meses?" },
    { id: "se-medida", step: "especificas", item: "materiais", kind: "choice", options: ["EPI", "Proteção coletiva", "Sinalização", "Treinamento", "Adequação ergonômica", "Mudança de procedimento"], text: "Qual seria a principal medida?" },
    { id: "se-parada", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Para implantar, seria preciso parar a atividade?" },
  ],
  capacitacao: [
    { id: "ca-publico", step: "especificas", item: "escopo", kind: "multi", options: ["Equipe de produção", "Equipe administrativa", "Lideranças", "Toda a empresa", "Comunidade externa"], text: "Quem participaria?" },
    { id: "ca-participantes", step: "especificas", item: "escopo", kind: "number", unit: "pessoas", text: "Quantas pessoas participariam?" },
    { id: "ca-tema", step: "especificas", item: "objetivo", kind: "text", text: "Qual o tema do treinamento?", hint: "Ex.: separação de resíduos, uso de EPI." },
    { id: "ca-formato", step: "especificas", item: "materiais", kind: "choice", options: ["Presencial", "Online", "Híbrido"], text: "Qual o formato?" },
    { id: "ca-carga", step: "especificas", item: "prazo", kind: "number", unit: "horas por pessoa", text: "Qual a duração do treinamento?" },
    { id: "ca-instrutor", step: "especificas", item: "fornecedores", kind: "choice", options: ["Alguém da empresa", "Instrutor contratado", "Ainda não definido"], text: "Quem daria o treinamento?" },
    { id: "ca-avaliacao", step: "especificas", item: "indicadores", kind: "choice", options: ["Prova antes e depois", "Observação na prática", "Pesquisa de satisfação", "Ainda não definido"], text: "Como verificar se o aprendizado funcionou?" },
  ],
  social: [
    { id: "so2-publico", step: "especificas", item: "escopo", kind: "multi", options: ["Colaboradores", "Familiares de colaboradores", "Escolas", "Comunidade do entorno", "Instituições sociais (ONGs)"], text: "Quem seria beneficiado?" },
    { id: "so2-pessoas", step: "especificas", item: "escopo", kind: "number", unit: "pessoas", text: "Quantas pessoas seriam beneficiadas, aproximadamente?" },
    { id: "so2-acao", step: "especificas", item: "objetivo", kind: "text", text: "Em uma frase, o que seria feito?" },
    { id: "so2-frequencia", step: "especificas", item: "prazo", kind: "choice", options: ["Uma vez", "Algumas vezes por ano", "Todo mês ou mais"], text: "Com que frequência?" },
    { id: "so2-parceiros", step: "especificas", item: "fornecedores", kind: "choice", options: YES_NO, text: "Haveria parceiros de fora da empresa?" },
    { id: "so2-parceiros-quais", step: "especificas", item: "fornecedores", kind: "multi", showIf: { question: "so2-parceiros", anyOf: ["Sim"] }, options: ["ONG", "Escola", "Prefeitura", "Outra empresa"], text: "Quais parceiros?" },
    { id: "so2-voluntarios", step: "especificas", item: "pessoas", kind: "number", unit: "pessoas", text: "Quantos colaboradores precisariam participar da organização?" },
  ],
  governanca: [
    { id: "go-processo", step: "especificas", item: "escopo", kind: "choice", options: ["Compras e contratações", "Financeiro", "Recursos humanos", "Segurança da informação e dados", "Atendimento a clientes", "Relatórios e indicadores", "Outro"], text: "Qual processo?" },
    { id: "go-falha", step: "especificas", item: "problema", kind: "text", text: "Que problema acontece hoje nesse processo? Não cite nomes.", hint: "Ex.: compras sem cotação, documentos perdidos." },
    { id: "go-mudanca", step: "especificas", item: "objetivo", kind: "choice", options: ["Novo procedimento", "Controle ou aprovação", "Sistema ou software", "Critério de compra", "Canal de comunicação"], text: "O que mudaria?" },
    { id: "go-sistema", step: "especificas", item: "materiais", kind: "choice", options: ["Sim, já existe", "Não, seria preciso contratar"], showIf: { question: "go-mudanca", anyOf: ["Sistema ou software"] }, text: "A empresa já tem um sistema que poderia ser usado?" },
    { id: "go-validacao", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Precisaria de aprovação do jurídico ou do compliance?" },
    { id: "go-dados", step: "especificas", item: "riscos", kind: "choice", options: YES_NO, text: "Envolve dados pessoais (CPF, salário, saúde)?" },
  ],
  geral: [
    { id: "ge-envolvido", step: "especificas", item: "escopo", kind: "text", text: "Na prática, o que seria feito?", hint: "Ex.: comprar X, mudar a rotina Y." },
    { id: "ge-quantidade", step: "especificas", item: "escopo", kind: "number", unit: "unidades, pessoas ou locais", text: "Quantas unidades, pessoas ou locais seriam atingidos?" },
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

/** Áreas, unidades e estado da empresa (do perfil), guardados no planejamento. */
export type CompanyContext = { areas: string[]; units: string[]; state: string | null };

/** Com o perfil da empresa, local, setor e áreas envolvidas viram opções da própria empresa. */
function withCompanyOptions(question: PlanQuestion, company: CompanyContext | undefined): PlanQuestion {
  if (!company) return question;
  const places = [...new Set([...company.units, ...company.areas])].slice(0, 24);
  if (question.id === "g-local" && places.length) {
    return { ...question, kind: "multi", options: places, text: "Em quais unidades ou áreas isso seria feito?", hint: "Marque todas que se aplicam." };
  }
  if (question.id === "g-pessoas" && company.areas.length) return { ...question, options: company.areas };
  if (question.id === "se-setor" && company.areas.length) {
    return { ...question, kind: "choice", options: company.areas, text: "Em qual área ou setor?", hint: undefined };
  }
  return question;
}

export function questionsFor(type: InitiativeType, company?: CompanyContext): PlanQuestion[] {
  return baseQuestionsFor(type).map((question) => withCompanyOptions(question, company));
}

function baseQuestionsFor(type: InitiativeType): PlanQuestion[] {
  const covered = itemsCoveredBy(type);
  const general = GENERAL.filter((question) => !(REPLACEABLE_GENERAL.includes(question.item) && covered.has(question.item)));
  // Quando o tipo pergunta quem instala, a pergunta geral de fornecedores vira condicional a ela.
  const installQuestion = SPECIFIC[type].find((question) => WHO_EXECUTES_QUESTIONS.includes(question.id));
  const adjusted = general.flatMap((question): PlanQuestion[] => {
    if (!installQuestion) return [question];
    if (question.id === "g-fornecedor") return [];
    if (question.id === "g-fornecedor-qual") {
      const external = installQuestion.options?.filter((option) => /contratad|os dois/i.test(option)) ?? [];
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
  /** web_search: pesquisa com IA (Anthropic); search_api: busca gratuita sem IA (Tavily); management: registrada pela gestão. */
  origin: z.enum(["web_search", "search_api", "management"]),
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

const selectionSchema = z.object({
  selected: z.array(z.string()).nullable(),
  quantity: z.number().nullable(),
  periodYears: z.number(),
  benefitOverride: z.number().nullable(),
  updatedAt: z.string(),
});
export type StoredSelection = z.infer<typeof selectionSchema>;

export const planSchema = z.object({
  version: z.literal(1),
  initiativeType: z.enum(INITIATIVE_TYPE_KEYS as [InitiativeType, ...InitiativeType[]]),
  answers: z.record(z.string(), answerSchema),
  /** Último texto escrito em cada campo da proposta a partir das respostas (para não sobrescrever edições). */
  synced: z.record(z.string(), z.string()),
  finance: financeSchema.nullable(),
  research: researchSchema.nullable(),
  /** Itens da pesquisa escolhidos pela gestão para o cálculo (ausente = pré-seleção automática). */
  selection: selectionSchema.nullable().optional(),
  /** Áreas, unidades e estado da empresa no momento do preenchimento. */
  company: z.object({ areas: z.array(z.string()), units: z.array(z.string()), state: z.string().nullable() }).optional(),
  updatedAt: z.string(),
});
export type IdeaPlan = z.infer<typeof planSchema>;

export function parsePlan(value: unknown): IdeaPlan | null {
  const parsed = planSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

/** Atualiza no planejamento as áreas, unidades e estado do perfil da empresa. */
export function withCompany(plan: IdeaPlan, company: CompanyContext | undefined): IdeaPlan {
  return company ? { ...plan, company } : plan;
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

/** Opções marcadas (uma, em perguntas de escolha única). */
export function answerOptions(value: string | null): string[] {
  return value ? value.split(MULTI_SEPARATOR).filter(Boolean) : [];
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
  return answerOptions(answer.value).some((option) => question.showIf?.anyOf.includes(option));
}

export function visibleQuestions(plan: IdeaPlan, step?: PlanStepKey) {
  return questionsFor(plan.initiativeType, plan.company).filter(
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
  const current = questionsFor(plan.initiativeType, plan.company);
  for (const id of shown) {
    const question = current.find((item) => item.id === id) ?? findPlanQuestion(id);
    if (!question) continue;
    // Várias escolhas: só opções válidas, na ordem da pergunta.
    const picked = formData.getAll(`answer:${id}`).map(String);
    const raw =
      question.kind !== "multi"
        ? String(formData.get(`answer:${id}`) ?? "").trim().slice(0, MAX_ANSWER_LENGTH)
        : picked.includes(NOT_KNOWN)
          ? NOT_KNOWN
          : picked.includes(TO_EVALUATE)
            ? TO_EVALUATE
            : (question.options ?? []).filter((option) => picked.includes(option)).join(MULTI_SEPARATOR);
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
