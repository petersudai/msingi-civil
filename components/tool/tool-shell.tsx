import { notFound } from "next/navigation";
import { CATEGORY_LABELS, getTool } from "@/lib/tools/registry";
import { PreliminaryStamp } from "./preliminary-stamp";

/**
 * Shared page frame for every tool: category eyebrow, title, one-line
 * description, the standing preliminary stamp, then the tool's own content.
 * Tools never re-implement this chrome.
 */
export function ToolShell({
  slug,
  children,
}: {
  slug: string;
  children: React.ReactNode;
}) {
  const tool = getTool(slug);
  if (!tool) notFound();

  return (
    <div className="mx-auto max-w-5xl px-4 pt-6 md:px-6 md:pt-10">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
          {CATEGORY_LABELS[tool.category]}
        </p>
        <h1 className="mt-1 font-heading text-3xl font-bold tracking-tight md:text-4xl">
          {tool.name}
        </h1>
        <p className="mt-1.5 max-w-2xl text-[15px] text-muted-foreground">
          {tool.description}
        </p>
      </header>
      <PreliminaryStamp className="mb-6" />
      {children}
    </div>
  );
}
