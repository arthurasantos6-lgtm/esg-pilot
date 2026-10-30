/**
 * Pastas ESG da gestão. Uma ideia aparece em todas as dimensões a que se
 * relaciona (avaliação por IA ou, na falta dela, triagem por termos).
 */

export const IDEA_FOLDERS = [
  { key: "E", label: "Ambiental" },
  { key: "S", label: "Social" },
  { key: "G", label: "Governança" },
  { key: "none", label: "Sem classificação" },
] as const;

export type IdeaFolder = (typeof IDEA_FOLDERS)[number]["key"];

export function parseFolder(value: string | undefined): IdeaFolder | null {
  return IDEA_FOLDERS.find(({ key }) => key === value)?.key ?? null;
}

export type OrganizedIdea = { dimensions: string[]; potentialScore: number | null; created_at: string };

export function isInFolder(idea: Pick<OrganizedIdea, "dimensions">, folder: IdeaFolder) {
  return folder === "none" ? idea.dimensions.length === 0 : idea.dimensions.includes(folder);
}

export function countByFolder(ideas: Pick<OrganizedIdea, "dimensions">[]) {
  return Object.fromEntries(
    IDEA_FOLDERS.map(({ key }) => [key, ideas.filter((idea) => isInFolder(idea, key)).length]),
  ) as Record<IdeaFolder, number>;
}

/** Maior potencial primeiro; ideias sem nota vão para o fim, das mais recentes às mais antigas. */
export function compareByPotential(a: OrganizedIdea, b: OrganizedIdea) {
  return (b.potentialScore ?? -1) - (a.potentialScore ?? -1) || b.created_at.localeCompare(a.created_at);
}
