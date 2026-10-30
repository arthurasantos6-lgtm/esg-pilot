-- E-mail opcional do colaborador, usado só para confirmar o envio e avisar sobre
-- a decisão. Visível apenas ao autor e à gestão pelas políticas de ideas.
alter table public.ideas
  add column author_email text
  check (author_email is null or (length(author_email) between 5 and 254 and author_email like '%_@_%'));
