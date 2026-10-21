# Copiloto ESG

Aplicação SaaS multiempresa em Next.js, TypeScript e Supabase. Esta primeira entrega implementa uma base de ambiente de cliente para autenticação, isolamento de dados, registro e acompanhamento de ideias e triagem ESG indicativa.

## Requisitos

- Node.js 20.9 ou superior.
- npm.
- Projeto Supabase com Auth e PostgreSQL.

## Executar localmente

1. Crie um projeto Supabase e copie `.env.example` para `.env.local`.
2. Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ou publishable key compatível) e `NEXT_PUBLIC_SITE_URL`. Não coloque a chave `service_role` no frontend nem em variáveis `NEXT_PUBLIC_*`.
3. No SQL Editor do Supabase, execute [a migração inicial](./supabase/migrations/20261020_initial_schema.sql).
4. Em Authentication, crie ou convide o primeiro usuário administrador da empresa. O cadastro público não está habilitado.
5. Associe o usuário a uma organização usando o SQL Editor com um UUID real do usuário:

   ```sql
   insert into public.organizations (name, status)
   values ('Organização de demonstração', 'active')
   returning id;
   ```

   Use o `id` retornado e o `id` do usuário exibido em Authentication > Users:

   ```sql
   insert into public.memberships (organization_id, user_id, role)
   values ('UUID_DA_ORGANIZACAO', 'UUID_DO_USUARIO', 'company_admin');
   ```

   Esses comandos são apenas para provisionamento inicial feito por uma pessoa autorizada no painel Supabase; não os exponha em páginas públicas.
6. Configure em Authentication > URL Configuration a URL do site e o redirect `http://localhost:3000/auth/callback` (e a URL de produção correspondente).
7. Execute também [a migração do administrador da plataforma](./supabase/migrations/20261021_platform_admin.sql) no SQL Editor.
8. Para promover um usuário já criado a administrador da plataforma (perfil separado de qualquer empresa cliente), rode no SQL Editor:

   ```sql
   update auth.users
   set raw_app_meta_data = raw_app_meta_data || jsonb_build_object('platform_admin', true)
   where id = 'UUID_DO_USUARIO';
   ```

   Depois, peça para essa pessoa encerrar a sessão e entrar novamente: o token de acesso só reflete a permissão após um novo login. Esse usuário acessa `/admin` e não precisa de membership em nenhuma organização.
9. Execute [a migração de critérios ESG e base de conhecimento](./supabase/migrations/20261022_esg_criteria.sql). Ela cria uma versão ativa de critérios equivalente à triagem original, então nada muda até o administrador da plataforma publicar uma nova versão.
10. Execute [a migração do copiloto e da avaliação por IA](./supabase/migrations/20261023_idea_copilot.sql).
11. (Opcional, habilita a IA) Defina `SUPABASE_SERVICE_ROLE_KEY` (Supabase > Project Settings > API Keys) e **um** provedor de IA em `.env.local` (veja os exemplos em `.env.example`):
    - **Ollama** (gratuito, local, sem enviar dados a terceiros): instale em https://ollama.com, baixe um modelo (ex.: `ollama pull qwen2.5:7b`) e use `AI_PROVIDER=ollama` e `AI_MODEL=qwen2.5:7b`. Precisa de um computador com memória suficiente e não funciona em hospedagens como a Vercel (só onde o Ollama estiver acessível).
    - **Google Gemini** ou **Groq** (camadas gratuitas com limites): `AI_PROVIDER=gemini` ou `groq`, `AI_MODEL` e `AI_API_KEY`. Verifique os termos: camadas gratuitas podem usar o conteúdo enviado.
    - **Anthropic Claude** (pago): `ANTHROPIC_API_KEY` e, opcionalmente, `ANTHROPIC_MODEL`.
    - Qualquer outra API compatível com OpenAI: `AI_PROVIDER=openai-compatible`, `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`.

    As chaves são lidas apenas no servidor; nunca use o prefixo `NEXT_PUBLIC_` nelas. A tela `/admin/ai` mostra o provedor ativo (sem exibir chaves) e testa a conexão. Sem IA configurada, o fluxo de ideias funciona sem copiloto e sem avaliação por IA, e a interface informa isso.
