-- Fase 2: critérios ESG versionados e banco de conhecimento.
-- Os critérios alimentam efetivamente a triagem (src/lib/esg-analysis.ts via
-- src/app/actions.ts); cada ideia registra qual versão de critérios a avaliou.

create table public.esg_criteria_versions (
  id uuid primary key default gen_random_uuid(),
  label text not null check (length(trim(label)) between 2 and 160),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  dimensions jsonb not null,
  potential_thresholds jsonb not null default '{"alto": 4, "medio": 2}'::jsonb,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  activated_at timestamptz
);

create index esg_criteria_versions_status_idx on public.esg_criteria_versions(status);

-- No máximo uma versão ativa por vez: a triagem lê a versão ativa com
-- maybeSingle() e precisa de um resultado inequívoco.
create unique index esg_criteria_versions_single_active_idx
  on public.esg_criteria_versions((true)) where status = 'active';

create table public.esg_knowledge_items (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 2 and 160),
  description text not null check (length(trim(description)) between 2 and 4000),
  category text not null check (category in (
    'concept', 'evaluation_criteria', 'classification_rule',
    'reference', 'guiding_question', 'recommendation'
  )),
  source text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  version integer not null default 1 check (version >= 1),
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index esg_knowledge_items_category_idx on public.esg_knowledge_items(category, status);

create trigger esg_knowledge_items_set_updated_at
before update on public.esg_knowledge_items
for each row execute function public.set_updated_at();

alter table public.esg_criteria_versions enable row level security;
alter table public.esg_knowledge_items enable row level security;

-- Critérios e conhecimento não são conteúdo privado de uma empresa: qualquer
-- usuário autenticado pode consultá-los (necessário para a triagem rodar no
-- momento do envio da ideia). Apenas o administrador da plataforma edita.
create policy "Authenticated users can view criteria versions"
on public.esg_criteria_versions for select to authenticated
using (true);

create policy "Platform admins can manage criteria versions"
on public.esg_criteria_versions for insert to authenticated
with check (public.is_platform_admin());

-- Versões ativas/arquivadas são imutáveis para preservar a rastreabilidade
-- das ideias já avaliadas. A mudança de situação ocorre apenas pela função
-- platform_activate_criteria_version (security definer, ignora esta política).
create policy "Platform admins can update draft criteria versions"
on public.esg_criteria_versions for update to authenticated
using (public.is_platform_admin() and status = 'draft')
with check (public.is_platform_admin() and status = 'draft');

create policy "Authenticated users can view knowledge items"
on public.esg_knowledge_items for select to authenticated
using (true);

create policy "Platform admins can create knowledge items"
on public.esg_knowledge_items for insert to authenticated
with check (public.is_platform_admin());

create policy "Platform admins can update knowledge items"
on public.esg_knowledge_items for update to authenticated
using (public.is_platform_admin())
with check (public.is_platform_admin());

-- Garante que ativar uma versão arquive a anterior de forma atômica.
create or replace function public.platform_activate_criteria_version(target_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_platform_admin() then
    raise exception 'access_denied' using errcode = '42501';
  end if;

  if not exists (select 1 from public.esg_criteria_versions where id = target_id) then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  update public.esg_criteria_versions
    set status = 'archived'
    where status = 'active' and id <> target_id;

  update public.esg_criteria_versions
    set status = 'active', activated_at = now()
    where id = target_id;
end;
$$;

revoke all on function public.platform_activate_criteria_version(uuid) from public;
grant execute on function public.platform_activate_criteria_version(uuid) to authenticated;

alter table public.platform_audit_log drop constraint platform_audit_log_target_type_check;
alter table public.platform_audit_log add constraint platform_audit_log_target_type_check
  check (target_type in ('organization', 'membership', 'esg_criteria_version', 'esg_knowledge_item'));

-- Semeia uma versão ativa equivalente aos critérios que já estavam embutidos
-- no código, para que a triagem continue funcionando sem exigir configuração
-- manual imediata.
insert into public.esg_criteria_versions (label, status, dimensions, potential_thresholds, notes, activated_at)
values (
  'v1 - critérios iniciais por palavra-chave',
  'active',
  '{
    "E": {
      "keywords": ["energia", "água", "agua", "resíduo", "residuo", "reciclagem", "emissão", "emissao", "carbono", "ambient", "recurso natural"],
      "explanation": "O texto menciona recursos naturais, energia, resíduos ou emissões.",
      "suggestedMetrics": ["Consumo de energia (kWh)", "Consumo de água (m³)", "Resíduos desviados de aterro (kg)"]
    },
    "S": {
      "keywords": ["segurança", "seguranca", "saúde", "saude", "capacitação", "capacitacao", "inclusão", "inclusao", "comunidade", "acessibilidade", "bem-estar"],
      "explanation": "O texto menciona saúde, segurança, inclusão ou desenvolvimento de pessoas.",
      "suggestedMetrics": ["Pessoas participantes", "Horas de capacitação", "Taxa de incidentes"]
    },
    "G": {
      "keywords": ["governança", "governanca", "transparência", "transparencia", "conformidade", "ética", "etica", "rastreabilidade", "controle", "política", "politica"],
      "explanation": "O texto menciona controles, transparência, ética ou conformidade.",
      "suggestedMetrics": ["Controles revisados", "Não conformidades resolvidas", "Processos com procedimento documentado"]
    }
  }'::jsonb,
  '{"alto": 4, "medio": 2}'::jsonb,
  'Versão inicial migrada do motor embutido no código (src/lib/esg-analysis.ts).',
  now()
);
