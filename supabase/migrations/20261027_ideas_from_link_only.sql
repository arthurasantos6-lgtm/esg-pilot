-- Fase 6a: ideias só podem ser criadas por colaboradores que entraram pelo
-- link de acesso da empresa. A gestão da empresa (company_admin) avalia
-- ideias e conduz projetos, mas não cadastra ideias.

-- Verdadeiro quando o usuário atual é colaborador ativo da empresa, vinculado
-- por link de acesso.
create or replace function public.is_link_collaborator(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    join public.organizations o on o.id = m.organization_id
    where m.organization_id = target_org_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and m.role = 'member'
      and m.access_link_id is not null
      and o.status in ('active', 'trial')
  );
$$;

revoke all on function public.is_link_collaborator(uuid) from public;
grant execute on function public.is_link_collaborator(uuid) to authenticated;

drop policy "Members can create draft ideas as themselves" on public.ideas;
create policy "Link collaborators can create draft ideas as themselves"
on public.ideas for insert to authenticated
with check (
  public.is_link_collaborator(organization_id)
  and author_id = (select auth.uid())
  and status = 'draft'
);

-- A origem do vínculo (link) é definida na entrada e não pode ser atribuída
-- depois, para que ninguém se torne "colaborador por link" editando um
-- vínculo. Ficar nulo é permitido (só reduz permissões; ocorre no
-- "on delete set null" da chave estrangeira).
create or replace function public.protect_membership_access_link()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.access_link_id is not null
     and new.access_link_id is distinct from old.access_link_id then
    raise exception 'access_link_is_immutable' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger memberships_protect_access_link
before update on public.memberships
for each row execute function public.protect_membership_access_link();
