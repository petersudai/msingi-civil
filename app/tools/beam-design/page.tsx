import type { Metadata } from "next";
import { Suspense } from "react";
import { ToolShell } from "@/components/tool/tool-shell";
import { BeamDesignForm } from "@/components/tools/beam-design/beam-design-form";
import { Skeleton } from "@/components/ui/skeleton";

export const metadata: Metadata = {
  title: "RC beam check",
  description:
    "Flexural steel and shear links for a rectangular RC beam, checked to Eurocode 2 or BS 8110, with code clauses cited and every step shown.",
};

export default function BeamDesignPage() {
  return (
    <ToolShell slug="beam-design">
      {/* Suspense boundary required by useSearchParams (saved-calc loading). */}
      <Suspense fallback={<Skeleton className="h-96 w-full rounded-lg" />}>
        <BeamDesignForm />
      </Suspense>
    </ToolShell>
  );
}
