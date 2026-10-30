-- Notas, classificação e histórico da avaliação ficam restritos à gestão: o
-- colaborador que envia pelo link vê apenas o que for liberado a ele.
drop policy if exists "Members can view evaluations of ideas they can see" on public.idea_evaluations;

create policy "Org admins can view evaluations"
on public.idea_evaluations for select to authenticated
using (public.is_org_admin(organization_id));

-- Controle de uso da transcrição de áudio. O áudio em si nunca é guardado.
create table public.transcription_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  audio_bytes integer not null check (audio_bytes > 0),
  created_at timestamptz not null default now()
);

create index transcription_requests_user_idx on public.transcription_requests(user_id, created_at desc);

alter table public.transcription_requests enable row level security;

create policy "Users can view their own transcription requests"
on public.transcription_requests for select to authenticated
using (user_id = (select auth.uid()));

create policy "Link collaborators can register their own transcription requests"
on public.transcription_requests for insert to authenticated
with check (user_id = (select auth.uid()) and public.is_link_collaborator(organization_id));
