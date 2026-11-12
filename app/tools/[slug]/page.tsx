import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Construction } from "lucide-react";
import { ToolShell } from "@/components/tool/tool-shell";
import { Button } from "@/components/ui/button";
import { getTool, TOOLS } from "@/lib/tools/registry";

/**
 * Landing page for a tool that is on the roadmap but not built yet, so a
 * bookmarked or typed link shows where it stands instead of a 404. Built tools
 * have their own folder under app/tools, which always wins over this route;
 * an unknown slug is still a real 404.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOLS.filter((t) => t.status !== "available").map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const tool = getTool(slug);
  return { title: tool ? `${tool.name} (coming soon)` : "Not found" };
}

export default async function ComingSoonToolPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const tool = getTool(slug);
  if (!tool || tool.status === "available") notFound();

  return (
    <ToolShell slug={tool.slug}>
      <div className="rounded-lg border border-dashed bg-card p-6">
        <Construction className="size-6 text-muted-foreground" aria-hidden="true" />
        <h2 className="mt-3 font-heading text-lg font-bold">Coming soon</h2>
        <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground">
          {tool.name} is planned for phase {tool.phase} of the build and isn&apos;t ready yet. The
          tools that are ready are on the home screen.
        </p>
        <Button asChild className="mt-4 h-12">
          <Link href="/">See the available tools</Link>
        </Button>
      </div>
    </ToolShell>
  );
}
