/** Nome de exibição de um membro; colaboradores por link não têm e-mail. */
export function memberDisplayName(member: { user_id: string; email: string | null }) {
  return member.email ?? `Colaborador por link · ${member.user_id.slice(0, 8)}`;
}
