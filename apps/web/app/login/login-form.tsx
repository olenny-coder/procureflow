"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { ArrowRight, Loader2, LockKeyhole, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { cn, ROLE_STYLES } from "@/lib/utils";
import type { Role } from "@procureflow/shared";

const DEMO_ACCOUNTS: Array<{ role: Role; email: string; label: string; blurb: string }> = [
  {
    role: "REQUESTER",
    email: "requester@procureflow.dev",
    label: "Requester",
    blurb: "Submit and track purchases",
  },
  {
    role: "APPROVER",
    email: "approver@procureflow.dev",
    label: "Approver",
    blurb: "Manager approval step",
  },
  {
    role: "FINANCE",
    email: "finance@procureflow.dev",
    label: "Finance",
    blurb: "Budget and PO controls",
  },
  {
    role: "ADMIN",
    email: "admin@procureflow.dev",
    label: "Admin",
    blurb: "Policies, vendors, audit",
  },
];

const DEMO_PASSWORD = "Demo1234!";

export function LoginForm({ callbackUrl }: { callbackUrl: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("requester@procureflow.dev");
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (!result || result.error) {
        setError("Those credentials did not match an active account.");
        return;
      }
      router.push(callbackUrl.startsWith("/") ? callbackUrl : "/dashboard");
      router.refresh();
    } catch {
      setError("Unable to sign in right now. Check that the web app and database are running.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-8">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label htmlFor="email">Work email</Label>
          <div className="relative">
            <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="pl-10"
              placeholder="you@company.com"
              required
            />
          </div>
        </div>
        <div>
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pl-10"
              placeholder="••••••••"
              required
            />
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Sign in
          {!loading ? <ArrowRight className="h-4 w-4" /> : null}
        </Button>
      </form>

      <div className="mt-8">
        <div className="flex items-center gap-3">
          <div className="h-px flex-1 bg-slate-200" />
          <span className="text-xs font-medium uppercase tracking-wider text-slate-400">
            Demo accounts
          </span>
          <div className="h-px flex-1 bg-slate-200" />
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(DEMO_PASSWORD);
                setError(null);
              }}
              className={cn(
                "rounded-xl border p-3 text-left transition hover:border-brand-300 hover:bg-brand-50/40",
                email === account.email ? "border-brand-300 bg-brand-50/50" : "border-slate-200 bg-white",
              )}
            >
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold tracking-wide ring-1 ring-inset",
                  ROLE_STYLES[account.role],
                )}
              >
                {account.label}
              </span>
              <p className="mt-2 truncate text-xs font-medium text-slate-700">{account.email}</p>
              <p className="mt-0.5 text-[11px] text-slate-500">{account.blurb}</p>
            </button>
          ))}
        </div>
        <p className="mt-3 text-center text-[11px] text-slate-400">
          Local demo password: <span className="font-mono text-slate-500">{DEMO_PASSWORD}</span>
        </p>
      </div>
    </div>
  );
}
