import Link from "next/link";
import type { ComponentProps } from "react";
import { BatteryCharging } from "lucide-react";

import { cn } from "@/lib/utils";

/** High-contrast black / white / grey app header shell. */
export const headerBarClass =
  "relative z-30 flex items-center justify-between gap-4 border-b-2 border-neutral-800 bg-neutral-950 px-5 py-4 text-white shadow-[0_2px_10px_rgba(0,0,0,0.22)]";

export const headerActionsClass =
  "[&_[data-slot=button]]:h-10 [&_[data-slot=button]]:gap-2 [&_[data-slot=button]]:px-4 [&_[data-slot=button]]:text-sm [&_[data-slot=button]]:font-semibold [&_[data-slot=button]]:shadow-none";

export const headerBtnOutlineClass =
  "h-10 gap-2 border-2 border-neutral-500 bg-transparent px-4 text-sm font-semibold text-white hover:border-white hover:bg-neutral-900 hover:text-white";

export const headerBtnPrimaryClass =
  "h-10 gap-2 border-2 border-white bg-white px-4 text-sm font-bold text-neutral-950 hover:bg-neutral-200 hover:text-neutral-950";

export const headerBtnDestructiveClass =
  "h-10 gap-2 border-2 border-neutral-500 bg-neutral-900 px-4 text-sm font-semibold text-red-400 hover:border-red-400 hover:bg-neutral-800 hover:text-red-300";

export function HeaderBrand({
  subtitle,
  href = "/",
}: {
  subtitle?: string;
  href?: string;
}) {
  return (
    <Link href={href} className="flex items-center gap-3.5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border-2 border-white bg-white text-neutral-950">
        <BatteryCharging className="size-5" strokeWidth={2.5} />
      </div>
      <div className="min-w-0">
        <h1 className="text-lg font-bold leading-tight tracking-tight text-white">
          Power Poker
        </h1>
        {subtitle ? (
          <p className="truncate text-sm font-medium text-neutral-400">
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
        "inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border-2 border-neutral-600 bg-neutral-900 px-4 text-sm font-semibold text-white transition-colors hover:border-white hover:bg-neutral-800",
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
        "inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-semibold transition-colors",
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
