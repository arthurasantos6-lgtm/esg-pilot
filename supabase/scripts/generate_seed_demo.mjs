// Gera seed_demo.sql e rollback_seed_demo.sql com empresas e ideias fictícias para demonstração.
// A análise de cada ideia vem do próprio motor local, não é escrita à mão.
// Uso: node --experimental-strip-types supabase/scripts/generate_seed_demo.mjs
import { writeFileSync } from "node:fs";
import { DEFAULT_CRITERIA } from "../../src/lib/esg-analysis.ts";
import { buildLocalAnalysis } from "../../src/lib/local-analysis.ts";

const NOW = Date.parse("2026-10-30T15:00:00Z");
const DAY = 86_400_000;
const CHAINS = {
  submitted: [],
  in_review: ["in_review"],
  technical_review: ["in_review", "technical_review"],
  prioritized: ["in_review", "prioritized"],
  approved: ["in_review", "prioritized", "approved"],
  in_progress: ["in_review", "prioritized", "approved", "in_progress"],
  implemented: ["in_review", "prioritized", "approved", "in_progress", "implemented"],
  rejected: ["in_review", "rejected"],
};
const JUSTIFICATIONS = {
  in_review: "Proposta aceita para análise inicial da gestão.",
  technical_review: "Encaminhada para avaliação da equipe técnica antes da decisão.",
  prioritized: "Priorizada pelo alinhamento com as metas da unidade e pela facilidade de testar.",
  approved: "Aprovada para execução após análise da viabilidade.",
  in_progress: "Implementação iniciada com a equipe responsável.",
  implemented: "Implementação concluída; resultados em acompanhamento.",
  rejected: "Não priorizada neste ciclo: há outra frente em andamento sobre o mesmo processo.",
};

