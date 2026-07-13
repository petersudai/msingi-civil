import Link from "next/link";

/**
 * The Msingi wordmark. "Msingi" is Swahili for foundation; the mark is
 * three foundation courses stepping up out of the ground line.
 */
export function Wordmark() {
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-sm outline-offset-4"
      aria-label="Msingi home"
    >
      <svg
        width="26"
        height="26"
        viewBox="0 0 26 26"
        aria-hidden="true"
        className="shrink-0"
      >
        <rect x="1" y="19" width="24" height="4" fill="var(--primary)" />
        <rect x="4" y="12.5" width="18" height="4" fill="var(--primary)" opacity="0.75" />
        <rect x="7" y="6" width="12" height="4" fill="var(--primary)" opacity="0.5" />
      </svg>
      <span className="flex flex-col leading-none">
        <span className="nums text-[15px] font-semibold tracking-[0.28em] text-foreground">
          MSINGI
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">
          Site engineer&apos;s toolkit
        </span>
      </span>
    </Link>
  );
}
