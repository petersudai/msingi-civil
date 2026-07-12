import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { PreliminaryStamp } from "@/components/tool/preliminary-stamp";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { type ToolDefinition, toolHref, toolsByCategory } from "@/lib/tools/registry";

export default function HomePage() {
  return (
    <>
      {/* Hero — the thesis: calculations with nothing hidden. */}
      <section className="bg-calc-grid border-b">
        <div className="mx-auto max-w-5xl px-4 py-12 md:px-6 md:py-16">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Built for site work · Kenya &amp; East Africa
          </p>
          <h1 className="mt-3 max-w-2xl font-heading text-4xl font-bold leading-[1.04] tracking-tight md:text-6xl">
            Site calculations,
            <br />
            shown in full.
          </h1>
          <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted-foreground md:text-base">
            Concrete takeoffs, rebar schedules and design checks that read like a
            senior engineer&apos;s calc sheet — every formula, every assumption
            and the code basis, right on the page. Built to be used one-handed,
            in the sun, mid-pour.
          </p>
          <div className="mt-7">
            <Button asChild size="lg" className="h-12 px-6 text-[15px]">
              <Link href="/tools/concrete-materials">
                Start a concrete takeoff
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
          <PreliminaryStamp className="mt-10 max-w-md -rotate-1" />
        </div>
      </section>

      {/* Toolbox */}
      <section className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-12">
        <div className="space-y-8">
          {toolsByCategory().map((group) => (
            <div key={group.category}>
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                {group.label}
              </h2>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {group.tools.map((tool) =>
                  tool.status === "available" ? (
                    <AvailableToolCard key={tool.slug} tool={tool} />
                  ) : (
                    <ComingSoonCard key={tool.slug} tool={tool} />
                  ),
                )}
              </div>
            </div>
          ))}
        </div>
        <p className="mt-12 border-t pt-5 text-center text-[12px] text-muted-foreground">
          Msingi v0.1 · Preliminary estimation aid — every result needs a licensed
          engineer&apos;s review before use on site.
        </p>
      </section>
    </>
  );
}

function AvailableToolCard({ tool }: { tool: ToolDefinition }) {
  const Icon = tool.icon;
  return (
    <Link
      href={toolHref(tool)}
      className="group flex min-h-[5.5rem] items-start gap-3.5 rounded-lg border bg-card p-4 transition-colors hover:border-primary"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-accent text-primary">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex-1">
        <span className="flex items-center gap-1.5 text-[15px] font-semibold">
          {tool.name}
          <ArrowRight
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden="true"
          />
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
          {tool.description}
        </span>
      </span>
    </Link>
  );
}

function ComingSoonCard({ tool }: { tool: ToolDefinition }) {
  const Icon = tool.icon;
  return (
    <div className="flex min-h-[5.5rem] items-start gap-3.5 rounded-lg border border-dashed p-4 opacity-75">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground">
        <Icon className="size-5" aria-hidden="true" />
      </span>
      <span className="flex-1">
        <span className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-muted-foreground">
          {tool.name}
          <Badge variant="outline" className="text-[10px] font-medium uppercase tracking-wide">
            In build · Phase {tool.phase}
          </Badge>
        </span>
        <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
          {tool.description}
        </span>
      </span>
    </div>
  );
}
