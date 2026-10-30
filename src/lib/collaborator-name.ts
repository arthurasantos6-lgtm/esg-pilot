import "server-only";
import { cookies } from "next/headers";
import { parseCollaboratorEmail, parseCollaboratorName } from "@/lib/access-links";

const COOKIE_NAME = "collaborator_name";
const EMAIL_COOKIE_NAME = "collaborator_email";

const sessionCookie = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
} as const;

/** Identificação declarada ao abrir o link. Sem `maxAge`: vale até o navegador ser fechado. */
export async function saveCollaboratorIdentity(name: string, email: string | null) {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, name, sessionCookie);
  if (email) cookieStore.set(EMAIL_COOKIE_NAME, email, sessionCookie);
  else cookieStore.delete(EMAIL_COOKIE_NAME);
}

export async function readCollaboratorName() {
  const cookieStore = await cookies();
  return parseCollaboratorName(cookieStore.get(COOKIE_NAME)?.value);
}

export async function readCollaboratorEmail() {
  const cookieStore = await cookies();
  return parseCollaboratorEmail(cookieStore.get(EMAIL_COOKIE_NAME)?.value).email ?? null;
}

export async function clearCollaboratorIdentity() {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
  cookieStore.delete(EMAIL_COOKIE_NAME);
}
