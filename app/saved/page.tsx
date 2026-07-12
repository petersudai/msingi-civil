"use client";

import { Bookmark, ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { type SavedCalculation, useSavedCalculations } from "@/lib/store/saved-calculations";
import { getTool } from "@/lib/tools/registry";

export default function SavedPage() {
  const items = useSavedCalculations((s) => s.items);
  const remove = useSavedCalculations((s) => s.remove);
  // localStorage-backed store: render after hydration to avoid a mismatch.
  // useSyncExternalStore gives false on the server/first client render and
  // true after, without setState-in-effect.
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 md:px-6 md:pt-10">
      <header className="mb-6">
        <h1 className="font-heading text-3xl font-bold tracking-tight md:text-4xl">
          Saved calculations
        </h1>
        <p className="mt-1.5 text-[15px] text-muted-foreground">
          Stored on this device, so they work without signal. Sign in on the
          Account screen to back them up.
        </p>
      </header>

      {!mounted ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      ) : items.length === 0 ? (
        <div className="bg-calc-grid flex flex-col items-start rounded-lg border border-dashed bg-card px-5 py-8">
          <Bookmark className="size-6 text-muted-foreground" aria-hidden="true" />
          <h2 className="mt-3 font-heading text-lg font-bold">Nothing saved yet</h2>
          <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
            Run a calculation in any tool and tap Save — it&apos;ll appear here,
            ready to reopen with the same inputs.
          </p>
          <Button asChild variant="outline" className="mt-4 h-12">
            <Link href="/tools/concrete-materials">Open concrete materials</Link>
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <SavedRow
              key={item.id}
              item={item}
              onDelete={() => {
                remove(item.id);
                toast.success("Deleted");
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function subscribeNoop(): () => void {
  return () => {};
}

function SavedRow({
  item,
  onDelete,
}: {
  item: SavedCalculation;
  onDelete: () => void;
}) {
  const tool = getTool(item.toolSlug);
  const date = new Date(item.createdAt).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  return (
    <li className="flex items-center gap-2 rounded-lg border bg-card p-2 pl-4">
      <Link
        href={tool ? `/tools/${tool.slug}?saved=${item.id}` : "#"}
        className="group flex min-h-14 flex-1 items-center justify-between gap-3"
      >
        <span>
          <span className="nums block text-[15px] font-semibold leading-snug">
            {item.title}
          </span>
          <span className="mt-0.5 block text-[12.5px] text-muted-foreground">
            {tool?.name ?? item.toolSlug} · {date}
          </span>
        </span>
        <ChevronRight
          className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
      <Button
        variant="ghost"
        size="icon"
        className="size-12 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={onDelete}
        aria-label={`Delete ${item.title}`}
      >
        <Trash2 className="size-4" aria-hidden="true" />
      </Button>
    </li>
  );
}
