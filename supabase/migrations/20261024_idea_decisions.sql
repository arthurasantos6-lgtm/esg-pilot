-- Fase 4: decisão gerencial, pedidos de complementação e privacidade entre colaboradores.
--
-- Princípios:
-- * Toda mudança de situação feita pela gestão passa por record_idea_decision,
--   que valida a transição, exige justificativa e grava o histórico na mesma
--   transação. Um trigger impede alterar situação, responsável, prazo ou
--   prioridade por update direto (inclusive por administradores da empresa).
-- * Justificativas e avaliações humanas são internas da gestão. O que o
--   colaborador pode ver fica em idea_feedback.
-- * A recomendação da IA nunca altera a situação.

-- 1. Novas situações e acompanhamento ---------------------------------------

alter table public.ideas drop constraint ideas_status_check;
alter table public.ideas add constraint ideas_status_check
  check (status in (
    'draft', 'submitted', 'in_review', 'awaiting_info', 'technical_review',
    'prioritized', 'approved', 'in_progress', 'implemented', 'rejected', 'archived'
  ));

alter table public.ideas
  add column responsible_id uuid references auth.users(id) on delete set null,
  add column follow_up_date date,
  add column priority text check (priority is null or priority in ('baixa', 'media', 'alta'));

-- 2. Fluxo configurável: transições permitidas à gestão ---------------------

create table public.idea_status_transitions (
  from_status text not null,
  to_status text not null,
  action_label text not null,
  sort_order integer not null default 0,
  primary key (from_status, to_status)
);

alter table public.idea_status_transitions enable row level security;

create policy "Authenticated users can view the idea workflow"
on public.idea_status_transitions for select to authenticated
using (true);

create policy "Platform admins can manage the idea workflow"
on public.idea_status_transitions for all to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

insert into public.idea_status_transitions (from_status, to_status, action_label, sort_order) values
  ('submitted', 'in_review', 'Aceitar para avaliação', 1),
  ('submitted', 'awaiting_info', 'Solicitar complementação', 2),
  ('submitted', 'rejected', 'Não priorizar', 9),
  ('in_review', 'awaiting_info', 'Solicitar complementação', 2),
  ('in_review', 'technical_review', 'Encaminhar para avaliação técnica', 3),
  ('in_review', 'prioritized', 'Priorizar', 4),
  ('in_review', 'approved', 'Aprovar', 5),
  ('in_review', 'rejected', 'Não priorizar', 9),
  ('awaiting_info', 'in_review', 'Retomar avaliação', 1),
  ('awaiting_info', 'rejected', 'Não priorizar', 9),
  ('technical_review', 'in_review', 'Voltar para avaliação', 1),
  ('technical_review', 'awaiting_info', 'Solicitar complementação', 2),
  ('technical_review', 'prioritized', 'Priorizar', 4),
  ('technical_review', 'approved', 'Aprovar', 5),
  ('technical_review', 'rejected', 'Não priorizar', 9),
  ('prioritized', 'approved', 'Aprovar', 5),
  ('prioritized', 'awaiting_info', 'Solicitar complementação', 2),
  ('prioritized', 'in_review', 'Voltar para avaliação', 1),
  ('prioritized', 'rejected', 'Não priorizar', 9),
  ('approved', 'in_progress', 'Iniciar implementação', 6),
  ('approved', 'prioritized', 'Voltar para priorizada', 4),
  ('in_progress', 'implemented', 'Concluir implementação', 7),
  ('in_progress', 'approved', 'Pausar implementação', 5),
  ('rejected', 'in_review', 'Reabrir avaliação', 1),
  ('rejected', 'archived', 'Arquivar', 10),
  ('implemented', 'archived', 'Arquivar', 10);

-- 3. Decisões (internas da gestão) ------------------------------------------

