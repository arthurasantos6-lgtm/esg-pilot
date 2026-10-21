/**
 * Quem pode criar ideias: somente colaboradores (role "member") que entraram
 * pelo link de acesso da empresa. A gestão avalia ideias e conduz projetos.
 * Espelha a função SQL `is_link_collaborator`, que é a garantia definitiva.
 */
export function canCreateIdeas(membership: { role: string; access_link_id: string | null }) {
  return membership.role === "member" && membership.access_link_id !== null;
}

export const CANNOT_CREATE_IDEAS_MESSAGE =
  "Ideias são enviadas pelos colaboradores, pelo link de acesso da empresa. A gestão avalia as ideias e conduz os projetos.";
