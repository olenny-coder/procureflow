import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import type { Role } from "@procureflow/shared";
import { authOptions } from "./auth";

export interface PageUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  department: string;
}

export async function getSessionUser(): Promise<PageUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;
  return {
    id: session.user.id,
    name: session.user.name ?? "Unknown user",
    email: session.user.email ?? "",
    role: session.user.role,
    department: session.user.department,
  };
}

export async function requirePageUser(): Promise<PageUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}