// Tudo aqui é fictício: empresas, pessoas, números e situações.
const COMPANIES = [
  {
    key: "vale-claro", name: "Vale Claro Alimentos", legal: "Vale Claro Alimentos Ltda. (fictícia)", sector: "Indústria de alimentos", size: "Média",
    ideas: [
      { days: 150, status: "implemented", priority: "alta", name: "Marina Teixeira", email: "marina.teixeira@example.com", area: "Produção", title: "Reaproveitar a água da lavagem de caixas", text: "Na lavagem das caixas usamos muita água limpa que vai direto para o esgoto. Hoje gastamos uns 40 m3 por dia. Sugiro instalar um filtro e reutilizar essa água na primeira etapa da lavagem, e medir o consumo com um medidor. Meta de reduzir 20% em 3 meses. A manutenção seria responsável." },
      { days: 95, status: "in_progress", priority: "alta", name: "Rafael Nunes", email: null, area: "Embalagem", title: "Separar as sobras de embalagem para reciclagem", text: "As sobras de plástico e papel da embalagem vão para o lixo comum. Proponho fazer coleta seletiva no setor e vender para reciclagem, com registro do peso por mês para acompanhar." },
      { days: 40, status: "prioritized", priority: "media", name: "Luana Prado", email: "luana.prado@example.com", area: "Câmara fria", title: "Sensor nas câmaras frias para evitar porta aberta", text: "A porta da câmara fria fica aberta muito tempo e a conta de luz sobe. Podemos colocar um sensor com alarme. Não sei quanto custa." },
      { days: 12, status: "in_review", name: "Paulo Sena", email: null, area: "Expedição", title: "Rodízio para reduzir esforço físico na expedição", text: "Na expedição o pessoal carrega caixas pesadas o turno inteiro e reclama de dor nas costas. Sugiro fazer rodízio de tarefas e usar carrinhos para reduzir o esforço físico e prevenir lesões." },
      { days: 2, status: "submitted", name: "Ana Reis", email: "ana.reis@example.com", area: null, title: "Melhorar o refeitório", text: "Acho que dava para melhorar as coisas no refeitório, tenho algumas ideias." },
    ],
  },
  {
    key: "ferrolinea", name: "Ferrolínea Metalúrgica", legal: "Ferrolínea Metalúrgica S.A. (fictícia)", sector: "Metalurgia", size: "Grande",
    ideas: [
      { days: 170, status: "implemented", priority: "alta", name: "Carlos Duarte", email: "carlos.duarte@example.com", area: "Usinagem", title: "Desligar máquinas ociosas no fim do turno", text: "As máquinas ficam ligadas sem uso na troca de turno. Hoje gastamos cerca de 12000 kWh por mês com isso. Proponho instalar temporizadores e um checklist de desligamento, e medir o consumo com o medidor da fábrica. Meta de reduzir 15%. O custo seria de R$ 8000 e o setor de manutenção é responsável, com prazo de 2 meses. Depois podemos replicar em outras unidades." },
      { days: 110, status: "approved", priority: "alta", name: "Joana Freitas", email: null, area: "Segurança", title: "Treinamento para prevenir acidentes com prensas", text: "Tivemos quase acidentes nas prensas neste ano. Sugiro um treinamento de segurança do trabalho para os operadores dos dois turnos, com registro das ocorrências para comparar antes e depois." },
      { days: 60, status: "technical_review", name: "Everton Lima", email: "everton.lima@example.com", area: "Fundição", title: "Reduzir fumaça e poeira na fundição", text: "Tem muita fumaça e poeira na fundição. Dá para melhorar a exaustão para reduzir a poluição do ar e a exposição das equipes, mas depende de um estudo técnico." },
      { days: 25, status: "rejected", name: "Bruna Castro", email: null, area: "Compras", title: "Avaliar fornecedores de sucata", text: "Podemos criar critérios para fornecedores de sucata e fazer uma avaliação de fornecedores uma vez por ano, para saber a origem do material." },
      { days: 4, status: "submitted", name: "Marcos Vieira", email: "marcos.vieira@example.com", area: "Usinagem", title: "Desligar máquinas paradas na troca de turno", text: "Muitas máquinas ficam ligadas na troca de turno sem ninguém usando. Sugiro desligar as máquinas paradas para reduzir o consumo de energia." },
    ],
  },
  {
    key: "rota-verde", name: "Rota Verde Logística", legal: "Rota Verde Logística Ltda. (fictícia)", sector: "Transporte e logística", size: "Média",
    ideas: [
      { days: 130, status: "in_progress", priority: "alta", name: "Tiago Moreira", email: "tiago.moreira@example.com", area: "Frota", title: "Roteirização para reduzir diesel e emissões", text: "Os caminhões rodam vazios em parte das rotas. Proponho usar um sistema de roteirização para diminuir o combustível e as emissões. Hoje consumimos em média 30000 litros por mês e podemos acompanhar o indicador de consumo por km." },
      { days: 80, status: "prioritized", priority: "media", name: "Priscila Gomes", email: null, area: "Motoristas", title: "Programa de descanso para motoristas", text: "Os motoristas relatam fadiga nas viagens longas e isso aumenta o risco de acidente. Sugiro revisar as escalas e criar pontos de descanso, para cuidar da saúde e da segurança deles." },
      { days: 45, status: "in_review", name: "Diego Alves", email: "diego.alves@example.com", area: "Armazém", title: "Trocar a iluminação do armazém por LED", text: "O armazém fica com as luzes acesas o dia inteiro. Podemos trocar por lâmpadas LED com sensor de presença para diminuir a conta de luz." },
      { days: 18, status: "submitted", name: "Helena Rocha", email: null, area: "Operações", title: "Painel com os indicadores de entrega", text: "Ninguém sabe os números de entrega do mês. Dá para criar um painel de indicadores e divulgar resultados para as equipes, dando mais transparência." },
      { days: 3, status: "submitted", name: "Vitor Pires", email: "vitor.pires@example.com", area: "Frota", title: "Lavagem da frota sem desperdício", text: "A lavagem dos caminhões não reduz o consumo de água do jeito que está feita. Precisamos rever esse processo, tem muito desperdício de água." },
    ],
  },
  {
    key: "bem-cuidar", name: "Clínica Bem Cuidar", legal: "Clínica Bem Cuidar Serviços de Saúde Ltda. (fictícia)", sector: "Saúde", size: "Pequena",
    ideas: [
      { days: 120, status: "implemented", priority: "media", name: "Sofia Martins", email: "sofia.martins@example.com", area: "Recepção", title: "Rampa de acesso e atendimento acessível", text: "Pacientes com deficiência têm dificuldade na entrada da clínica. Sugiro construir uma rampa de acesso e capacitar a recepção em acessibilidade e libras, para acompanhar o número de atendimentos." },
      { days: 75, status: "approved", priority: "alta", name: "Renato Barros", email: null, area: "Administração", title: "Proteger os dados pessoais dos pacientes", text: "As fichas com dados pessoais ficam em cima do balcão. Proponho adotar um procedimento de proteção de dados conforme a LGPD, com controle de acesso e treinamento da equipe." },
      { days: 35, status: "in_review", name: "Camila Duarte", email: "camila.duarte@example.com", area: "Enfermagem", title: "Apoio à saúde mental da enfermagem", text: "A equipe de enfermagem está com muito estresse e fadiga nos plantões. Sugiro criar um programa de bem-estar e saúde mental, com escuta e revisão das escalas." },
      { days: 15, status: "submitted", name: "Gustavo Lopes", email: null, area: "Limpeza", title: "Descarte correto de materiais perigosos", text: "Precisamos melhorar o descarte de materiais perigosos e produtos químicos da limpeza para evitar contaminação. Não temos procedimento escrito." },
      { days: 1, status: "submitted", name: "Bianca Sá", email: "bianca.sa@example.com", area: null, title: "Uma ideia para a clínica", text: "Tenho uma ideia boa para a clínica, mas prefiro explicar pessoalmente." },
    ],
  },
  {
    key: "ponte-alta", name: "Ponte Alta Tecnologia", legal: "Ponte Alta Tecnologia Ltda. (fictícia)", sector: "Tecnologia", size: "Média",
    ideas: [
      { days: 160, status: "implemented", priority: "alta", name: "Isabela Campos", email: "isabela.campos@example.com", area: "Pessoas", title: "Trilha de capacitação para novos desenvolvedores", text: "Quem entra na empresa demora para aprender nossos sistemas. Proponho uma trilha de aprendizagem com mentoria e cursos, e acompanhar a avaliação antes e depois de cada etapa." },
      { days: 90, status: "in_progress", priority: "media", name: "Leandro Xavier", email: null, area: "Infraestrutura", title: "Reduzir o consumo de energia dos servidores", text: "Os servidores de teste ficam ligados à noite sem uso. Sugiro automatizar o desligamento para reduzir o consumo de energia e criar um relatório mensal de monitoramento." },
      { days: 50, status: "rejected", name: "Fernanda Coelho", email: "fernanda.coelho@example.com", area: "Facilities", title: "Doação de computadores usados", text: "Os computadores antigos ficam parados no depósito. Podemos fazer doações para projetos sociais da comunidade em vez de descartar." },
      { days: 20, status: "prioritized", priority: "alta", name: "Nicolas Ramos", email: null, area: "Compliance", title: "Canal de denúncias e código de conduta", text: "Não temos canal de denúncias nem código de conduta atualizado. Sugiro implantar os dois para prevenir conflitos de interesse e casos de assédio." },
      { days: 6, status: "submitted", name: "Júlia Pacheco", email: "julia.pacheco@example.com", area: "Pessoas", title: "Mais diversidade nas contratações", text: "Podemos ampliar a diversidade e a inclusão nas contratações, revendo como as vagas são divulgadas e criando metas da empresa para isso." },
    ],
  },
];

