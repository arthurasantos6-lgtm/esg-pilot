-- Desfaz a importação de 20261101_seed_knowledge_base.sql: remove só os registros
-- importados que nunca foram editados (versão 1). Conteúdo editado é preservado.
-- Prévia: rode com "rollback;" no lugar do "commit;".
begin;

delete from public.esg_knowledge_items
where origin = 'seed:base-esg-v1' and version = 1
returning slug, title;

commit;
