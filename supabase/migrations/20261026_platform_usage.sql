-- Fase 5c: uso da plataforma por empresa para o administrador da plataforma.
-- Retorna apenas contagens agregadas; nenhum conteúdo de ideias, conversas,
-- avaliações ou decisões é exposto.

create or replace function public.platform_usage_overview(p_from timestamptz default null)
returns table (
  organization_id uuid,
  organization_name text,
  organization_status text,
  managers_active bigint,
  collaborators_active bigint,
  collaborators_via_link bigint,
  ideas_submitted bigint,
  ideas_decided bigint,
  copilot_messages bigint,
  evaluations_completed bigint,
  evaluations_failed bigint,
  evaluations_pending bigint,
  evaluations_stale bigint,
  ai_input_tokens bigint,
  ai_output_tokens bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  return query
    select
      o.id,
      coalesce(o.display_name, o.name),
      o.status,
      (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active' and m.role = 'company_admin'),
      (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active' and m.role = 'member'),
      (select count(*) from public.memberships m where m.organization_id = o.id and m.status = 'active' and m.access_link_id is not null),
      (select count(*) from public.ideas i
        where i.organization_id = o.id and i.status <> 'draft'
          and (p_from is null or i.submitted_at >= p_from)),
      (select count(distinct d.idea_id) from public.idea_decisions d
        where d.organization_id = o.id and d.from_status <> d.to_status
          and (p_from is null or d.created_at >= p_from)),
      (select count(*) from public.idea_copilot_messages c
        where c.organization_id = o.id and (p_from is null or c.created_at >= p_from)),
      (select count(*) from public.idea_evaluations e
        where e.organization_id = o.id and e.status = 'completed' and (p_from is null or e.created_at >= p_from)),
      (select count(*) from public.idea_evaluations e
        where e.organization_id = o.id and e.status = 'failed' and (p_from is null or e.created_at >= p_from)),
      (select count(*) from public.idea_evaluations e
        where e.organization_id = o.id and e.status = 'pending' and e.created_at > now() - interval '10 minutes'),
      (select count(*) from public.idea_evaluations e
        where e.organization_id = o.id and e.status = 'pending' and e.created_at <= now() - interval '10 minutes'),
      (select coalesce(sum(x.tokens), 0)::bigint from (
        select c.input_tokens as tokens from public.idea_copilot_messages c
          where c.organization_id = o.id and (p_from is null or c.created_at >= p_from)
        union all
        select e.input_tokens from public.idea_evaluations e
          where e.organization_id = o.id and (p_from is null or e.created_at >= p_from)
      ) x),
      (select coalesce(sum(x.tokens), 0)::bigint from (
        select c.output_tokens as tokens from public.idea_copilot_messages c
          where c.organization_id = o.id and (p_from is null or c.created_at >= p_from)
        union all
        select e.output_tokens from public.idea_evaluations e
          where e.organization_id = o.id and (p_from is null or e.created_at >= p_from)
      ) x)
    from public.organizations o
    order by coalesce(o.display_name, o.name);
end;
$$;

revoke all on function public.platform_usage_overview(timestamptz) from public;
grant execute on function public.platform_usage_overview(timestamptz) to authenticated;