create table public.idea_decisions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idea_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  from_status text not null,
  to_status text not null,
  justification text not null check (length(trim(justification)) between 10 and 2000),
  responsible_id uuid references auth.users(id) on delete set null,
  follow_up_date date,
  priority text check (priority is null or priority in ('baixa', 'media', 'alta')),
  human_potential text check (human_potential is null or human_potential in ('baixo', 'médio', 'alto')),
  human_dimensions text[] check (human_dimensions is null or human_dimensions <@ array['E', 'S', 'G']),
  ai_agreement text check (ai_agreement is null or ai_agreement in ('agrees', 'partially', 'disagrees')),
  created_at timestamptz not null default now(),
  foreign key (idea_id, organization_id)
    references public.ideas(id, organization_id) on delete cascade
);

create index idea_decisions_idea_idx on public.idea_decisions(idea_id, created_at desc);
create index idea_decisions_org_created_idx on public.idea_decisions(organization_id, created_at desc);

alter table public.idea_decisions enable row level security;

-- Sem políticas de escrita: decisões só entram por record_idea_decision.
create policy "Company admins can view decisions"
on public.idea_decisions for select to authenticated
using (public.is_org_admin(organization_id));

-- 4. Comunicação com o autor (visível ao colaborador) -----------------------

create table public.idea_feedback (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idea_id uuid not null,
  writer_id uuid references auth.users(id) on delete set null,
  kind text not null check (kind in ('manager_message', 'author_response')),
  content text not null check (length(trim(content)) between 2 and 4000),
  decision_id uuid references public.idea_decisions(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (idea_id, organization_id)
    references public.ideas(id, organization_id) on delete cascade
);

create index idea_feedback_idea_idx on public.idea_feedback(idea_id, created_at);

alter table public.idea_feedback enable row level security;

create policy "Authors and company admins can view feedback"
on public.idea_feedback for select to authenticated
using (
  public.is_org_admin(organization_id)
  or exists (
    select 1 from public.ideas i
    where i.id = idea_id
      and i.organization_id = idea_feedback.organization_id
      and i.author_id = (select auth.uid())
  )
);

-- Sem políticas de escrita: mensagens entram pelas funções abaixo.

-- 5. Proteção da situação e dos campos de acompanhamento --------------------

create or replace function public.enforce_idea_workflow()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status
     or new.responsible_id is distinct from old.responsible_id
     or new.follow_up_date is distinct from old.follow_up_date
     or new.priority is distinct from old.priority then
    -- Envio do rascunho pelo próprio autor.
    if old.status = 'draft' and new.status = 'submitted'
       and new.author_id = (select auth.uid())
       and new.responsible_id is not distinct from old.responsible_id
       and new.follow_up_date is not distinct from old.follow_up_date
       and new.priority is not distinct from old.priority then
      return new;
    end if;
    -- Mudanças feitas pelas funções de decisão/complementação.
    if coalesce(current_setting('app.idea_workflow', true), '') = 'on' then
      return new;
    end if;
    raise exception 'workflow_change_requires_decision' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger ideas_enforce_workflow
before update on public.ideas
for each row execute function public.enforce_idea_workflow();

-- 6. Funções de decisão e de resposta --------------------------------------

create or replace function public.record_idea_decision(
  p_idea_id uuid,
  p_to_status text,
  p_justification text,
  p_author_message text default null,
  p_responsible_id uuid default null,
  p_follow_up_date date default null,
  p_priority text default null,
  p_human_potential text default null,
  p_human_dimensions text[] default null,
  p_ai_agreement text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idea public.ideas%rowtype;
  v_decision_id uuid;
  v_message text := nullif(trim(coalesce(p_author_message, '')), '');
begin
  select * into v_idea from public.ideas where id = p_idea_id for update;
  if not found or not public.is_org_admin(v_idea.organization_id) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  if v_idea.status = 'draft' then
    raise exception 'idea_not_submitted' using errcode = '22023';
  end if;

  -- Mesma situação = atualização de acompanhamento (responsável, prazo, etc.).
  if p_to_status <> v_idea.status and not exists (
    select 1 from public.idea_status_transitions
    where from_status = v_idea.status and to_status = p_to_status
  ) then
    raise exception 'invalid_transition' using errcode = '22023';
  end if;

  if length(trim(coalesce(p_justification, ''))) < 10 then
    raise exception 'justification_required' using errcode = '22023';
  end if;
  if p_to_status = 'awaiting_info' and p_to_status <> v_idea.status and v_message is null then
    raise exception 'author_message_required' using errcode = '22023';
  end if;

  if p_responsible_id is not null and not exists (
    select 1 from public.memberships
    where user_id = p_responsible_id
      and organization_id = v_idea.organization_id
      and status = 'active'
  ) then
    raise exception 'invalid_responsible' using errcode = '22023';
  end if;

  perform set_config('app.idea_workflow', 'on', true);
  update public.ideas
    set status = p_to_status,
        responsible_id = p_responsible_id,
        follow_up_date = p_follow_up_date,
        priority = p_priority
    where id = v_idea.id;
  perform set_config('app.idea_workflow', '', true);

  insert into public.idea_decisions (
    organization_id, idea_id, actor_id, from_status, to_status, justification,
    responsible_id, follow_up_date, priority, human_potential, human_dimensions, ai_agreement
  ) values (
    v_idea.organization_id, v_idea.id, (select auth.uid()), v_idea.status, p_to_status, trim(p_justification),
    p_responsible_id, p_follow_up_date, p_priority, p_human_potential, p_human_dimensions, p_ai_agreement
  )
  returning id into v_decision_id;

  if v_message is not null then
    insert into public.idea_feedback (organization_id, idea_id, writer_id, kind, content, decision_id)
    values (v_idea.organization_id, v_idea.id, (select auth.uid()), 'manager_message', v_message, v_decision_id);
  end if;

  return v_decision_id;
end;
$$;

create or replace function public.respond_to_info_request(p_idea_id uuid, p_content text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_idea public.ideas%rowtype;
begin
  select * into v_idea from public.ideas where id = p_idea_id for update;
  if not found
     or v_idea.author_id <> (select auth.uid())
     or not public.is_org_member(v_idea.organization_id) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  if v_idea.status <> 'awaiting_info' then
    raise exception 'no_pending_request' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_content, ''))) < 2 then
    raise exception 'content_required' using errcode = '22023';
  end if;

  insert into public.idea_feedback (organization_id, idea_id, writer_id, kind, content)
  values (v_idea.organization_id, v_idea.id, (select auth.uid()), 'author_response', trim(p_content));

  -- Com a resposta, a ideia volta para a fila de avaliação da gestão.
  perform set_config('app.idea_workflow', 'on', true);
  update public.ideas set status = 'in_review' where id = v_idea.id;
  perform set_config('app.idea_workflow', '', true);
