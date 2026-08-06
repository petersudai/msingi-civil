/**
 * Site-wide footer: the standing disclaimer plus attribution. Rendered once
 * in the root layout so it appears under every page, not just the home
 * screen. Sits above the fixed mobile bottom nav (main already reserves the
 * clearance via its bottom padding).
 */
export function AppFooter() {
  return (
    <footer className="mx-auto max-w-5xl px-4 py-8 md:px-6 md:py-10">
      <div className="border-t pt-5 text-center text-[12px] text-muted-foreground">
        <p>
          Msingi v0.1 · Preliminary estimation aid. Every result needs a
          licensed engineer&apos;s review before use on site.
        </p>
        <p className="mt-2">
          Built by{" "}
          <a
            href="https://sudaidevfolio.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Peter Sudai
          </a>
          . Check out more of his work.
        </p>
      </div>
    </footer>
  );
}