const q = (value) => (value === null || value === undefined ? "null" : `'${String(value).replaceAll("'", "''")}'`);
const jsonb = (value) => `${q(JSON.stringify(value))}::jsonb`;
const ts = (ms) => `'${new Date(ms).toISOString()}'`;
const id = (key) => `md5('nuevo-demo:${key}')::uuid`;

const USER_COLUMNS = "instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, is_anonymous, raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change";
const orgRows = [];
const managerBlocks = [];
const memberRows = [];
const linkRows = [];
const anonymousRows = [];
const ideaRows = [];
const decisionRows = [];
const summary = [];

for (const company of COMPANIES) {
  const org = id(`org:${company.key}`);
  const manager = id(`manager:${company.key}`);
  const email = `gestor@${company.key}.example.com`;
  orgRows.push(`(${org}, ${q(company.name)}, ${q(company.name)}, ${q(company.legal)}, ${q(company.sector)}, ${q(company.size)}, 'active')`);
  managerBlocks.push(`  perform pg_temp.demo_manager(${manager}, ${q(email)}, v_password);`);
  memberRows.push(`(${org}, ${manager}, 'company_admin', 'active', null)`);
  linkRows.push(`(${id(`link:${company.key}`)}, ${org}, replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''), 'Link de demonstração', ${manager})`);

  company.ideas.forEach((idea, index) => {
    const key = `${company.key}:${index}`;
    const author = id(`author:${key}`);
    const ideaId = id(`idea:${key}`);
    const created = NOW - idea.days * DAY;
    const submitted = created + 3_600_000;
    const analysis = buildLocalAnalysis(idea.text, DEFAULT_CRITERIA, {
      criteriaVersionId: null,
      criteriaVersionLabel: "Dados de demonstração",
    });
    const proposal = {
      title: idea.title,
      problem: null, solution: null, context: null, beneficiaries: null, esgDimensions: null,
      expectedBenefits: null, indicators: null, resourcesAndRisks: null, nextSteps: null,
      source: "manual",
      updatedAt: new Date(submitted).toISOString(),
    };
    const chain = CHAINS[idea.status];
    const decided = chain.length > 0;
    anonymousRows.push(`('00000000-0000-0000-0000-000000000000', ${author}, 'authenticated', 'authenticated', null, null, null, true, '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb, ${ts(created)}, ${ts(created)}, '', '', '', '')`);
    memberRows.push(`(${org}, ${author}, 'member', 'active', ${id(`link:${company.key}`)})`);
    ideaRows.push(`(${ideaId}, ${org}, ${author}, ${q(idea.name)}, ${q(idea.email)}, ${q(idea.title)}, ${q(idea.text)}, ${jsonb(proposal)}, ${q(idea.area)}, ${q(idea.status)}, ${jsonb(analysis)}, ${q(idea.priority ?? null)}, ${decided ? manager : "null"}, ${ts(created)}, ${ts(submitted)})`);
    let from = "submitted";
    chain.forEach((to, step) => {
      const at = submitted + ((idea.days * DAY * 0.8) / chain.length) * (step + 1);
      decisionRows.push(`(${id(`decision:${key}:${step}`)}, ${org}, ${ideaId}, ${manager}, ${q(from)}, ${q(to)}, ${q(JUSTIFICATIONS[to])}, ${decided ? manager : "null"}, ${q(idea.priority ?? null)}, ${ts(at)})`);
      from = to;
    });
    const local = analysis.local.classification;
    summary.push(`${company.key.padEnd(11)} ${idea.status.padEnd(17)} ${(local.primary_pillar ?? "-").padEnd(2)} ${local.subcategories.join(",").padEnd(9)} ${String(analysis.local.assessment.assessed_weight).padStart(3)}%  ${idea.title}`);
  });
}

