import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolShell } from "@/components/tool/tool-shell";
import { ConcreteMaterialsForm } from "@/components/tools/concrete-materials/concrete-materials-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "Concrete materials",
  description:
    "Cement bags, sand and ballast tonnage for any concrete volume and mix class — dry-volume method, full working shown.",
};

export default function ConcreteMaterialsPage() {
  return (
    <ToolShell slug="concrete-materials">
      {/* Suspense boundary required by useSearchParams (saved-calc loading). */}
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <ConcreteMaterialsForm />
      </Suspense>
    </ToolShell>
  );
}
