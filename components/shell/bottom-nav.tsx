"use client";

import { Bookmark, UserRound, Wrench } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const TABS = [
  { href: "/", label: "Tools", icon: Wrench },
  { href: "/saved", label: "Saved", icon: Bookmark },
  { href: "/account", label: "Account", icon: UserRound },
] as const;

/**
 * Fixed bottom tab bar, the primary navigation on a phone. Targets are a
 * full third of the screen wide and 56px tall for gloved/one-thumb use.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <div className="grid h-14 grid-cols-3">
        {TABS.map((tab) => {
          const active =
            tab.href === "/"
              ? pathname === "/" || pathname.startsWith("/tools")
              : pathname.startsWith(tab.href);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <Icon
                className="size-5"
                strokeWidth={active ? 2.4 : 2}
                aria-hidden="true"
              />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
