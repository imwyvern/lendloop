import Link from "next/link";

export default function NotFound() {
  return (
    <section className="page-shell">
      <div className="empty-state">
        <span className="empty-icon" aria-hidden="true">
          ↗
        </span>
        <h1>This corner of the neighborhood is empty.</h1>
        <p>
          The page may have moved. There&apos;s still plenty to discover on the
          tool board.
        </p>
        <Link href="/tools" className="button button-primary">
          Browse tools
        </Link>
      </div>
    </section>
  );
}
