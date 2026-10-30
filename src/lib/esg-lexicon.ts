/**
 * Dicionário versionado do motor ESG local. Termos e pesos são uma proposta
 * metodológica interna, ainda não calibrada com especialistas.
 * Peso: 3 = indica a subcategoria sozinho; 2 = forte; 1 = sinal auxiliar.
 */

export const LEXICON_VERSION = "lexico-2.0.0";

export type LexiconRule = {
  id: string;
  subcategory: string;
  terms: string[];
  weight: 1 | 2 | 3;
  /** Só vale com um destes termos por perto. */
  contextTerms?: string[];
  /** Não vale com um destes termos por perto. */
  exclusions?: string[];
  explanation: string;
};

export const LEXICON_RULES: LexiconRule[] = [
  // E1
  { id: "e1-consumo-energia", subcategory: "E1", weight: 3, terms: ["consumo de energia", "consumo de luz", "gasto de energia", "gasto de luz", "conta de luz", "conta de energia", "economia de energia", "economizar energia", "eficiencia energetica", "desperdicio de energia"], explanation: "Trata de consumo ou custo de energia." },
  { id: "e1-iluminacao", subcategory: "E1", weight: 3, terms: ["desligar luz", "desligar luzes", "apagar luz", "apagar luzes", "luzes acesas", "luz acesa", "lampada led", "lampadas led", "sensor de presenca", "automacao de iluminacao"], explanation: "Trata de uso ou automação da iluminação." },
  { id: "e1-renovavel", subcategory: "E1", weight: 3, terms: ["energia solar", "painel solar", "placa solar", "energia renovavel", "energia eolica", "fonte renovavel"], explanation: "Trata de geração ou contratação de energia renovável." },
  { id: "e1-equipamentos", subcategory: "E1", weight: 2, terms: ["ar condicionado", "kwh", "motor eficiente", "desligar maquina", "desligar maquinas", "desligar equipamento", "desligar equipamentos", "maquina ligada", "maquinas ligadas"], explanation: "Trata de equipamento ligado ao uso de energia." },
  { id: "e1-energia", subcategory: "E1", weight: 1, terms: ["energia", "eletricidade", "iluminacao"], exclusions: ["equipe", "pessoal", "motivacao"], explanation: "Menciona energia, sem detalhar o uso." },
  // E2
  { id: "e2-consumo-agua", subcategory: "E2", weight: 3, terms: ["consumo de agua", "gasto de agua", "conta de agua", "economia de agua", "economizar agua", "desperdicio de agua", "vazamento de agua", "agua limpa"], explanation: "Trata de consumo ou desperdício de água." },
  { id: "e2-reuso", subcategory: "E2", weight: 3, terms: ["reuso de agua", "reaproveitar agua", "reaproveitamento de agua", "reutilizar agua", "reutilizar essa agua", "captacao de chuva", "agua de chuva", "agua da chuva"], explanation: "Trata de reúso ou captação de água." },
  { id: "e2-efluentes", subcategory: "E2", weight: 3, terms: ["efluente", "efluentes", "esgoto", "tratamento de agua", "qualidade da agua"], explanation: "Trata de efluentes ou qualidade da água." },
  { id: "e2-agua", subcategory: "E2", weight: 1, terms: ["agua", "torneira", "torneiras", "m3"], explanation: "Menciona água, sem detalhar o uso." },
  // E3
  { id: "e3-reciclagem", subcategory: "E3", weight: 3, terms: ["reciclagem", "reciclar", "coleta seletiva", "logistica reversa", "economia circular", "compostagem"], explanation: "Trata de reciclagem ou circularidade." },
  { id: "e3-residuos", subcategory: "E3", weight: 3, terms: ["reduzir residuo", "reduzir residuos", "destinacao de residuos", "gestao de residuos", "desvio de aterro", "reaproveitar material", "reaproveitar materiais", "reaproveitar sobra", "reaproveitar sobras"], explanation: "Trata de redução ou destinação de resíduos." },
  { id: "e3-lixo", subcategory: "E3", weight: 2, terms: ["residuo", "residuos", "lixo", "sucata", "descarte", "sobra de material", "sobras de material", "papel", "plastico", "embalagem", "embalagens"], explanation: "Menciona resíduos ou materiais descartados." },
  // E4
  { id: "e4-emissoes", subcategory: "E4", weight: 3, terms: ["emissoes", "emissao de carbono", "gases de efeito estufa", "pegada de carbono", "tco2e", "co2", "mudanca climatica", "mudancas climaticas"], explanation: "Trata de emissões ou clima." },
  { id: "e4-poluicao", subcategory: "E4", weight: 3, terms: ["poluicao", "poluente", "poluentes", "contaminacao", "produto quimico", "produtos quimicos", "material perigoso", "materiais perigosos", "fumaca", "biodiversidade", "reflorestamento", "desmatamento"], explanation: "Trata de poluição, contaminação ou biodiversidade." },
  { id: "e4-ruido", subcategory: "E4", weight: 1, terms: ["ruido", "poeira", "particulado", "particulados", "solo", "combustivel", "diesel"], explanation: "Menciona fator de poluição ou uso do solo." },
  // S1
  { id: "s1-acidentes", subcategory: "S1", weight: 3, terms: ["reduzir acidente", "reduzir acidentes", "prevenir acidente", "prevenir acidentes", "evitar acidente", "evitar acidentes", "acidente de trabalho", "acidentes de trabalho", "risco de acidente", "seguranca do trabalho", "doenca ocupacional", "doencas ocupacionais"], explanation: "Trata de prevenção de acidentes ou doenças." },
  { id: "s1-ergonomia", subcategory: "S1", weight: 3, terms: ["ergonomia", "ergonomico", "ergonomica", "epi", "epis", "equipamento de protecao", "esforco fisico", "dor nas costas", "lesao", "lesoes"], explanation: "Trata de ergonomia ou proteção do trabalhador." },
  { id: "s1-saude", subcategory: "S1", weight: 2, terms: ["saude mental", "bem estar", "acidente", "acidentes", "seguranca", "saude", "insalubre", "estresse", "fadiga"], exclusions: ["informacao", "dado", "ti", "cibernetica", "digital"], explanation: "Menciona saúde, segurança ou bem-estar." },
  // S2
  { id: "s2-capacitacao", subcategory: "S2", weight: 3, terms: ["capacitacao", "capacitar", "treinamento", "treinamentos", "treinar", "qualificacao", "qualificar", "curso", "cursos", "mentoria", "trilha de aprendizagem"], explanation: "Trata de capacitação ou desenvolvimento de pessoas." },
  { id: "s2-aprendizagem", subcategory: "S2", weight: 1, terms: ["aprendizagem", "aprendizado", "ensinar", "oficina", "workshop"], explanation: "Menciona aprendizagem." },
  // S3
  { id: "s3-inclusao", subcategory: "S3", weight: 3, terms: ["diversidade", "inclusao", "equidade", "acessibilidade", "pessoa com deficiencia", "pessoas com deficiencia", "direitos humanos", "assedio", "discriminacao", "rampa de acesso"], explanation: "Trata de inclusão, acessibilidade ou direitos." },
  { id: "s3-condicoes", subcategory: "S3", weight: 2, terms: ["condicoes de trabalho", "trabalho infantil", "trabalho escravo", "igualdade", "libras"], explanation: "Trata de condições de trabalho ou igualdade." },
  // S4
  { id: "s4-comunidade", subcategory: "S4", weight: 3, terms: ["comunidade", "comunidades", "projeto social", "voluntariado", "impacto social", "desenvolvimento local", "doacao", "doacoes"], explanation: "Trata de comunidade ou impacto social." },
  { id: "s4-fornecedores", subcategory: "S4", weight: 2, terms: ["fornecedores locais", "fornecedor local", "moradores", "vizinhanca", "populacao local"], explanation: "Trata de fornecedores locais ou vizinhança." },
  // G1
  { id: "g1-integridade", subcategory: "G1", weight: 3, terms: ["corrupcao", "anticorrupcao", "suborno", "propina", "fraude", "conflito de interesse", "conflitos de interesse", "codigo de conduta", "canal de denuncia", "canal de denuncias", "integridade"], explanation: "Trata de ética, integridade ou anticorrupção." },
  { id: "g1-etica", subcategory: "G1", weight: 2, terms: ["etica", "conduta", "denuncia", "denuncias"], explanation: "Menciona ética ou conduta." },
  // G2
  { id: "g2-conformidade", subcategory: "G2", weight: 3, terms: ["conformidade", "compliance", "controle interno", "controles internos", "gestao de riscos", "gestao de risco", "nao conformidade", "nao conformidades", "auditoria", "auditorias"], explanation: "Trata de conformidade, riscos ou controles." },
  { id: "g2-procedimentos", subcategory: "G2", weight: 2, terms: ["procedimento", "procedimentos", "norma", "normas", "legislacao", "politica interna", "checklist", "padronizar", "padronizacao"], explanation: "Trata de procedimentos ou requisitos aplicáveis." },
  // G3
  { id: "g3-transparencia", subcategory: "G3", weight: 3, terms: ["transparencia", "prestacao de contas", "rastreabilidade", "protecao de dados", "dados pessoais", "lgpd", "seguranca da informacao", "relatorio de sustentabilidade", "relatorio esg"], explanation: "Trata de transparência, rastreabilidade ou proteção de dados." },
  { id: "g3-dados", subcategory: "G3", weight: 2, terms: ["painel de indicadores", "dashboard", "relatorio", "relatorios", "monitoramento", "monitorar", "registro digital", "reporte", "divulgar resultados"], explanation: "Trata de reporte ou monitoramento de dados." },
  // G4
  { id: "g4-compras", subcategory: "G4", weight: 3, terms: ["compras responsaveis", "compra responsavel", "criterios para fornecedores", "avaliacao de fornecedores", "homologacao de fornecedores", "cadeia de valor", "cadeia de suprimentos", "diligencia"], explanation: "Trata de compras responsáveis ou cadeia de valor." },
  { id: "g4-fornecedor", subcategory: "G4", weight: 1, terms: ["fornecedor", "fornecedores", "compras", "licitacao", "contrato", "contratos"], explanation: "Menciona fornecedores ou compras." },
];

