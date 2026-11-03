"use client";

import * as React from "react";
import { motion, type HTMLMotionProps } from "framer-motion";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-brand-600 text-white shadow-sm hover:bg-brand-700",
        secondary: "bg-slate-900 text-white shadow-sm hover:bg-slate-800",
        outline: "border border-slate-300 bg-white text-slate-700 shadow-sm hover:bg-slate-50",
        ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        destructive: "bg-rose-600 text-white shadow-sm hover:bg-rose-700",
        success: "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
        link: "text-brand-600 underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-5 text-[15px]",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

type MotionButtonProps = ButtonProps &
  Pick<HTMLMotionProps<"button">, "whileHover" | "whileTap" | "transition">;

const MotionButton = motion.button as unknown as React.ForwardRefExoticComponent<
  MotionButtonProps & React.RefAttributes<HTMLButtonElement>
>;

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, type = "button", disabled, ...props }, ref) => (
    <MotionButton
      ref={ref}
      type={type}
      disabled={disabled}
      whileHover={disabled ? undefined : { scale: 1.01 }}
      whileTap={disabled ? undefined : { scale: 0.985 }}
      transition={{ type: "spring", stiffness: 500, damping: 34 }}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  ),
);
Button.displayName = "Button";

export { Button, buttonVariants };
