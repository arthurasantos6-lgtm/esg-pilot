-- Corrige "column reference status is ambiguous": a coluna de saída "status"
-- conflitava com a coluna de memberships dentro da função plpgsql.
create or replace function public.platform_list_organizations()
returns table (
  id uuid,
  name text,
  display_name text,
  sector text,
  company_size text,
  status text,
  enabled_modules jsonb,
  created_at timestamptz,
  member_count bigint,
  idea_count bigint,
  project_count bigint
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
      o.id, o.name, o.display_name, o.sector, o.company_size, o.status,
      o.enabled_modules, o.created_at,
      coalesce(m.member_count, 0),
      coalesce(i.idea_count, 0),
      coalesce(p.project_count, 0)
    from public.organizations o
    left join (
      select ms.organization_id, count(*) as member_count
      from public.memberships ms where ms.status = 'active'
      group by ms.organization_id
    ) m on m.organization_id = o.id
    left join (
      select ia.organization_id, count(*) as idea_count
      from public.ideas ia
      group by ia.organization_id
    ) i on i.organization_id = o.id
    left join (
      select pr.organization_id, count(*) as project_count
      from public.esg_projects pr
      group by pr.organization_id
    ) p on p.organization_id = o.id
    order by o.created_at desc;
end;
$$;
