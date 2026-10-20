create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  legal_name text,
  tax_id text unique,
  sector text,
  company_size text,
  status text not null default 'trial'
    check (status in ('trial', 'active', 'suspended', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('company_admin', 'member')),
  status text not null default 'active' check (status in ('active', 'blocked')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (user_id)
);

create table public.ideas (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  author_id uuid not null references auth.users(id) on delete restrict,
  title text not null check (length(trim(title)) between 3 and 120),
  problem text not null check (length(trim(problem)) between 10 and 4000),
  solution text not null check (length(trim(solution)) between 10 and 4000),
  area text check (area is null or length(area) <= 100),
  status text not null default 'submitted'
    check (status in (
      'draft', 'submitted', 'in_review', 'awaiting_info',
      'technical_review', 'approved', 'in_progress',
      'implemented', 'rejected', 'archived'
    )),
  analysis jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create table public.idea_activity (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idea_id uuid not null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('created', 'updated', 'status_changed')),
  old_status text,
  new_status text,
  created_at timestamptz not null default now(),
  foreign key (idea_id, organization_id)
    references public.ideas(id, organization_id) on delete cascade
);

create table public.esg_projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  idea_id uuid,
  title text not null check (length(trim(title)) between 3 and 160),
  objective text not null,
  owner_id uuid references auth.users(id) on delete set null,
  status text not null default 'planned'
    check (status in ('planned', 'in_progress', 'completed', 'paused', 'cancelled')),
  starts_on date,
  target_date date,
  estimated_cost numeric(14, 2) check (estimated_cost is null or estimated_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  foreign key (idea_id, organization_id)
    references public.ideas(id, organization_id) on delete restrict
);

create table public.esg_indicators (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  project_id uuid not null,
  name text not null check (length(trim(name)) between 2 and 160),
  dimension text not null check (dimension in ('E', 'S', 'G')),
  unit text not null,
  baseline numeric,
  target numeric,
  measured numeric,
  measured_at date,
  evidence_note text,
  created_at timestamptz not null default now(),
  foreign key (project_id, organization_id)
    references public.esg_projects(id, organization_id) on delete cascade
);

create index memberships_user_status_idx on public.memberships(user_id, status);
create index memberships_org_role_idx on public.memberships(organization_id, role);
create index ideas_org_created_idx on public.ideas(organization_id, created_at desc);
create index ideas_org_status_idx on public.ideas(organization_id, status);
create index idea_activity_org_created_idx on public.idea_activity(organization_id, created_at desc);
create index projects_org_status_idx on public.esg_projects(organization_id, status);
create index indicators_org_project_idx on public.esg_indicators(organization_id, project_id);

create or replace function public.is_org_member(target_org_id uuid)
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
      and o.status in ('active', 'trial')
  );
$$;

create or replace function public.is_org_admin(target_org_id uuid)
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
      and m.role = 'company_admin'
      and o.status in ('active', 'trial')
  );
$$;

create or replace function public.is_platform_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(
    ((select auth.jwt()) -> 'app_metadata' ->> 'platform_admin') = 'true',
    false
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
revoke all on function public.is_platform_admin() from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;
grant execute on function public.is_platform_admin() to authenticated;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at
before update on public.organizations
for each row execute function public.set_updated_at();

create trigger ideas_set_updated_at
before update on public.ideas
for each row execute function public.set_updated_at();

create trigger projects_set_updated_at
before update on public.esg_projects
for each row execute function public.set_updated_at();

create or replace function public.record_idea_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.idea_activity (
    organization_id, idea_id, actor_id, action, old_status, new_status
  )
  values (
    new.organization_id,
    new.id,
    (select auth.uid()),
    case
      when tg_op = 'INSERT' then 'created'
      when old.status is distinct from new.status then 'status_changed'
      else 'updated'
    end,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status
  );
  return new;
end;
$$;

revoke all on function public.record_idea_activity() from public;

create trigger ideas_record_activity
after insert or update on public.ideas
for each row execute function public.record_idea_activity();

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.ideas enable row level security;
alter table public.idea_activity enable row level security;
alter table public.esg_projects enable row level security;
alter table public.esg_indicators enable row level security;

create policy "Organization members can view their organization"
on public.organizations for select to authenticated
using (public.is_org_member(id));

create policy "Company admins can update organization details"
on public.organizations for update to authenticated
using (public.is_org_admin(id))
with check (public.is_org_admin(id) and status in ('active', 'trial'));

create policy "Users can view their own membership or admins can view their org"
on public.memberships for select to authenticated
using (user_id = (select auth.uid()) or public.is_org_admin(organization_id));

create policy "Company admins can add memberships"
on public.memberships for insert to authenticated
with check (public.is_org_admin(organization_id));

create policy "Company admins can update memberships"
on public.memberships for update to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "Organization members can view organization ideas"
on public.ideas for select to authenticated
using (public.is_org_member(organization_id));

create policy "Members can submit ideas as themselves"
on public.ideas for insert to authenticated
with check (
  public.is_org_member(organization_id)
  and author_id = (select auth.uid())
  and status in ('draft', 'submitted')
);

create policy "Authors can edit drafts and admins can manage organization ideas"
on public.ideas for update to authenticated
using (
  public.is_org_admin(organization_id)
  or (author_id = (select auth.uid()) and status = 'draft')
)
with check (
  public.is_org_admin(organization_id)
  or (author_id = (select auth.uid()) and status = 'draft')
);

create policy "Organization members can view idea activity"
on public.idea_activity for select to authenticated
using (public.is_org_member(organization_id));

create policy "Organization members can view projects"
on public.esg_projects for select to authenticated
using (public.is_org_member(organization_id));

create policy "Company admins can create projects"
on public.esg_projects for insert to authenticated
with check (public.is_org_admin(organization_id));

create policy "Company admins can update projects"
on public.esg_projects for update to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "Organization members can view indicators"
on public.esg_indicators for select to authenticated
using (public.is_org_member(organization_id));

create policy "Company admins can manage indicators"
on public.esg_indicators for all to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));
