import { cn } from "@/lib/utils";

export function LogoMark({
  className,
  title = "ProcureFlow",
}: {
  className?: string;
  title?: string;
}) {
  return (
    <svg
      viewBox="0 0 32 32"
      role="img"
      aria-label={title}
      className={cn("h-8 w-8 shrink-0", className)}
      xmlns="http://www.w3.org/2000/svg"
    >
      <rect x="0.5" y="0.5" width="31" height="31" rx="1.5" fill="#0b0e14" stroke="currentColor" strokeOpacity="0.22" />
      <path
        d="M9 8.5h8.7c4.3 0 7.1 2.4 7.1 6.1s-2.8 6.1-7.1 6.1H13v4.8H9V8.5Z"
        fill="currentColor"
      />
      <path d="M13 12.5h4.4c1.7 0 2.7.8 2.7 2.1s-1 2.1-2.7 2.1H13v-4.2Z" fill="#0b0e14" />
      <path
        d="M20.5 24.2 24.8 27l-4.3 2.8"
        stroke="#2f6df6"
        strokeWidth="2.4"
        fill="none"
        strokeLinecap="square"
      />
    </svg>
  );
}

export function Logo({
  tone = "dark",
  className,
  markClassName,
  showWordmark = true,
}: {
  /** `dark` is for dark surfaces (white wordmark), `light` for light surfaces. */
  tone?: "dark" | "light";
  className?: string;
  markClassName?: string;
  showWordmark?: boolean;
}) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark
        className={cn(tone === "dark" ? "text-white" : "text-ink-900", markClassName)}
      />
      {showWordmark ? (
        <span
          className={cn(
            "text-[17px] font-semibold leading-none tracking-[-0.035em]",
            tone === "dark" ? "text-white" : "text-ink-900",
          )}
        >
          ProcureFlow
        </span>
      ) : null}
    </span>
  );
}
