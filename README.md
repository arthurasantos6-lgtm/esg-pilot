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
7. Instale dependências e inicie:

   ```bash
   npm install
   npm run dev
   ```

Abra `http://localhost:3000`.

## O que está implementado

- Login por senha, encerramento de sessão e recuperação de senha via Supabase Auth.
- Papéis de administrador da empresa e colaborador, resolvidos por membership no backend.
- RLS em tabelas de organização, memberships, ideias, auditoria, projetos e indicadores.
- Dashboard e lista paginada de ideias com busca e filtro de situação, alimentados por consultas ao Supabase e protegidos por RLS.
- Registro e acompanhamento de ideias com trilha de auditoria e atualização de situação por administrador da empresa.
- Cadastro de projetos vinculados a ideias aprovadas, metas e cronograma; registro de indicadores configuráveis por dimensão, unidade, linha de base, meta e medições com data e evidência descritiva.
- Triagem transparente baseada em palavras-chave (não é um modelo de IA, nem certifica impacto ESG).
- Layout responsivo, navegação semântica, labels de formulário, foco visível e respeito à preferência de movimento reduzido.

## Modelo de dados e segurança

A migração cria `organizations`, `memberships`, `ideas`, `idea_activity`, `esg_projects` e `esg_indicators`. Ideias, projetos, indicadores e trilha de auditoria carregam `organization_id`; as políticas RLS validam a membership ativa no servidor PostgreSQL. As operações da aplicação usam a chave pública do Supabase e sessão do usuário, sem service role.

O modelo inicial associa cada conta a uma organização. Administradores de empresa podem rever todas as ideias do próprio ambiente; colaboradores podem enviar ideias, e só o autor pode editar uma ideia ainda em rascunho. Ideias submetidas são preservadas e não têm operação de exclusão na interface. Alterações de situação são limitadas ao administrador da empresa e registradas sem copiar descrição ou conteúdo confidencial para a auditoria.

## Limitações desta entrega

- O workspace original estava vazio; esta aplicação foi iniciada do zero após confirmação.
- Não há console de administrador da plataforma para gerir empresas, planos, usuários globais ou critérios ESG; essas áreas requerem autorização e fluxos administrativos próprios.
- Gestão de projetos e indicadores cobre o fluxo básico; não há cronogramas por etapa, gestão de custos, anexos de evidência ou histórico versionado de medições.
- Não há integração com provedor de IA, anexos, exportação PDF/planilha ou relatórios administrativos. A triagem atual é local, explicável e baseada em palavras-chave; não envie conteúdo a um terceiro.
- Visibilidade de ideias ainda é compartilhada com membros ativos da mesma organização; configurações de privacidade por departamento/ideia não estão implementadas.
- Políticas de retenção, solicitações LGPD, convite de usuários por UI, redefinição administrativa e auditoria de disponibilidade precisam ser definidos para uma implantação comercial.
- O provisionamento inicial da organização e membership é manual pelo painel Supabase. Antes de produção, habilite MFA/políticas de senha no Supabase, restrinja redirects, configure domínio HTTPS, monitoramento e revisão de segurança.

## Verificação e publicação

Com `.env.local` configurado, execute `npm test`, `npm run lint`, `npx tsc --noEmit` e `npm run build`. O teste usa `node --experimental-strip-types` (Node.js 22.6+). Para publicar na Vercel ou plataforma Node compatível, configure as mesmas variáveis no ambiente de produção, aplique a migração ao projeto Supabase de produção e cadastre a URL de callback correspondente em Auth. Nunca exponha credenciais de administração do Supabase.
