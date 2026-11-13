import { Skeleton } from "./Skeleton";

export function FactsSkeleton({
  title,
  label,
}: {
  title: string;
  label: string;
}) {
  return (
    <section
      className="card detail-facts detail-skeleton-facts"
      aria-label={label}
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        {label}…
      </span>
      <h2>{title}</h2>
      <div className="detail-skeleton-fields" aria-hidden="true">
        {Array.from({ length: 6 }, (_, index) => (
          <div key={index}>
            <Skeleton className="detail-skeleton-label" />
            <Skeleton className="detail-skeleton-value" />
          </div>
        ))}
      </div>
    </section>
  );
}

export function HistorySkeleton({ label }: { label: string }) {
  return (
    <div
      className="card detail-history-skeleton"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <span className="sr-only">{label}…</span>
      {Array.from({ length: 3 }, (_, index) => (
        <div className="detail-skeleton-entry" key={index} aria-hidden="true">
          <Skeleton className="detail-skeleton-label" />
          <Skeleton className="detail-skeleton-value" />
          <Skeleton className="detail-skeleton-meta" />
        </div>
      ))}
    </div>
  );
}

export function PresentationSkeleton() {
  return (
    <div
      className="detail-grid presentation-skeleton"
      aria-label="Loading presentation"
      aria-busy="true"
    >
      <span className="sr-only" role="status">
        Loading presentation…
      </span>
      <div className="detail-main">
        <div className="detail-title" aria-hidden="true">
          <div>
            <Skeleton className="detail-skeleton-title" />
            <Skeleton className="detail-skeleton-value" />
          </div>
        </div>
        <div className="detail-tabs" aria-hidden="true">
          <Skeleton className="detail-skeleton-tab" />
          <Skeleton className="detail-skeleton-tab" />
          <Skeleton className="detail-skeleton-tab" />
        </div>
        <div className="detail-sections">
          <FactsSkeleton
            title="Contact and organization"
            label="Loading contact and organization"
          />
          <FactsSkeleton
            title="Event and venue"
            label="Loading event and venue"
          />
        </div>
      </div>
      <aside className="client-sidebar" aria-hidden="true">
        <section>
          <h2>Client</h2>
          <Skeleton className="detail-skeleton-avatar" />
          <Skeleton className="detail-skeleton-value" />
          <Skeleton className="detail-skeleton-meta" />
        </section>
        <section>
          <h2>Presentation</h2>
          <Skeleton className="detail-skeleton-value" />
          <Skeleton className="detail-skeleton-value" />
          <Skeleton className="detail-skeleton-meta" />
        </section>
      </aside>
    </div>
  );
}
