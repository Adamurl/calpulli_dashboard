import { useEffect, useState } from "react";
import type { Inquiry, Page } from "../domain";
import {
  fetchPresentationIndex,
  fetchPresentationStatistics,
} from "../indexData";
import type { VendorYear } from "../navigation";
import { getOutlookStatistics } from "../outlook";
import { errorMessage } from "../presentations";
import type { LoadState } from "../presentations";
import { fetchVendorActivity } from "../vendorData";
import {
  Home,
  homeActivity,
  homeCount,
  homePeriodDays,
  HomeSearch,
} from "./Home";
import type { HomePeriod } from "./Home";

type MetricCount = ReturnType<typeof homeCount>;
const loading = { kind: "loading" } as const;

export function LiveHome({
  vendorYear,
  navigate,
  newRequests,
  open,
}: {
  vendorYear: VendorYear;
  navigate: (page: Page) => void;
  newRequests: () => void;
  open: (id: string) => void;
}) {
  const [period, setPeriod] = useState<HomePeriod>("Last 30 days");
  const days = homePeriodDays(period);
  const [emailCount, setEmailCount] = useState<MetricCount>(loading);
  const [presentations, setPresentations] = useState<MetricCount>(loading);
  const [pendingRequests, setPendingRequests] = useState<MetricCount>(loading);
  const [awaitingReply, setAwaitingReply] = useState<MetricCount>(loading);
  const [vendors, setVendors] = useState<MetricCount>(loading);
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{
    query: string;
    results: LoadState<Inquiry[]>;
  }>({ query: "", results: loading });
  const term = query.trim();

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    async function load<T>(
      read: Promise<T>,
      success: (data: T) => void,
      fail: () => void,
    ) {
      try {
        const data = await read;
        if (!signal.aborted) success(data);
      } catch {
        if (!signal.aborted) fail();
      }
    }
    void load(
      getOutlookStatistics(days, signal),
      (data) => {
        setEmailCount({
          kind: "ready",
          value: data.received,
          comparison: {
            daily: data.daily_received,
            previous: data.previously_received,
          },
        });
        setAwaitingReply(homeCount(data.awaiting_reply));
      },
      () => {
        setEmailCount(homeCount(null));
        setAwaitingReply((count) =>
          count.kind === "ready" ? count : homeCount(null),
        );
      },
    );
    void load(
      fetchPresentationStatistics(days, signal),
      (data) => {
        const activity = data.metrics.find(
          (metric) => metric.key === "presentations",
        );
        setPresentations(
          activity
            ? homeActivity(activity.current, activity.previous)
            : homeCount(null),
        );
      },
      () => setPresentations(homeCount(null)),
    );
    void load(
      fetchVendorActivity(vendorYear, days, signal),
      (data) => setVendors(homeActivity(data.current, data.previous)),
      () => setVendors(homeCount(null)),
    );
    return () => controller.abort();
  }, [days, vendorYear]);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;
    void fetchPresentationIndex(
      { query: "", status: "new", ascending: false, index: 0, size: 1 },
      signal,
    ).then(
      (data) => {
        if (!signal.aborted) setPendingRequests(homeCount(data.total));
      },
      () => {
        if (!signal.aborted) setPendingRequests(homeCount(null));
      },
    );
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!term) return;
    const controller = new AbortController();
    setMatches({ query: term, results: loading });
    const timer = window.setTimeout(async () => {
      try {
        const page = await fetchPresentationIndex(
          { query: term, status: null, ascending: false, index: 0, size: 10 },
          controller.signal,
        );
        if (!controller.signal.aborted)
          setMatches({
            query: term,
            results: { kind: "ready", data: page.items },
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setMatches({
            query: term,
            results: { kind: "error", message: errorMessage(error) },
          });
      }
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [term]);

  return (
    <Home
      navigate={navigate}
      newRequests={newRequests}
      period={period}
      changePeriod={(next) => {
        if (homePeriodDays(next) !== days) {
          setEmailCount(loading);
          setPresentations(loading);
          setVendors(loading);
        }
        setPeriod(next);
      }}
      replyDescription="Inbox conversations from the last 30 days with no later reply in Sent Items"
      search={
        <HomeSearch
          query={query}
          change={setQuery}
          open={open}
          results={matches.query === term ? matches.results : loading}
        />
      }
      metrics={[
        {
          label: "New emails",
          page: "Inbox",
          count: emailCount,
        },
        {
          label: "Presentation requests",
          page: "Presentations",
          count: presentations,
        },
        {
          label: "MNY vendor applications",
          page: "Vendors",
          count: vendors,
          scope: String(vendorYear),
        },
      ]}
      tasks={{
        awaitingReply,
        newRequests: pendingRequests,
      }}
    />
  );
}
