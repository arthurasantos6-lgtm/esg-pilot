-- Perfil da empresa (funcionários, unidades, áreas, tarifas, prioridades ESG).
-- Usado para montar as perguntas das ideias e o cálculo de retorno.
-- Não altera nem apaga dados existentes: a coluna nasce vazia ('{}').
-- Leitura: membros da empresa (política de select já existente em organizations).
-- Escrita: administrador da plataforma e gestão da empresa (políticas já existentes).

alter table public.organizations
  add column if not exists profile jsonb not null default '{}'::jsonb;

comment on column public.organizations.profile is
  'Perfil da empresa: employees, state, city, units[], areas[], operatingDays, energyBill, energyTariff, waterBill, waterTariff, priorities[], goals.';
