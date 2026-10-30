import "server-only";
import { cookies } from "next/headers";
import { parseCollaboratorName } from "@/lib/access-links";

const COOKIE_NAME = "collaborator_name";

/** Nome declarado ao abrir o link. Sem `maxAge`: vale até o navegador ser fechado. */
export async function saveCollaboratorName(name: string) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, name, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function readCollaboratorName() {
  const cookieStore = await cookies();
  return parseCollaboratorName(cookieStore.get(COOKIE_NAME)?.value);
}

export async function clearCollaboratorName() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}
