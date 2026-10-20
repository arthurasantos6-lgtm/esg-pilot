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
10. Instale dependências e inicie:

   ```bash
   npm install
   npm run dev
   ```

Abra `http://localhost:3000`.

## Perfis de acesso

- **Administrador da plataforma** (`auth.users.raw_app_meta_data.platform_admin = true`): acessa `/admin`. Gerencia empresas clientes (cadastro, situação da conta, módulos habilitados), vincula usuários já existentes a empresas e consulta indicadores agregados (contagens) de todas as empresas. Não tem acesso de leitura ao conteúdo de ideias, conversas ou projetos de nenhuma empresa — isso é reforçado por Row Level Security no banco, não apenas pela interface.
- **Administrador da empresa cliente** (`memberships.role = 'company_admin'`): acesso completo aos dados da própria organização (`/dashboard`, `/ideas`, `/projects`), incluindo mudança de situação de ideias e criação de projetos.
- **Colaborador** (`memberships.role = 'member'`): registra ideias e acompanha o andamento dentro da própria organização.

Cada empresa pode ter os módulos "Ideias" e "Projetos" habilitados ou desabilitados individualmente pelo administrador da plataforma; a aplicação bloqueia o acesso no backend (não apenas oculta o menu) quando um módulo está desligado.

## O que está implementado

- Login por senha, encerramento de sessão e recuperação de senha via Supabase Auth.
- Três perfis de acesso: administrador da plataforma, administrador da empresa e colaborador, resolvidos por `app_metadata`/membership no backend (não apenas na interface).
- Painel administrativo (`/admin`): cadastro e edição de empresas clientes, situação da conta, módulos habilitados por empresa, vínculo de usuários já cadastrados a uma empresa e trocas de perfil/situação, indicadores agregados (contagens) por situação de empresas, ideias e projetos, e trilha de auditoria das ações administrativas.
- RLS em tabelas de organização, memberships, ideias, auditoria de ideias, projetos, indicadores e auditoria administrativa.
- Dashboard e lista paginada de ideias com busca e filtro de situação, alimentados por consultas ao Supabase e protegidos por RLS.
- Registro e acompanhamento de ideias com trilha de auditoria e atualização de situação por administrador da empresa.
- Cadastro de projetos vinculados a ideias aprovadas, metas e cronograma; registro de indicadores configuráveis por dimensão, unidade, linha de base, meta e medições com data e evidência descritiva.
- Triagem transparente baseada em palavras-chave (não é um modelo de IA, nem certifica impacto ESG), com critérios versionados e configuráveis pelo administrador da plataforma em `/admin/esg-criteria`: termos-chave, explicação e indicadores sugeridos por dimensão (E, S, G) e limites de potencial. Versões nascem como rascunho; apenas uma fica ativa por vez, e versões ativas ou arquivadas são imutáveis (para ajustá-las, duplique). Cada ideia registra na análise qual versão de critérios a avaliou, exibida no detalhe da ideia. Se não houver versão ativa válida, a triagem usa os critérios padrão embutidos em `src/lib/esg-analysis.ts`.
- Base de conhecimento ESG (`/admin/knowledge`): conceitos, critérios de avaliação, regras de classificação, referências, perguntas orientadoras e recomendações, com categoria, fonte, situação e número de versão incrementado a cada edição. Nesta entrega o conteúdo é consultivo e não altera a triagem automática.
- Layout responsivo, navegação semântica, labels de formulário, foco visível e respeito à preferência de movimento reduzido.

## Modelo de dados e segurança

A migração inicial cria `organizations`, `memberships`, `ideas`, `idea_activity`, `esg_projects` e `esg_indicators`. A migração `20261022_esg_criteria.sql` cria `esg_criteria_versions` (com índice que garante uma única versão ativa e a função `platform_activate_criteria_version`, que arquiva a anterior de forma atômica) e `esg_knowledge_items`; ambas podem ser lidas por usuários autenticados (a triagem roda com a sessão de quem envia a ideia) e só são alteradas pelo administrador da plataforma, com registro na trilha de auditoria. A migração `20261021_platform_admin.sql` adiciona `display_name` e `enabled_modules` a `organizations`, a tabela `platform_audit_log` e funções `security definer` (`platform_dashboard_stats`, `platform_list_organizations`, `platform_find_user_by_email`, `platform_list_organization_members`) que retornam apenas contagens e metadados administrativos — nunca o conteúdo de ideias, conversas ou projetos de uma empresa cliente. Ideias, projetos, indicadores e trilha de auditoria carregam `organization_id`; as políticas RLS validam a membership ativa no servidor PostgreSQL. As operações da aplicação usam a chave pública do Supabase e sessão do usuário, sem service role.

O modelo inicial associa cada conta de empresa a uma organização. Administradores de empresa podem rever todas as ideias do próprio ambiente; colaboradores podem enviar ideias, e só o autor pode editar uma ideia ainda em rascunho. Ideias submetidas são preservadas e não têm operação de exclusão na interface. Alterações de situação são limitadas ao administrador da empresa e registradas sem copiar descrição ou conteúdo confidencial para a auditoria. O administrador da plataforma não possui membership em nenhuma organização e não tem select liberado nas tabelas `ideas`, `esg_projects` ou `esg_indicators` — apenas nas tabelas administrativas (`organizations`, `memberships`) e nas funções agregadas.

## Limitações desta entrega

- O workspace original estava vazio; esta aplicação foi iniciada do zero após confirmação.
- O painel de administrador da plataforma cobre empresas, módulos e vínculo de usuários já existentes; critérios ESG versionados e base de conhecimento; ainda não há convite de usuários por e-mail (requer `SUPABASE_SERVICE_ROLE_KEY` em uma rotina de servidor) nem configuração de provedores de IA. Os critérios são por palavra-chave (sem pesos por termo nem critérios específicos por empresa), e a base de conhecimento ainda não é exibida às empresas clientes nem usada na triagem. A edição de um registro de conhecimento incrementa o número de versão, mas o conteúdo anterior não é guardado.
- Gestão de projetos e indicadores cobre o fluxo básico; não há cronogramas por etapa, gestão de custos, anexos de evidência ou histórico versionado de medições.
- Não há integração com provedor de IA, copiloto conversacional, anexos, exportação PDF/planilha ou relatórios administrativos exportáveis. A triagem atual é local, explicável e baseada em palavras-chave; não envie conteúdo a um terceiro.
- Visibilidade de ideias ainda é compartilhada com membros ativos da mesma organização; configurações de privacidade por departamento/ideia não estão implementadas.
- Não há fluxo de decisão gerencial estruturado (aceitar/priorizar/recusar com justificativa) distinto da simples alteração de situação já existente.
- Políticas de retenção, solicitações LGPD, redefinição administrativa de senha e auditoria de disponibilidade precisam ser definidos para uma implantação comercial.
- O provisionamento do primeiro usuário de cada empresa (criação da conta em si) é manual pelo painel Supabase; o vínculo à empresa já pode ser feito pelo painel `/admin`. Antes de produção, habilite MFA/políticas de senha no Supabase, restrinja redirects, configure domínio HTTPS, monitoramento e revisão de segurança.

## Verificação e publicação

Com `.env.local` configurado, execute `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build`. O teste usa `node --experimental-strip-types` (Node.js 22.6+). Para publicar na Vercel ou plataforma Node compatível, configure as mesmas variáveis no ambiente de produção, aplique a migração ao projeto Supabase de produção e cadastre a URL de callback correspondente em Auth. Nunca exponha credenciais de administração do Supabase.