/** Textos curados para a similaridade TF-IDF. Nunca classificam sozinhos. */
export const SUBCATEGORY_EXAMPLES: Record<string, string> = {
  E1: "Reduzir o consumo de energia elétrica com iluminação LED, sensores de presença, automação e manutenção de motores. Desligar máquinas e luzes quando não há ninguém. Instalar painéis solares e gerar energia renovável. Diminuir a conta de luz da fábrica.",
  E2: "Reduzir o consumo de água, consertar vazamentos, reutilizar a água da lavagem, captar água de chuva e filtrar a água usada. Tratar efluentes antes de ir para o esgoto e monitorar a qualidade da água.",
  E3: "Reduzir resíduos e sobras de material, separar o lixo, fazer coleta seletiva, reciclar papel, plástico e sucata, reaproveitar embalagens, logística reversa e economia circular.",
  E4: "Reduzir emissões de gases de efeito estufa e pegada de carbono, trocar combustível, diminuir fumaça, poeira e ruído, evitar contaminação do solo por produtos químicos, proteger a biodiversidade.",
  S1: "Prevenir acidentes de trabalho, melhorar a ergonomia dos postos, usar equipamentos de proteção, reduzir esforço físico e riscos, cuidar da saúde e do bem-estar dos trabalhadores.",
  S2: "Capacitar e treinar colaboradores, oferecer cursos, mentoria e qualificação, desenvolver competências e criar oportunidades de aprendizagem para a equipe.",
  S3: "Promover diversidade, inclusão e acessibilidade, remover barreiras para pessoas com deficiência, garantir equidade e respeito aos direitos humanos, prevenir assédio e discriminação.",
  S4: "Apoiar a comunidade local, projetos sociais e voluntariado, contratar fornecedores locais, gerar impacto social positivo para os moradores da região.",
  G1: "Fortalecer ética e integridade, código de conduta, canal de denúncias, prevenir corrupção, fraude, suborno e conflitos de interesse.",
  G2: "Melhorar conformidade, gestão de riscos e controles internos, padronizar procedimentos, tratar não conformidades, fazer auditorias e atender normas e legislação.",
  G3: "Aumentar a transparência e a prestação de contas, criar painéis e relatórios de indicadores, garantir rastreabilidade, proteger dados pessoais e a qualidade dos dados.",
  G4: "Adotar compras responsáveis, critérios socioambientais para fornecedores, avaliar e homologar fornecedores e acompanhar a cadeia de valor.",
};

