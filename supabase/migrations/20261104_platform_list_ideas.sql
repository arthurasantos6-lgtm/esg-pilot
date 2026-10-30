-- Lista resumida de ideias para o administrador da plataforma: título, área,
-- situação, datas e pilares. Não retorna o texto da ideia, a análise, a conversa,
-- o nome nem o e-mail de quem enviou. Rascunhos continuam privados do autor.
create or replace function public.platform_list_ideas(
  p_organization_id uuid default null,
  p_status text default null,
  p_limit integer default 500
)
returns table (
  id uuid,
  organization_id uuid,
  organization_name text,
  title text,
  area text,
  status text,
  pillars text[],
  created_at timestamptz,
  submitted_at timestamptz
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
      i.id,
      i.organization_id,
      coalesce(o.display_name, o.name),
      i.title,
      i.area,
      i.status,
      array(
        select item ->> 'dimension'
        from jsonb_array_elements(
          case when jsonb_typeof(i.analysis -> 'dimensions') = 'array' then i.analysis -> 'dimensions' else '[]'::jsonb end
        ) as item
        where item ->> 'dimension' is not null
      ),
      i.created_at,
      i.submitted_at
    from public.ideas i
    join public.organizations o on o.id = i.organization_id
    where i.status <> 'draft'
      and (p_organization_id is null or i.organization_id = p_organization_id)
      and (p_status is null or i.status = p_status)
    order by coalesce(i.submitted_at, i.created_at) desc
    limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;

revoke all on function public.platform_list_ideas(uuid, text, integer) from public;
grant execute on function public.platform_list_ideas(uuid, text, integer) to authenticated;
