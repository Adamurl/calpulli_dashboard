import { useState } from "react";
import type { Inquiry, Page } from "../domain";
import type { VendorYear } from "../navigation";
import {
  Home,
  homeActivity,
  homeCount,
  homePeriodDays,
  HomeSearch,
} from "./Home";
import type { HomePeriod } from "./Home";
import { localAnalytics } from "./RequestStats";

export function DemoHome({
  items,
  vendorYear,
  navigate,
  newRequests,
  open,
  compose,
}: {
  items: Inquiry[];
  vendorYear: VendorYear;
  navigate: (page: Page) => void;
  newRequests: () => void;
  open: (id: string) => void;
  compose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [period, setPeriod] = useState<HomePeriod>("Last 30 days");
  const term = query.trim().toLowerCase();
  const results = items
    .filter((item) =>
      `${item.name} ${item.organization} ${item.title}`
        .toLowerCase()
        .includes(term),
    )
    .slice(0, 10);
  const activity = localAnalytics(items, homePeriodDays(period)).metrics.find(
    (metric) => metric.key === "presentations",
  );
  return (
    <Home
      navigate={navigate}
      newRequests={newRequests}
      period={period}
      changePeriod={setPeriod}
      search={
        <HomeSearch
          query={query}
          change={setQuery}
          open={open}
          results={{ kind: "ready", data: results }}
        />
      }
      metrics={[
        {
          label: "New emails",
          page: "Inbox",
          count: homeCount(null),
        },
        {
          label: "Presentation requests",
          page: "Presentations",
          count: activity
            ? homeActivity(activity.current, activity.previous)
            : homeCount(null),
        },
        {
          label: "MNY vendor applications",
          page: "Vendors",
          count: homeCount(null),
          scope: String(vendorYear),
        },
      ]}
      tasks={{
        awaitingReply: homeCount(items.filter((item) => item.unread).length),
        newRequests: homeCount(
          items.filter((item) => item.status === "new").length,
        ),
      }}
      extra={
        <button className="home-shortcut" type="button" onClick={compose}>
          New email
        </button>
      }
    />
  );
}