12. Execute [a migração de decisões gerenciais](./supabase/migrations/20261024_idea_decisions.sql).
13. Execute [a migração de acesso por link](./supabase/migrations/20261025_access_links.sql) e, em Authentication > Sign In / Providers, habilite **Allow anonymous sign-ins** (necessário para colaboradores entrarem sem cadastro). Recomenda-se habilitar também CAPTCHA (Authentication > Attack Protection) para reduzir abuso.
14. Execute [a migração de uso da plataforma](./supabase/migrations/20261026_platform_usage.sql).
15. Execute [a migração que restringe ideias aos colaboradores por link](./supabase/migrations/20261027_ideas_from_link_only.sql).
16. Instale dependências e inicie:

   ```bash
   npm install
   npm run dev
   ```

Abra `http://localhost:3000`.

## Perfis de acesso

- **Administrador da plataforma** (`auth.users.raw_app_meta_data.platform_admin = true`): acessa `/admin`. Gerencia empresas clientes (cadastro, situação da conta, módulos habilitados), vincula usuários já existentes a empresas e consulta indicadores agregados (contagens) de todas as empresas. Não tem acesso de leitura ao conteúdo de ideias, conversas ou projetos de nenhuma empresa — isso é reforçado por Row Level Security no banco, não apenas pela interface.
- **Administrador da empresa cliente** (`memberships.role = 'company_admin'`): acesso completo aos dados da própria organização (`/dashboard`, `/ideas`, `/projects`), avaliando e decidindo sobre as ideias enviadas pelos colaboradores e conduzindo os projetos. A gestão **não cadastra ideias**: ideias só são criadas por colaboradores que entraram pelo link de acesso (regra garantida no banco por `is_link_collaborator`).
- **Colaborador** (`memberships.role = 'member'`): entra pelo link de acesso da empresa, sem cadastro nem senha (sessão anônima do Supabase Auth vinculada a uma única empresa). Registra ideias, conversa com o copiloto e acompanha apenas as próprias ideias (situação, próxima ação e mensagens da gestão). Não vê ideias de outros colaboradores, justificativas internas nem avaliações humanas da gestão.

Cada empresa pode ter os módulos "Ideias" e "Projetos" habilitados ou desabilitados individualmente pelo administrador da plataforma; a aplicação bloqueia o acesso no backend (não apenas oculta o menu) quando um módulo está desligado.

## O que está implementado

- Login por senha, encerramento de sessão e recuperação de senha via Supabase Auth.
- Três perfis de acesso: administrador da plataforma, administrador da empresa e colaborador, resolvidos por `app_metadata`/membership no backend (não apenas na interface).
- Painel administrativo (`/admin`): cadastro e edição de empresas clientes, situação da conta, módulos habilitados por empresa, vínculo de usuários já cadastrados a uma empresa e trocas de perfil/situação, indicadores agregados (contagens) por situação de empresas, ideias e projetos, e trilha de auditoria das ações administrativas.
- RLS em tabelas de organização, memberships, ideias, auditoria de ideias, projetos, indicadores e auditoria administrativa.
- Painéis por perfil (`/dashboard` e `/admin`), calculados apenas com dados registrados:
  - **Colaborador**: boas-vindas, botão para enviar ideia, pendências (rascunhos e pedidos de complementação), "Minhas ideias" com situação e próxima ação, e orientações para escrever uma boa proposta. Sem gráficos gerenciais.
  - **Gestão da empresa**: filtros de período, situação, dimensão ESG e área; ideias recebidas, aguardando a gestão, priorizadas/aprovadas, tempo médio até a primeira decisão e até a decisão final; distribuição por dimensão ESG (indicando quantas vêm da avaliação por IA e quantas da triagem por termos), potencial estimado, situação, área e prioridade; evolução mensal com tabela equivalente; projetos e indicadores separando metas de medições reais.
  - **Administrador da plataforma**: alertas operacionais (IA não configurada, avaliações com falha ou interrompidas), empresas por situação, usuários (gestão e por link) e uso por empresa no período (ideias, decisões, avaliações por IA, mensagens do copiloto e tokens), com filtros por período, situação e empresa. Apenas contagens, sem conteúdo dos clientes (`platform_usage_overview`).
