-- Nome informado pelo colaborador ao abrir o link. É autodeclarado (sem
-- validação) e serve apenas para a gestão saber a quem direcionar a ideia.
alter table public.ideas
  add column author_name text
  check (author_name is null or length(trim(author_name)) between 2 and 80);