const sql = `-- População de demonstração: 5 empresas e 25 ideias FICTÍCIAS. Gerado por generate_seed_demo.mjs.
-- Antes de rodar, troque a senha abaixo: ela vale para os 5 gestores e o repositório é público.
-- Prévia: rode com "rollback;" no lugar do "commit;" do fim do arquivo.
-- Pode rodar de novo sem duplicar. Para desfazer: supabase/scripts/rollback_seed_demo.sql.
begin;

create or replace function pg_temp.demo_manager(p_id uuid, p_email text, p_password text) returns void language plpgsql as $$
begin
  if exists (select 1 from auth.users where id = p_id) then return; end if;
  insert into auth.users (${USER_COLUMNS})
  values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')), now(), false,
    '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now(), '', '', '', '');
  insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
  values (p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true), 'email', now(), now(), now());
end;
$$;

do $$
declare
  v_password text := 'TROQUE_ESTA_SENHA';
begin
  if v_password = 'TROQUE_ESTA_SENHA' then
    raise exception 'Troque a senha na variável v_password antes de rodar.';
  end if;
${managerBlocks.join("\n")}
end;
$$;

insert into public.organizations (id, name, display_name, legal_name, sector, company_size, status) values
${orgRows.join(",\n")}
on conflict (id) do nothing;

insert into auth.users (${USER_COLUMNS}) values
${anonymousRows.join(",\n")}
on conflict (id) do nothing;

insert into public.organization_access_links (id, organization_id, token, label, created_by) values
${linkRows.join(",\n")}
on conflict (id) do nothing;

insert into public.memberships (organization_id, user_id, role, status, access_link_id) values
${memberRows.join(",\n")}
on conflict (user_id) do nothing;

insert into public.ideas (id, organization_id, author_id, author_name, author_email, title, original_description, structured_proposal, area, status, analysis, priority, responsible_id, created_at, submitted_at) values
${ideaRows.join(",\n")}
on conflict (id) do nothing;

insert into public.idea_decisions (id, organization_id, idea_id, actor_id, from_status, to_status, justification, responsible_id, priority, created_at) values
${decisionRows.join(",\n")}
on conflict (id) do nothing;

select
  (select count(*) from public.organizations where id in (${COMPANIES.map((company) => id(`org:${company.key}`)).join(", ")})) as empresas,
  (select count(*) from public.ideas where id::text in (select md5('nuevo-demo:idea:' || c || ':' || n)::uuid::text from unnest(array[${COMPANIES.map((company) => q(company.key)).join(", ")}]) c, generate_series(0, 4) n)) as ideias;

commit;
`;

const orgList = COMPANIES.map((company) => id(`org:${company.key}`)).join(", ");
const managerList = COMPANIES.map((company) => id(`manager:${company.key}`)).join(", ");
const authorList = COMPANIES.flatMap((company) => company.ideas.map((_, index) => id(`author:${company.key}:${index}`))).join(", ");
const rollback = `-- Remove só a população de demonstração de seed_demo.sql, identificada pelos IDs fixos.
-- Prévia: rode com "rollback;" no lugar do "commit;".
begin;

delete from public.ideas where organization_id in (${orgList});
delete from public.memberships where organization_id in (${orgList});
delete from public.organization_access_links where organization_id in (${orgList});
delete from auth.identities where user_id in (${managerList});
delete from auth.users where id in (${managerList}, ${authorList});
delete from public.platform_audit_log where target_id in (${orgList});
delete from public.organizations where id in (${orgList});

commit;
`;

writeFileSync(new URL("./seed_demo.sql", import.meta.url), sql);
writeFileSync(new URL("./rollback_seed_demo.sql", import.meta.url), rollback);
console.log(summary.join("\n"));