- Lista paginada de ideias com busca e filtro de situação, protegida por RLS.
- Registro e acompanhamento de ideias com trilha de auditoria e atualização de situação por administrador da empresa.
- Acesso do colaborador por link (`/acesso/[token]`): a gestão da empresa (`/equipe`) ou o administrador da plataforma (detalhe da empresa) gera links com identificação e validade; cada link pertence a uma única empresa, concede apenas o perfil de colaborador e pode ser revogado. O vínculo é feito no banco (`join_organization_with_link`): uma sessão nunca fica em duas empresas, e empresas suspensas ou inativas não aceitam entradas. A gestão vê quem entrou por link e pode bloquear colaboradores. Limite de 20 novas ideias por pessoa em 24 horas.
- Fluxo do colaborador em texto livre (`/ideas/new`): a ideia nasce como rascunho visível só para o autor; o texto original é preservado e não pode ser alterado (garantido por trigger no banco).
- Copiloto conversacional com IA (`/ideas/[id]/copilot`; provedor configurável: Ollama local, Gemini, Groq, outra API compatível com OpenAI ou Anthropic Claude): faz perguntas progressivas, ajuda a identificar beneficiários, relações E/S/G, indicadores e riscos, usando a versão ativa dos critérios ESG e os registros ativos da base de conhecimento. Limite de 30 mensagens do colaborador por ideia. A conversa pode ser retomada depois.
- Proposta estruturada (`/ideas/[id]/review`): o copiloto organiza a conversa em campos (problema, solução, contexto, beneficiários, dimensões ESG, benefícios, indicadores, riscos, próximos passos); campos sem informação ficam como "não informado". O colaborador edita, salva o rascunho e confirma o envio explicitamente.
- Avaliação ESG por IA após o envio, processada em segundo plano: dimensões com justificativa e critérios usados, potencial preliminar, confiança, informações faltantes, melhorias, indicadores, riscos, esforço (só quando há base), próximos passos, limitações e sinalização de necessidade de análise humana. Cada avaliação registra o modelo e a versão de critérios. Falhas ficam registradas e podem ser reprocessadas pelo autor ou pela gestão; a ideia nunca é perdida nem tem a situação alterada pela IA.
- Decisão gerencial (`/ideas/[id]`, painel "Registrar decisão"): aceitar, solicitar complementação, encaminhar para avaliação técnica, priorizar, aprovar, não priorizar, iniciar e concluir implementação, reabrir e arquivar, conforme as transições da tabela `idea_status_transitions`. Toda decisão exige justificativa interna, pode definir responsável, prazo e prioridade e registrar uma avaliação humana (concordância com a IA, potencial e dimensões) sem apagar a avaliação da IA. O histórico identifica quem decidiu e quando. Ideias aprovadas têm atalho para criar projeto.
- Pedido de complementação: a mensagem ao colaborador aparece no detalhe da ideia; ao responder, a ideia volta para "Em avaliação" e uma nova avaliação por IA é solicitada considerando as complementações.
- Detalhe da ideia separa visualmente o texto do colaborador, o conteúdo gerado pela IA e a decisão da gestão; a lista de ideias tem filtro "Minhas ideias".
- Cadastro de projetos vinculados a ideias aprovadas, metas e cronograma; registro de indicadores configuráveis por dimensão, unidade, linha de base, meta e medições com data e evidência descritiva.
- Triagem transparente baseada em palavras-chave (não é um modelo de IA, nem certifica impacto ESG), com critérios versionados e configuráveis pelo administrador da plataforma em `/admin/esg-criteria`: termos-chave, explicação e indicadores sugeridos por dimensão (E, S, G) e limites de potencial. Versões nascem como rascunho; apenas uma fica ativa por vez, e versões ativas ou arquivadas são imutáveis (para ajustá-las, duplique). Cada ideia registra na análise qual versão de critérios a avaliou, exibida no detalhe da ideia. Se não houver versão ativa válida, a triagem usa os critérios padrão embutidos em `src/lib/esg-analysis.ts`.
- Base de conhecimento ESG (`/admin/knowledge`): conceitos, critérios de avaliação, regras de classificação, referências, perguntas orientadoras e recomendações, com categoria, fonte, situação e número de versão incrementado a cada edição. Nesta entrega o conteúdo é consultivo e não altera a triagem automática.
- Layout responsivo, navegação semântica, labels de formulário, foco visível e respeito à preferência de movimento reduzido.