/** Sinais do que o texto informa. Só a presença explícita conta, nunca a suposição. */
export const SIGNAL_TERMS = {
  action: ["reduzir", "reduz", "diminuir", "instalar", "trocar", "substituir", "implantar", "implementar", "criar", "melhorar", "automatizar", "reaproveitar", "reutilizar", "filtrar", "separar", "reciclar", "capacitar", "treinar", "desligar", "apagar", "consertar", "adotar", "fazer", "colocar", "usar", "utilizar", "padronizar", "monitorar", "prevenir", "evitar", "sugiro", "proponho", "economizar"],
  problem: ["problema", "desperdicio", "desperdica", "perda", "perdas", "risco", "riscos", "falta", "faltam", "acidente", "quebra", "reclamacao", "dificuldade", "gasto", "gastamos", "demora", "retrabalho", "vazamento", "nao temos", "nao tem", "fica ligada", "ficam ligadas", "fica acesa", "ficam acesas", "direto"],
  audience: ["equipe", "equipes", "colaborador", "colaboradores", "funcionario", "funcionarios", "operador", "operadores", "trabalhador", "trabalhadores", "cliente", "clientes", "setor", "setores", "turno", "turnos", "comunidade", "moradores", "fornecedor", "fornecedores", "pessoas", "unidade"],
  baseline: ["hoje", "atualmente", "atual", "por mes", "por dia", "por ano", "por semana", "no ultimo mes", "no ultimo ano", "em media"],
  target: ["meta", "objetivo de", "reduzir para", "chegar a", "ate o fim", "em ate", "ate dezembro"],
  measurement: ["medir", "medicao", "medido", "indicador", "indicadores", "acompanhar", "monitorar", "monitoramento", "registrar", "registro", "medidor", "comparar", "antes e depois"],
  resources: ["equipamento", "equipamentos", "sensor", "sensores", "filtro", "filtros", "software", "sistema", "ferramenta", "material", "materiais", "maquina", "maquinas", "tanque", "reservatorio", "instalacao", "manutencao"],
  responsibility: ["responsavel", "responsaveis", "fornecedor", "fornecedores", "dependemos", "depende", "manutencao", "time de", "setor de", "aprovacao", "aprovar"],
  deadline: ["prazo", "semana", "semanas", "mes", "meses", "ate dezembro", "cronograma", "etapa", "etapas"],
  cost: ["custo", "custos", "custa", "custaria", "orcamento", "investimento", "preco", "gasto", "gastos"],
  benefit: ["economia", "economizar", "reduzir", "diminuir", "evitar", "melhorar", "beneficio", "beneficios", "ganho", "ganhos", "menos"],
  scale: ["outras unidades", "outra unidade", "outros setores", "outro setor", "toda empresa", "todas unidades", "todos setores", "replicar", "ampliar", "expandir", "demais unidades"],
  innovation: ["inedito", "inedita", "nunca fizemos", "ainda nao fazemos", "novo processo", "nova tecnologia", "diferente do que", "ninguem faz"],
  strategy: ["meta da empresa", "objetivo estrategico", "objetivos estrategicos", "planejamento estrategico", "estrategia da empresa", "politica da empresa", "metas da empresa"],
  evidence: ["laudo", "medicao", "relatorio", "auditoria", "planilha", "conta", "registro", "levantamento", "estudo"],
  critical: ["acidente grave", "assedio", "corrupcao", "fraude", "propina", "suborno", "vazamento quimico", "contaminacao", "trabalho infantil", "trabalho escravo", "dados pessoais", "discriminacao", "risco de vida"],
} as const;

/** Número seguido de unidade: "120 kWh", "30%", "R$ 500", "2 m3". */
export const QUANTITY_PATTERN =
  /(?:r\$\s*\d|\b\d+(?:[.,]\d+)?\s*(?:%|kwh|mwh|kw|m3|m³|litros?|l\b|kg|toneladas?|ton\b|tco2e|horas?|h\b|pessoas?|acidentes?|vezes|reais|mil\b|unidades?))/i;

export const MONEY_PATTERN = /r\$\s*\d|\b\d+(?:[.,]\d+)?\s*(?:reais|mil reais)/i;
