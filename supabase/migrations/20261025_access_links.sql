-- Fase 5a: acesso de colaboradores por link, sem cadastro.
--
-- O colaborador abre um link da empresa, recebe uma sessão anônima do
-- Supabase Auth (Authentication > Sign In / Providers > "Allow anonymous
-- sign-ins" precisa estar habilitado) e é vinculado como colaborador
-- ('member') daquela empresa, e somente dela. Como a sessão é um usuário do
-- Supabase Auth, todas as políticas RLS existentes continuam valendo.
--
-- Garantias:
-- * O token tem 244 bits aleatórios e pertence a uma única empresa.
-- * memberships.user_id já é único: uma sessão nunca fica em duas empresas.
-- * O link nunca concede o perfil de administrador da empresa.
-- * Links podem expirar e ser revogados; empresas suspensas/inativas não aceitam entrada.

create table public.organization_access_links (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  token text not null unique check (token ~ '^[0-9a-f]{64}$'),
  label text check (label is null or length(trim(label)) between 1 and 120),
  status text not null default 'active' check (status in ('active', 'revoked')),
  expires_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  last_used_at timestamptz,
  join_count integer not null default 0
);

create index organization_access_links_org_idx on public.organization_access_links(organization_id, created_at desc);

alter table public.organization_access_links enable row level security;

-- Leitura pela gestão da própria empresa e pelo administrador da plataforma.
-- Escrita somente pelas funções abaixo.
create policy "Company and platform admins can view access links"
on public.organization_access_links for select to authenticated
using (public.is_org_admin(organization_id) or public.is_platform_admin());

alter table public.memberships
  add column access_link_id uuid references public.organization_access_links(id) on delete set null;

-- Gera o token no banco (dois UUID v4 = 244 bits aleatórios).
create or replace function public.create_access_link(target_org_id uuid, p_label text default null, p_expires_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not (public.is_org_admin(target_org_id) or public.is_platform_admin()) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'invalid_expiration' using errcode = '22023';
  end if;

  insert into public.organization_access_links (organization_id, token, label, expires_at, created_by)
  values (
    target_org_id,
    replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
    nullif(trim(coalesce(p_label, '')), ''),
    p_expires_at,
    (select auth.uid())
  )
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.revoke_access_link(link_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select organization_id into v_org from public.organization_access_links where id = link_id;
  if v_org is null or not (public.is_org_admin(v_org) or public.is_platform_admin()) then
    raise exception 'access_denied' using errcode = '42501';
  end if;
  update public.organization_access_links
    set status = 'revoked', revoked_at = now()
    where id = link_id and status = 'active';
end;
$$;

-- Validação pública do link: devolve apenas o nome de exibição da empresa.
create or replace function public.get_access_link_public(p_token text)
returns table (organization_id uuid, organization_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, coalesce(o.display_name, o.name)
  from public.organization_access_links l
  join public.organizations o on o.id = l.organization_id
  where l.token = p_token
    and l.status = 'active'
    and (l.expires_at is null or l.expires_at > now())
    and o.status in ('active', 'trial');
$$;

create or replace function public.join_organization_with_link(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_link public.organization_access_links%rowtype;
  v_membership public.memberships%rowtype;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if public.is_platform_admin() then
    raise exception 'platform_admin_cannot_join' using errcode = '42501';
  end if;

  select l.* into v_link
  from public.organization_access_links l
  join public.organizations o on o.id = l.organization_id
  where l.token = p_token
    and l.status = 'active'
    and (l.expires_at is null or l.expires_at > now())
    and o.status in ('active', 'trial');
  if not found then
    raise exception 'invalid_link' using errcode = '22023';
  end if;

  select * into v_membership from public.memberships where user_id = v_uid;
  if found then
    if v_membership.organization_id <> v_link.organization_id then
      raise exception 'linked_to_other_org' using errcode = '42501';
    end if;
    if v_membership.status <> 'active' then
      raise exception 'membership_blocked' using errcode = '42501';
    end if;
    return v_link.organization_id;
  end if;

  insert into public.memberships (organization_id, user_id, role, status, access_link_id)
  values (v_link.organization_id, v_uid, 'member', 'active', v_link.id);

  update public.organization_access_links
    set last_used_at = now(), join_count = join_count + 1
    where id = v_link.id;

  return v_link.organization_id;
end;
$$;

revoke all on function public.create_access_link(uuid, text, timestamptz) from public;
revoke all on function public.revoke_access_link(uuid) from public;
revoke all on function public.get_access_link_public(text) from public;
revoke all on function public.join_organization_with_link(text) from public;
grant execute on function public.create_access_link(uuid, text, timestamptz) to authenticated;
grant execute on function public.revoke_access_link(uuid) to authenticated;
grant execute on function public.get_access_link_public(text) to anon, authenticated;
grant execute on function public.join_organization_with_link(text) to authenticated;

-- Colaboradores por link não têm e-mail; a lista de membros indica a origem.
drop function public.org_list_members(uuid);
create or replace function public.org_list_members(target_org_id uuid)
returns table (user_id uuid, email text, role text, status text, via_link boolean, created_at timestamptz)
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
    select m.user_id, u.email::text, m.role, m.status, coalesce(u.is_anonymous, false), m.created_at
    from public.memberships m
    join auth.users u on u.id = m.user_id
    where m.organization_id = target_org_id
    order by m.role, m.created_at;
end;
$$;

revoke all on function public.org_list_members(uuid) from public;
grant execute on function public.org_list_members(uuid) to authenticated;

alter table public.platform_audit_log drop constraint platform_audit_log_target_type_check;
alter table public.platform_audit_log add constraint platform_audit_log_target_type_check
  check (target_type in ('organization', 'membership', 'esg_criteria_version', 'esg_knowledge_item', 'access_link', 'platform_config'));