## Modelo de dados e segurança

A migração inicial cria `organizations`, `memberships`, `ideas`, `idea_activity`, `esg_projects` e `esg_indicators`. A migração `20261024_idea_decisions.sql` adiciona a situação "priorizada", responsável, prazo e prioridade às ideias; cria `idea_status_transitions` (fluxo configurável), `idea_decisions` (histórico interno, visível só à gestão) e `idea_feedback` (mensagens entre gestão e autor). Mudanças de situação, responsável, prazo e prioridade só ocorrem pelas funções `record_idea_decision` e `respond_to_info_request`: um trigger bloqueia updates diretos, inclusive de administradores da empresa, para que nenhuma decisão fique sem justificativa e histórico. A mesma migração restringe a leitura de ideias ao autor e à gestão da empresa. A migração `20261023_idea_copilot.sql` adiciona a `ideas` o texto original, a proposta estruturada e a data de envio; torna rascunhos privados do autor; cria `idea_copilot_messages` (conversa) e `idea_evaluations` (avaliações da IA). Usuários autenticados não têm política de escrita para respostas do copiloto nem para avaliações: elas são gravadas apenas pelo servidor com a chave service role, depois de verificar a permissão do usuário com a sessão dele, o que impede forjar uma avaliação por chamada direta à API. A gestão da empresa lê a conversa somente após o envio (o colaborador é avisado antes de confirmar). O conteúdo enviado à IA inclui título, área e texto da ideia, sem e-mail ou identificação do autor; o texto do colaborador é tratado como dado não confiável no prompt. Logs de falha registram apenas o identificador da ideia e o código do erro. A migração `20261022_esg_criteria.sql` cria `esg_criteria_versions` (com índice que garante uma única versão ativa e a função `platform_activate_criteria_version`, que arquiva a anterior de forma atômica) e `esg_knowledge_items`; ambas podem ser lidas por usuários autenticados (a triagem roda com a sessão de quem envia a ideia) e só são alteradas pelo administrador da plataforma, com registro na trilha de auditoria. A migração `20261021_platform_admin.sql` adiciona `display_name` e `enabled_modules` a `organizations`, a tabela `platform_audit_log` e funções `security definer` (`platform_dashboard_stats`, `platform_list_organizations`, `platform_find_user_by_email`, `platform_list_organization_members`) que retornam apenas contagens e metadados administrativos — nunca o conteúdo de ideias, conversas ou projetos de uma empresa cliente. Ideias, projetos, indicadores e trilha de auditoria carregam `organization_id`; as políticas RLS validam a membership ativa no servidor PostgreSQL. As operações da aplicação usam a chave pública do Supabase e sessão do usuário, sem service role.

