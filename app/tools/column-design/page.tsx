import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolShell } from "@/components/tool/tool-shell";
import { ColumnDesignForm } from "@/components/tools/column-design/column-design-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "RC column check",
  description:
    "Axial and bending capacity of a rectangular RC column with slenderness, interaction diagram and steel limits, checked to Eurocode 2 or BS 8110.",
};

export default function ColumnDesignPage() {
  return (
    <ToolShell slug="column-design">
      {/* Suspense boundary required by useSearchParams (saved-calc loading). */}
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <ColumnDesignForm />
      </Suspense>
    </ToolShell>
  );
}
