"use client";

import Link from "next/link";
import { motion, type HTMLMotionProps } from "framer-motion";
import type { ComponentType, ReactNode } from "react";
import type { LinkProps } from "next/link";

const MotionLink = motion(Link) as ComponentType<PressableLinkProps>;
const MotionAnchor = motion.a as ComponentType<PressableAnchorProps>;

const press = {
  whileHover: { scale: 1.015 },
  whileTap: { scale: 0.985 },
  transition: { type: "spring" as const, stiffness: 480, damping: 32 },
};

type PressableLinkProps = Omit<LinkProps, keyof HTMLMotionProps<"a"> | "href"> &
  Omit<HTMLMotionProps<"a">, "href"> & {
    href: string;
    children: ReactNode;
  };

type PressableAnchorProps = Omit<HTMLMotionProps<"a">, "href"> & {
  href: string;
  children: ReactNode;
};

export function PressableLink({ children, ...props }: PressableLinkProps) {
  return (
    <MotionLink {...props} {...press}>
      {children}
    </MotionLink>
  );
}

export function PressableAnchor({ children, ...props }: PressableAnchorProps) {
  return (
    <MotionAnchor {...props} {...press}>
      {children}
    </MotionAnchor>
  );
}
