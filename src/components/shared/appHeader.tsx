import Link from "next/link";
import type { ComponentProps } from "react";
import { BatteryCharging } from "lucide-react";

import { cn } from "@/lib/utils";

/** High-contrast black / white / grey app header shell.
 * Top padding includes iOS safe-area so the bar bleeds under a translucent status bar. */
export const headerBarClass =
  "relative z-30 flex items-center justify-between gap-2 border-b-2 border-neutral-800 bg-neutral-950 pb-3 pl-[max(0.75rem,env(safe-area-inset-left,0px))] pr-[max(0.75rem,env(safe-area-inset-right,0px))] pt-[calc(0.75rem+env(safe-area-inset-top,0px))] text-white shadow-[0_2px_10px_rgba(0,0,0,0.22)] sm:gap-4 sm:pb-4 sm:pl-[max(1.25rem,env(safe-area-inset-left,0px))] sm:pr-[max(1.25rem,env(safe-area-inset-right,0px))] sm:pt-[calc(1rem+env(safe-area-inset-top,0px))]";

/** Compact on mobile so action clusters do not collide with the brand/nav. */
export const headerActionsClass =
  "min-w-0 max-w-[55%] shrink overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:max-w-none sm:overflow-visible [&_[data-slot=button]]:h-9 [&_[data-slot=button]]:min-w-9 [&_[data-slot=button]]:shrink-0 [&_[data-slot=button]]:gap-1.5 [&_[data-slot=button]]:px-2.5 [&_[data-slot=button]]:text-xs [&_[data-slot=button]]:font-semibold [&_[data-slot=button]]:shadow-none sm:[&_[data-slot=button]]:h-10 sm:[&_[data-slot=button]]:min-w-0 sm:[&_[data-slot=button]]:gap-2 sm:[&_[data-slot=button]]:px-4 sm:[&_[data-slot=button]]:text-sm";

export const headerBtnOutlineClass =
  "h-9 min-w-9 shrink-0 gap-1.5 border-2 border-neutral-500 bg-transparent px-2.5 text-xs font-semibold text-white hover:border-white hover:bg-neutral-900 hover:text-white sm:h-10 sm:min-w-0 sm:gap-2 sm:px-4 sm:text-sm";

export const headerBtnPrimaryClass =
  "h-9 min-w-9 shrink-0 gap-1.5 border-2 border-white bg-white px-2.5 text-xs font-bold text-neutral-950 hover:bg-neutral-200 hover:text-neutral-950 sm:h-10 sm:min-w-0 sm:gap-2 sm:px-4 sm:text-sm";

export const headerBtnDestructiveClass =
  "h-9 min-w-9 shrink-0 gap-1.5 border-2 border-neutral-500 bg-neutral-900 px-2.5 text-xs font-semibold text-red-400 hover:border-red-400 hover:bg-neutral-800 hover:text-red-300 sm:h-10 sm:min-w-0 sm:gap-2 sm:px-4 sm:text-sm";

/** Hide label text below sm — use with an aria-label on the control. */
export const headerLabelClass = "hidden sm:inline";

export function HeaderBrand({
  subtitle,
  href = "/",
  compactOnMobile = false,
}: {
  subtitle?: string;
  href?: string;
  /** When true, hide the wordmark on narrow screens (logo + optional subtitle remain). */
  compactOnMobile?: boolean;
}) {
  return (
    <Link href={href} className="flex min-w-0 items-center gap-2 sm:gap-3.5">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border-2 border-white bg-white text-neutral-950 sm:size-11">
        <BatteryCharging className="size-4 sm:size-5" strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <h1
          className={cn(
            "truncate text-base font-bold leading-tight tracking-tight text-white sm:text-lg",
            compactOnMobile && "hidden sm:block"
          )}
        >
          Power Poker
        </h1>
        {subtitle ? (
          <p
            className={cn(
              "truncate text-xs font-medium text-neutral-400 sm:text-sm",
              compactOnMobile && "sm:mt-0"
            )}
          >
            {subtitle}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

export function HeaderActionLink({
  className,
  ...props
}: ComponentProps<typeof Link>) {
  return (
    <Link
      className={cn(
        "inline-flex h-9 min-w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border-2 border-neutral-600 bg-neutral-900 px-2.5 text-xs font-semibold text-white transition-colors touch-manipulation hover:border-white hover:bg-neutral-800 sm:h-10 sm:min-w-0 sm:justify-start sm:gap-2 sm:px-4 sm:text-sm",
        className
      )}
      {...props}
    />
  );
}

export function HeaderNavLink({
  active,
  className,
  ...props
}: ComponentProps<typeof Link> & { active?: boolean }) {
  return (
    <Link
      className={cn(
        "inline-flex h-9 min-w-9 items-center justify-center gap-1.5 rounded-md px-2.5 text-xs font-semibold transition-colors touch-manipulation sm:h-10 sm:min-w-0 sm:gap-2 sm:px-4 sm:text-sm",
        active
          ? "bg-white text-neutral-950 shadow-sm"
          : "text-neutral-400 hover:bg-neutral-800 hover:text-white",
        className
      )}
      {...props}
    />
  );
}

export function HeaderCountBadge({ count }: { count: number }) {
  return (
    <span className="rounded-full border border-neutral-950 bg-white px-2 py-0.5 text-[11px] font-bold leading-none text-neutral-950">
      {count}
    </span>
  );
}
