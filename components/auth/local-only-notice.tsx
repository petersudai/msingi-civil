import { HardDrive } from "lucide-react";

export function LocalOnlyNotice() {
  return (
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start gap-3">
        <HardDrive className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-[15px] font-semibold">Working in local mode</h2>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            Saved calculations are stored on this device and work fully offline. Accounts and
            cloud backup aren&apos;t configured in this build. Once they are, sign-in and
            registration appear here, and nothing else about the tools changes.
          </p>
        </div>
      </div>
    </div>
  );
}
