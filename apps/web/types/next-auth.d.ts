import type { DefaultSession } from "next-auth";
import type { Role } from "@procureflow/shared";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      department: string;
    } & DefaultSession["user"];
  }

  interface User {
    role: Role;
    department: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: Role;
    department?: string;
  }
}
