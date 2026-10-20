-- Fase 3: envio em texto livre, copiloto conversacional e avaliação ESG por IA.
--
-- Princípios:
-- * A descrição original do colaborador é preservada e não pode ser alterada.
-- * Rascunhos são privados do autor (nem a gestão os vê antes do envio).
-- * Respostas do copiloto e avaliações da IA só são gravadas pelo servidor
--   (service role); usuários autenticados não têm política de escrita nelas,
--   o que impede forjar uma avaliação por chamada direta à API.
-- * Falha na IA nunca altera a situação da ideia nem a aprova.

-- 1. Ideias: texto original, proposta estruturada e data de envio ------------

alter table public.ideas
  add column original_description text
    check (original_description is null or length(trim(original_description)) between 10 and 8000),
  add column structured_proposal jsonb,
  add column submitted_at timestamptz;

-- Problema e solução passam a ser opcionais: a ideia pode ser enviada
-- incompleta (os campos ficam como "não informado"). Mantém os limites de
-- tamanho quando preenchidos.
alter table public.ideas alter column problem drop not null;
alter table public.ideas alter column solution drop not null;
alter table public.ideas drop constraint ideas_problem_check;
alter table public.ideas drop constraint ideas_solution_check;
alter table public.ideas add constraint ideas_problem_check
  check (problem is null or length(trim(problem)) between 10 and 4000);
alter table public.ideas add constraint ideas_solution_check
  check (solution is null or length(trim(solution)) between 10 and 4000);
alter table public.ideas add constraint ideas_has_content_check
  check (original_description is not null or problem is not null);

-- Ideias anteriores a esta fase já foram enviadas; registra a data de envio.
update public.ideas set submitted_at = created_at where status <> 'draft' and submitted_at is null;

create or replace function public.protect_idea_original_description()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Definido apenas na criação; nenhuma atualização pode alterá-lo ou incluí-lo depois.
  if new.original_description is distinct from old.original_description then
    raise exception 'original_description_is_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger ideas_protect_original_description
before update on public.ideas
for each row execute function public.protect_idea_original_description();

-- Rascunhos visíveis apenas ao autor.
drop policy "Organization members can view organization ideas" on public.ideas;
create policy "Organization members can view submitted ideas and own drafts"
on public.ideas for select to authenticated
using (
  public.is_org_member(organization_id)
  and (status <> 'draft' or author_id = (select auth.uid()))
);

-- Toda ideia nasce como rascunho; o envio passa pela revisão (update abaixo).
drop policy "Members can submit ideas as themselves" on public.ideas;
create policy "Members can create draft ideas as themselves"
on public.ideas for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and author_id = (select auth.uid())
  and status = 'draft'
);

-- O autor edita o próprio rascunho e pode enviá-lo (draft -> submitted);
-- nenhuma outra transição é permitida a ele.
drop policy "Authors can edit drafts and admins can manage organization ideas" on public.ideas;
create policy "Authors can edit and submit drafts and admins can manage organization ideas"
on public.ideas for update to authenticated
using (
  public.is_org_admin(organization_id)
  or (author_id = (select auth.uid()) and status = 'draft')
)
with check (
  public.is_org_admin(organization_id)
  or (author_id = (select auth.uid()) and status in ('draft', 'submitted'))
);

-- 2. Conversa com o copiloto -------------------------------------------------

create table public.idea_copilot_messages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idea_id uuid not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (length(content) between 1 and 8000),
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  foreign key (idea_id, organization_id)
    references public.ideas(id, organization_id) on delete cascade
);

create index idea_copilot_messages_idea_idx on public.idea_copilot_messages(idea_id, created_at);
create index idea_copilot_messages_org_created_idx on public.idea_copilot_messages(organization_id, created_at desc);

alter table public.idea_copilot_messages enable row level security;

-- O autor vê a própria conversa; a gestão da empresa a vê depois do envio
-- (a interface avisa o colaborador sobre isso antes de enviar).
create policy "Authors and company admins can view copilot messages"
on public.idea_copilot_messages for select to authenticated
using (
  exists (
    select 1 from public.ideas i
    where i.id = idea_id
      and i.organization_id = idea_copilot_messages.organization_id
      and (
        i.author_id = (select auth.uid())
        or (public.is_org_admin(i.organization_id) and i.status <> 'draft')
      )
  )
);

create policy "Authors can add their own messages to draft ideas"
on public.idea_copilot_messages for insert to authenticated
with check (
  role = 'user'
  and model is null
  and public.is_org_member(organization_id)
  and exists (
    select 1 from public.ideas i
    where i.id = idea_id
      and i.organization_id = idea_copilot_messages.organization_id
      and i.author_id = (select auth.uid())
      and i.status = 'draft'
  )
);

-- 3. Avaliações ESG geradas pela IA -----------------------------------------

create table public.idea_evaluations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idea_id uuid not null,
  status text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  criteria_version_id uuid references public.esg_criteria_versions(id) on delete set null,
  criteria_version_label text,
  model text,
  result jsonb,
  error_message text check (error_message is null or length(error_message) <= 300),
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  foreign key (idea_id, organization_id)
    references public.ideas(id, organization_id) on delete cascade
);

create index idea_evaluations_idea_idx on public.idea_evaluations(idea_id, created_at desc);
create index idea_evaluations_org_status_idx on public.idea_evaluations(organization_id, status);

alter table public.idea_evaluations enable row level security;

-- Leitura segue a visibilidade da própria ideia (a subconsulta respeita a RLS
-- de ideas). Não há políticas de escrita: apenas o servidor grava.
create policy "Members can view evaluations of ideas they can see"
on public.idea_evaluations for select to authenticated
using (
  public.is_org_member(organization_id)
  and exists (
    select 1 from public.ideas i
    where i.id = idea_id and i.organization_id = idea_evaluations.organization_id
  )
);
