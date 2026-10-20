-- Fase 1: fundação do perfil Administrador da Plataforma.
-- Adiciona metadados de empresa, módulos habilitados, trilha de auditoria
-- administrativa e funções agregadas que NÃO expõem conteúdo privado
-- (ideias, projetos, indicadores) a quem não pertence à organização.

alter table public.organizations
  add column display_name text,
  add column enabled_modules jsonb not null default '["ideas", "projects"]'::jsonb;

create table public.platform_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (length(trim(action)) between 2 and 120),
  target_type text not null check (target_type in ('organization', 'membership')),
  target_id uuid,
  details jsonb,
  created_at timestamptz not null default now()
);

create index platform_audit_log_created_idx on public.platform_audit_log(created_at desc);

alter table public.platform_audit_log enable row level security;

create policy "Platform admins can view audit log"
on public.platform_audit_log for select to authenticated
using (public.is_platform_admin());

create policy "Platform admins can insert audit log entries"
on public.platform_audit_log for insert to authenticated
with check (public.is_platform_admin() and actor_id = (select auth.uid()));

-- Administração de empresas e vínculos: dados operacionais, não conteúdo de cliente.
create policy "Platform admins can view all organizations"
on public.organizations for select to authenticated
using (public.is_platform_admin());

create policy "Platform admins can create organizations"
on public.organizations for insert to authenticated
with check (public.is_platform_admin());

create policy "Platform admins can update any organization"
on public.organizations for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

create policy "Platform admins can view all memberships"
on public.memberships for select to authenticated
using (public.is_platform_admin());

create policy "Platform admins can create memberships"
on public.memberships for insert to authenticated
with check (public.is_platform_admin());

create policy "Platform admins can update any membership"
on public.memberships for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Estatísticas agregadas para o painel administrativo. Nunca retorna
-- título, descrição ou qualquer conteúdo de ideias/projetos — apenas contagens.
create or replace function public.platform_dashboard_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  result jsonb;
begin
  if not public.is_platform_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'organizations_total', (select count(*) from public.organizations),
    'organizations_by_status', (
      select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, count(*) as total from public.organizations group by status) t
    ),
    'members_total', (select count(*) from public.memberships where status = 'active'),
    'members_by_role', (
      select coalesce(jsonb_object_agg(role, total), '{}'::jsonb)
      from (select role, count(*) as total from public.memberships where status = 'active' group by role) t
    ),
    'ideas_total', (select count(*) from public.ideas),
    'ideas_by_status', (
      select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, count(*) as total from public.ideas group by status) t
    ),
    'projects_total', (select count(*) from public.esg_projects),
    'projects_by_status', (
      select coalesce(jsonb_object_agg(status, total), '{}'::jsonb)
      from (select status, count(*) as total from public.esg_projects group by status) t
    )
  ) into result;

  return result;
end;
$$;

revoke all on function public.platform_dashboard_stats() from public;
grant execute on function public.platform_dashboard_stats() to authenticated;

-- Lista de empresas com indicadores de uso, sem expor o conteúdo das ideias/projetos.
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
      select organization_id, count(*) as member_count
      from public.memberships where status = 'active'
      group by organization_id
    ) m on m.organization_id = o.id
    left join (
      select organization_id, count(*) as idea_count
      from public.ideas
      group by organization_id
    ) i on i.organization_id = o.id
    left join (
      select organization_id, count(*) as project_count
      from public.esg_projects
      group by organization_id
    ) p on p.organization_id = o.id
    order by o.created_at desc;
end;
$$;

revoke all on function public.platform_list_organizations() from public;
grant execute on function public.platform_list_organizations() to authenticated;

-- Permite ao administrador da plataforma localizar um usuário já cadastrado
-- (criado em Authentication > Users) pelo e-mail, para vinculá-lo a uma
-- empresa. Não cria contas novas nem expõe a lista completa de usuários.
create or replace function public.platform_find_user_by_email(target_email text)
returns table (id uuid, email text)
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
    select u.id, u.email::text
    from auth.users u
    where u.email = lower(trim(target_email))
    limit 1;
end;
$$;

revoke all on function public.platform_find_user_by_email(text) from public;
grant execute on function public.platform_find_user_by_email(text) to authenticated;

-- Lista os vínculos de uma empresa com o e-mail do usuário, para a tela de
-- gestão de usuários do administrador da plataforma.
create or replace function public.platform_list_organization_members(target_org_id uuid)
returns table (
  id uuid,
  user_id uuid,
  email text,
  role text,
  status text,
  created_at timestamptz
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
    select m.id, m.user_id, u.email::text, m.role, m.status, m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = target_org_id
    order by m.created_at asc;
end;
$$;

revoke all on function public.platform_list_organization_members(uuid) from public;
grant execute on function public.platform_list_organization_members(uuid) to authenticated;
