"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { signOut } from "next-auth/react";
import {
  Bot,
  Building2,
  CheckSquare,
  ChevronRight,
  ClipboardCheck,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import type { Role } from "@procureflow/shared";
import { cn, ROLE_STYLES } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";

interface NavItem {
  href: string;
  label: string;
  icon: typeof LayoutDashboard;
  roles?: Role[];
}

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/requests/new", label: "New request", icon: FilePlus2 },
  { href: "/assistant", label: "Assistant", icon: Bot, roles: ["REQUESTER", "ADMIN"] },
  {
    href: "/assistant/reviews",
    label: "AI reviews",
    icon: ClipboardCheck,
    roles: ["APPROVER", "FINANCE", "ADMIN"],
  },
  { href: "/approvals", label: "Approvals", icon: CheckSquare, roles: ["APPROVER", "FINANCE", "ADMIN"] },
  { href: "/vendors", label: "Vendors", icon: Building2 },
  { href: "/policies", label: "Policies", icon: ShieldCheck, roles: ["ADMIN"] },
  { href: "/audit", label: "Audit log", icon: ScrollText, roles: ["ADMIN", "FINANCE"] },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/assistant" && pathname.startsWith("/assistant/reviews")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  user,
  children,
}: {
  user: { id: string; name: string; email: string; role: Role; department: string };
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const items = NAV.filter((item) => !item.roles || item.roles.includes(user.role));
  const initials = user.name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");

  const handleSignOut = async () => {
    await signOut({ redirect: false });
    router.push("/login");
    router.refresh();
  };

  return (
    <div className="min-h-screen">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-white/10 bg-ink-900 lg:flex">
        <div className="flex h-16 items-center border-b border-white/10 px-5">
          <Link
            href="/"
            aria-label="ProcureFlow home"
            className="inline-flex w-fit transition-opacity hover:opacity-80"
          >
            <Logo tone="dark" markClassName="h-9 w-9" />
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <p className="px-3 pb-2 pt-3 font-mono text-[9px] font-medium uppercase tracking-[0.16em] text-white/30">
            Workspace
          </p>
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded px-3 py-2.5 text-sm font-medium transition",
                  active ? "text-white" : "text-white/55 hover:bg-white/[0.04] hover:text-white",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="active-sidebar-nav"
                    className="absolute inset-0 rounded bg-white/[0.07]"
                    transition={{ type: "spring", stiffness: 400, damping: 34 }}
                  />
                ) : null}
                <Icon className={cn("relative h-[18px] w-[18px]", active ? "text-brand-400" : "text-white/30")} />
                <span className="relative flex-1">{item.label}</span>
                {active ? <ChevronRight className="relative h-4 w-4 text-brand-400" /> : null}
              </Link>
            );
          })}
        </nav>

        <div className="m-3 rounded border border-white/10 bg-white/[0.04] p-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white ring-1 ring-white/15">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="truncate text-xs text-white/40">{user.email}</p>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between gap-2">
            <span
              className={cn(
                "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                ROLE_STYLES[user.role],
              )}
            >
              {user.role}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-white/50 hover:bg-white/10 hover:text-white"
              onClick={handleSignOut}
            >
              <LogOut className="h-3.5 w-3.5" />
              Sign out
            </Button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur">
          <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
            <div className="flex items-center gap-2 lg:hidden">
              <Link href="/" aria-label="ProcureFlow home" className="inline-flex">
                <Logo tone="light" markClassName="h-8 w-8" />
              </Link>
            </div>
            <div className="hidden items-center gap-2 text-xs font-medium text-slate-500 lg:flex">
              <Sparkles className="h-3.5 w-3.5 text-brand-500" />
              Durable approvals, audit-ready by default
            </div>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-slate-500 sm:block">{user.department}</span>
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                  ROLE_STYLES[user.role],
                )}
              >
                {user.role}
              </span>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden">
            {items.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium",
                    active ? "bg-brand-50 text-brand-700" : "text-slate-500 hover:bg-slate-100",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </header>

        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
