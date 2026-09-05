import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolShell } from "@/components/tool/tool-shell";
import { RebarTakeoffForm } from "@/components/tools/rebar-takeoff/rebar-takeoff-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Rebar takeoff",
  description:
    "Total steel weight and a bar bending schedule for a beam, column or slab, from its dimensions and bar schedule.",
};

export default function RebarTakeoffPage() {
  return (
    <ToolShell slug="rebar-takeoff">
      {/* Suspense boundary required by useSearchParams (saved-calc loading). */}
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <RebarTakeoffForm />
      </Suspense>
    </ToolShell>
  );
}