O modelo inicial associa cada conta de empresa a uma organização. Administradores de empresa podem rever todas as ideias do próprio ambiente; colaboradores podem enviar ideias, e só o autor pode editar uma ideia ainda em rascunho. Ideias submetidas são preservadas e não têm operação de exclusão na interface. Alterações de situação são limitadas ao administrador da empresa e registradas sem copiar descrição ou conteúdo confidencial para a auditoria. O administrador da plataforma não possui membership em nenhuma organização e não tem select liberado nas tabelas `ideas`, `esg_projects` ou `esg_indicators` — apenas nas tabelas administrativas (`organizations`, `memberships`) e nas funções agregadas.

## Limitações desta entrega

- O workspace original estava vazio; esta aplicação foi iniciada do zero após confirmação.
- O painel de administrador da plataforma cobre empresas, módulos e vínculo de usuários já existentes; critérios ESG versionados e base de conhecimento; ainda não há convite de usuários por e-mail (requer `SUPABASE_SERVICE_ROLE_KEY` em uma rotina de servidor) nem configuração de provedores de IA. Os critérios são por palavra-chave (sem pesos por termo nem critérios específicos por empresa), e a base de conhecimento ainda não é exibida às empresas clientes nem usada na triagem. A edição de um registro de conhecimento incrementa o número de versão, mas o conteúdo anterior não é guardado.
- Gestão de projetos e indicadores cobre o fluxo básico; não há cronogramas por etapa, gestão de custos, anexos de evidência ou histórico versionado de medições.
- O provedor e o modelo de IA são definidos por variáveis de ambiente (a tela `/admin/ai` mostra o estado e testa a conexão, mas não altera a configuração); ainda não há modelo diferente por tipo de tarefa, limites de uso por empresa nem painel de consumo para o administrador da plataforma (os tokens já são registrados por mensagem e por avaliação). Ao habilitar um provedor externo, o texto das ideias é enviado a ele (com Ollama local, não sai do servidor); modelos locais pequenos podem gerar perguntas e avaliações de qualidade inferior; avalie o contrato e a política de retenção de dados antes de usar com dados reais.
- O colaborador ainda consegue, por chamada direta à API, alterar a triagem por termos (`ideas.analysis`) do próprio rascunho no momento do envio; a avaliação por IA não tem esse problema. A triagem por termos é exibida como sinal auxiliar.
- Não há anexos, exportação PDF/planilha ou relatórios administrativos exportáveis.
- Não há configurações de privacidade por departamento; a gestão da empresa vê todas as ideias enviadas.
- O fluxo de situações é editável apenas pelo banco (tabela `idea_status_transitions`); ainda não há tela para o administrador da plataforma configurá-lo. Não há notificações por e-mail de decisões ou pedidos de complementação.
- Políticas de retenção, solicitações LGPD, redefinição administrativa de senha e auditoria de disponibilidade precisam ser definidos para uma implantação comercial.
- O acesso por link fica salvo no navegador: se o colaborador limpar os dados do navegador ou trocar de aparelho, perde o acesso às ideias já enviadas (elas continuam com a empresa). Ainda não há opção de o colaborador vincular um e-mail para recuperar o acesso.
- O provisionamento do primeiro usuário de cada empresa (criação da conta em si) é manual pelo painel Supabase; o vínculo à empresa já pode ser feito pelo painel `/admin`. Antes de produção, habilite MFA/políticas de senha no Supabase, restrinja redirects, configure domínio HTTPS, monitoramento e revisão de segurança.

## Verificação e publicação

Com `.env.local` configurado, execute `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build`. O teste usa `node --experimental-strip-types` (Node.js 22.6+). Para publicar na Vercel ou plataforma Node compatível, configure as mesmas variáveis no ambiente de produção, aplique a migração ao projeto Supabase de produção e cadastre a URL de callback correspondente em Auth. Nunca exponha credenciais de administração do Supabase.
