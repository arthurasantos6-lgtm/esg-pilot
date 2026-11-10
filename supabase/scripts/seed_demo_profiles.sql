-- Perfis FICTÍCIOS das empresas de demonstração (seed_demo.sql).
-- Rodar DEPOIS da migração 20261105_organization_profile.sql.
-- Só atualiza as 5 empresas de demonstração; não toca em empresas reais.
-- Para desfazer: rodar o bloco "rollback" no fim deste arquivo.

update public.organizations set profile = '{
  "employees": 180,
  "state": "ES",
  "city": "Serra",
  "units": ["Fábrica", "Centro de distribuição"],
  "areas": ["Produção", "Embalagem", "Câmara fria", "Expedição", "Manutenção", "Administrativo"],
  "operatingDays": 300,
  "energyBill": 42000,
  "energyTariff": 0.82,
  "waterBill": 9500,
  "waterTariff": 16.4,
  "priorities": ["Energia", "Água", "Resíduos"],
  "goals": "Reduzir 15% do consumo de água por tonelada produzida até 2027 (meta fictícia)."
}'::jsonb
where id = md5('nuevo-demo:org:vale-claro')::uuid;

update public.organizations set profile = '{
  "employees": 620,
  "state": "MG",
  "city": "Betim",
  "units": ["Planta 1", "Planta 2"],
  "areas": ["Usinagem", "Fundição", "Segurança", "Compras", "Manutenção", "Qualidade"],
  "operatingDays": 345,
  "energyBill": 310000,
  "energyTariff": 0.71,
  "waterBill": 28000,
  "waterTariff": 13.9,
  "priorities": ["Energia", "Saúde e segurança", "Emissões"],
  "goals": "Zero acidentes com afastamento e 10% menos energia por peça até 2027 (meta fictícia)."
}'::jsonb
where id = md5('nuevo-demo:org:ferrolinea')::uuid;

update public.organizations set profile = '{
  "employees": 240,
  "state": "SP",
  "city": "Campinas",
  "units": ["Base Campinas", "Base Ribeirão Preto"],
  "areas": ["Frota", "Motoristas", "Armazém", "Operações", "Manutenção", "Administrativo"],
  "operatingDays": 310,
  "energyBill": 26000,
  "energyTariff": 0.88,
  "waterBill": 6200,
  "waterTariff": 15.2,
  "priorities": ["Emissões", "Saúde e segurança", "Capacitação"],
  "goals": "Reduzir 8% do consumo de diesel por quilômetro rodado em 2027 (meta fictícia)."
}'::jsonb
where id = md5('nuevo-demo:org:rota-verde')::uuid;

update public.organizations set profile = '{
  "employees": 45,
  "state": "RJ",
  "city": "Niterói",
  "units": ["Clínica Centro"],
  "areas": ["Recepção", "Administração", "Enfermagem", "Limpeza", "Consultórios"],
  "operatingDays": 290,
  "energyBill": 7800,
  "energyTariff": 0.95,
  "waterBill": 2100,
  "waterTariff": 18.6,
  "priorities": ["Resíduos", "Saúde e segurança", "Comunidade"],
  "goals": "Separar 100% dos resíduos de saúde e recicláveis até 2026 (meta fictícia)."
}'::jsonb
where id = md5('nuevo-demo:org:bem-cuidar')::uuid;

update public.organizations set profile = '{
  "employees": 130,
  "state": "SC",
  "city": "Florianópolis",
  "units": ["Escritório central"],
  "areas": ["Pessoas", "Infraestrutura", "Facilities", "Compliance", "Desenvolvimento", "Atendimento"],
  "operatingDays": 250,
  "energyBill": 14500,
  "energyTariff": 0.79,
  "waterBill": 1900,
  "waterTariff": 14.1,
  "priorities": ["Diversidade e inclusão", "Governança e compliance", "Energia"],
  "goals": "Atingir 40% de mulheres em cargos de liderança até 2028 (meta fictícia)."
}'::jsonb
where id = md5('nuevo-demo:org:ponte-alta')::uuid;

-- Conferência: deve listar as 5 empresas com o nº de funcionários.
select name, profile->>'employees' as funcionarios, profile->>'state' as uf
from public.organizations
where id in (
  md5('nuevo-demo:org:vale-claro')::uuid, md5('nuevo-demo:org:ferrolinea')::uuid, md5('nuevo-demo:org:rota-verde')::uuid,
  md5('nuevo-demo:org:bem-cuidar')::uuid, md5('nuevo-demo:org:ponte-alta')::uuid
);

-- rollback (opcional): volta os perfis de demonstração para vazio.
-- update public.organizations set profile = '{}'::jsonb
-- where id in (md5('nuevo-demo:org:vale-claro')::uuid, md5('nuevo-demo:org:ferrolinea')::uuid, md5('nuevo-demo:org:rota-verde')::uuid,
--              md5('nuevo-demo:org:bem-cuidar')::uuid, md5('nuevo-demo:org:ponte-alta')::uuid);
