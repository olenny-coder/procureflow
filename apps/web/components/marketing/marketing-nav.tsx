"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Menu, X } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { PressableLink } from "@/components/motion/pressable";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#workflow", label: "Workflow" },
  { href: "#controls", label: "Controls" },
  { href: "#security", label: "Security" },
];

export function MarketingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={cn(
        "sticky top-0 z-50 border-b transition-colors duration-300",
        scrolled
          ? "border-white/10 bg-ink-900/95 backdrop-blur-md"
          : "border-white/10 bg-ink-900",
      )}
    >
      <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between gap-6 px-5 sm:px-8">
        <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} className="shrink-0">
          <Link href="/" aria-label="ProcureFlow home">
            <Logo tone="dark" markClassName="h-8 w-8" />
          </Link>
        </motion.div>

        <nav className="hidden items-center gap-7 lg:flex">
          {LINKS.map((link) => (
            <motion.a
              key={link.href}
              href={link.href}
              whileHover={{ y: -1 }}
              transition={{ type: "spring", stiffness: 500, damping: 30 }}
              className="text-[13px] font-medium text-white/60 transition hover:text-white"
            >
              {link.label}
            </motion.a>
          ))}
        </nav>

        <div className="hidden items-center gap-5 lg:flex">
          <Link href="/login" className="text-[13px] font-medium text-white/60 transition hover:text-white">
            Sign in
          </Link>
          <PressableLink
            href="/login"
            className="group inline-flex h-9 items-center gap-2 bg-brand-500 px-4 text-[13px] font-medium text-white transition hover:bg-brand-400"
          >
            Open app
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </PressableLink>
        </div>

        <motion.button
          type="button"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((current) => !current)}
          whileTap={{ scale: 0.94 }}
          className="flex h-9 w-9 items-center justify-center border border-white/15 text-white lg:hidden"
        >
          {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
        </motion.button>
      </div>

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            key="mobile-menu"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden border-t border-white/10 bg-ink-900 lg:hidden"
          >
            <div className="px-5 pb-5 pt-3">
              <nav className="flex flex-col">
                {LINKS.map((link) => (
                  <a
                    key={link.href}
                    href={link.href}
                    onClick={() => setOpen(false)}
                    className="border-b border-white/10 py-3 text-sm text-white/70"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>
              <div className="mt-4 flex items-center gap-3">
                <Link
                  href="/login"
                  className="flex h-10 flex-1 items-center justify-center border border-white/20 text-sm text-white"
                >
                  Sign in
                </Link>
                <PressableLink
                  href="/login"
                  className="flex h-10 flex-1 items-center justify-center gap-2 bg-brand-500 text-sm font-medium text-white"
                >
                  Open app
                  <ArrowRight className="h-4 w-4" />
                </PressableLink>
              </div>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </header>
  );
}
