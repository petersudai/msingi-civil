"use client";

import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useSavedCalculations } from "@/lib/store/saved-calculations";

/**
 * Saves the current inputs locally (works offline). The record reopens the
 * tool with the same inputs from the Saved screen.
 */
export function SaveCalcButton({
  toolSlug,
  title,
  inputs,
}: {
  toolSlug: string;
  /** Auto-generated human title, e.g. "Class 20 (1:2:4) · 6 m³". */
  title: string;
  inputs: Record<string, string>;
}) {
  const save = useSavedCalculations((s) => s.save);

  return (
    <Button
      size="sm"
      variant="outline"
      className="h-10"
      onClick={() => {
        save({ toolSlug, title, inputs });
        toast.success("Saved on this device", {
          description: "Find it under Saved. Sign in on the Account screen to back up.",
        });
      }}
    >
      <Bookmark aria-hidden="true" />
      Save
    </Button>
  );
}