end;
$$;

-- Lista de membros (com e-mail) para o administrador da própria empresa
-- escolher responsáveis e identificar autores de decisões.
create or replace function public.org_list_members(target_org_id uuid)
returns table (user_id uuid, email text, role text, status text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_org_admin(target_org_id) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  return query
    select m.user_id, u.email::text, m.role, m.status
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = target_org_id
    order by u.email;
end;
$$;

revoke all on function public.record_idea_decision(uuid, text, text, text, uuid, date, text, text, text[], text) from public;
revoke all on function public.respond_to_info_request(uuid, text) from public;
revoke all on function public.org_list_members(uuid) from public;
grant execute on function public.record_idea_decision(uuid, text, text, text, uuid, date, text, text, text[], text) to authenticated;
grant execute on function public.respond_to_info_request(uuid, text) to authenticated;
grant execute on function public.org_list_members(uuid) to authenticated;

-- 7. Privacidade entre colaboradores ----------------------------------------
-- Colaboradores veem apenas as próprias ideias; a gestão vê as enviadas.

drop policy "Organization members can view submitted ideas and own drafts" on public.ideas;
create policy "Authors view own ideas and company admins view submitted ideas"
on public.ideas for select to authenticated
using (
  public.is_org_member(organization_id)
  and (
    author_id = (select auth.uid())
    or (public.is_org_admin(organization_id) and status <> 'draft')
  )
);

-- O histórico de atividade segue a mesma visibilidade da ideia.
drop policy "Organization members can view idea activity" on public.idea_activity;
create policy "Members can view activity of ideas they can see"
on public.idea_activity for select to authenticated
using (
  public.is_org_member(organization_id)
  and exists (
    select 1 from public.ideas i
    where i.id = idea_id and i.organization_id = idea_activity.organization_id
  )
);
