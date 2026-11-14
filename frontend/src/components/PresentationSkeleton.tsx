import { Skeleton } from "./Skeleton";

export function FactsSkeleton({
  title,
  label,
  count = 9,
}: {
  title: string;
  label: string;
  count?: number;
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
      <dl aria-hidden="true">
        {Array.from({ length: count }, (_, index) => (
          <div className="fact-pair" key={index}>
            <dt>
              <Skeleton className="detail-skeleton-label" />
            </dt>
            <dd>
              <Skeleton className="detail-skeleton-value" />
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function HistorySkeleton({ label }: { label: string }) {
  return (
    <div
      className="detail-history-skeleton"
      role="status"
      aria-label={label}
      aria-busy="true"
    >
      <span className="sr-only">{label}…</span>
      <div className="shopify-timeline" aria-hidden="true">
        <Skeleton className="detail-skeleton-label timeline-day" />
        {Array.from({ length: 3 }, (_, index) => (
          <div className="shopify-activity detail-skeleton-entry" key={index}>
            <span className="shopify-activity-dot" />
            <div className="shopify-activity-copy">
              <Skeleton className="detail-skeleton-label" />
              <Skeleton className="detail-skeleton-value" />
              <Skeleton className="detail-skeleton-meta" />
            </div>
          </div>
        ))}
      </div>
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
        <div className="presentation-overview">
          <FactsSkeleton
            title="Contact and organization"
            label="Loading contact and organization"
            count={6}
          />
          <FactsSkeleton
            title="Event and venue"
            label="Loading event and venue"
            count={10}
          />
        </div>
        <div className="detail-tabs" aria-hidden="true">
          <Skeleton className="detail-skeleton-tab" />
          <Skeleton className="detail-skeleton-tab" />
        </div>
        <div className="activity-pane" aria-hidden="true">
          <section className="timeline-section">
            <h2>
              Activity <Skeleton className="detail-skeleton-meta" />
            </h2>
            <div className="card note-composer">
              <Skeleton className="avatar detail-skeleton-avatar" />
              <span className="detail-skeleton-note">
                <Skeleton className="detail-skeleton-value" />
              </span>
              <div>
                <Skeleton className="detail-skeleton-meta" />
                <Skeleton className="detail-skeleton-post" />
              </div>
            </div>
          </section>
        </div>
        <HistorySkeleton label="Loading activity" />
      </div>
      <aside className="client-sidebar" aria-hidden="true">
        <section>
          <h2>Client</h2>
          <Skeleton className="detail-skeleton-avatar" />
          <h3>
            <Skeleton className="detail-skeleton-value" />
          </h3>
        </section>
        <section>
          <h2>Status</h2>
          <Skeleton className="detail-skeleton-control" />
          <Skeleton className="detail-skeleton-meta" />
          <Skeleton className="detail-skeleton-meta" />
        </section>
        <FactsSkeleton
          title="Payment and paperwork"
          label="Loading operational information"
        />
        <div className="detail-skeleton-disclosures">
          <Skeleton className="detail-skeleton-value" />
          <Skeleton className="detail-skeleton-value" />
        </div>
      </aside>
    </div>
  );
}
