import { useEffect, useState } from "react";
import type { Inquiry } from "../domain";
import { errorMessage } from "../presentations";
import type { LoadState } from "../presentations";
import {
  fetchPresentationIndex,
  fetchPresentationStatistics,
} from "../indexData";
import type {
  Analytics,
  IndexPage,
  IndexQuery,
  StatisticsDays,
} from "../indexData";
import { Requests } from "./Requests";
import { RequestStats } from "./RequestStats";

export function LivePresentationIndex({
  open,
  notify,
  exportTarget,
  revision = 0,
}: {
  open: (id: string) => void;
  notify: (message: string) => void;
  exportTarget: HTMLElement | null;
  revision?: number;
}) {
  const [filters, setFilters] = useState<IndexQuery>({
    query: "",
    status: null,
    ascending: false,
    index: 0,
    size: 10,
  });
  const [debounced, setDebounced] = useState("");
  const [days, setDays] = useState<StatisticsDays>(1);
  const [tableAttempt, retryTable] = useState(0);
  const [statsAttempt, retryStats] = useState(0);
  const normalizedQuery = filters.query.trim();
  const request = { ...filters, query: debounced };
  const key = JSON.stringify(request);
  const [table, setTable] = useState<{
    key: string;
    state: LoadState<IndexPage>;
  }>({ key: "", state: { kind: "loading" } });
  const [stats, setStats] = useState<{
    days: StatisticsDays;
    state: LoadState<Analytics>;
  }>({ days: 1, state: { kind: "loading" } });
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters.query.trim()), 200);
    return () => clearTimeout(timer);
  }, [filters.query]);
  useEffect(() => {
    if (normalizedQuery !== debounced) return;
    const controller = new AbortController();
    setTable({ key, state: { kind: "loading" } });
    fetchPresentationIndex({ ...filters, query: debounced }, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        if (data.total > 0 && filters.index * filters.size >= data.total) {
          setFilters((previous) => ({
            ...previous,
            index: Math.max(0, Math.ceil(data.total / previous.size) - 1),
          }));
          return;
        }
        setTable({ key, state: { kind: "ready", data } });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setTable({
            key,
            state: { kind: "error", message: errorMessage(error) },
          });
      });
    return () => controller.abort();
  }, [key, normalizedQuery, tableAttempt, revision]);
  useEffect(() => {
    const controller = new AbortController();
    setStats({ days, state: { kind: "loading" } });
    fetchPresentationStatistics(days, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setStats({ days, state: { kind: "ready", data } });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setStats({
            days,
            state: { kind: "error", message: errorMessage(error) },
          });
      });
    return () => controller.abort();
  }, [days, statsAttempt, revision]);
  const tableState: LoadState<IndexPage> =
    table.key === key && normalizedQuery === debounced
      ? table.state
      : { kind: "loading" };
  const statsState: LoadState<Analytics> =
    stats.days === days ? stats.state : { kind: "loading" };
  async function exportData(selected: string[], signal: AbortSignal) {
    const results: Inquiry[] = [];
    for (let index = 0; ; index++) {
      const page = await fetchPresentationIndex(
        { ...filters, query: debounced, size: 100, index },
        signal,
      );
      results.push(
        ...page.items.filter(
          (item) => !selected.length || selected.includes(item.id),
        ),
      );
      if ((index + 1) * 100 >= page.total) return results;
    }
  }
  return (
    <Requests
      items={tableState.kind === "ready" ? tableState.data.items : []}
      open={open}
      notify={notify}
      exportTarget={exportTarget}
      live
      statistics={
        <RequestStats
          remote={{
            days,
            state: statsState,
            change: setDays,
            retry: () => retryStats((value) => value + 1),
          }}
        />
      }
      remote={{
        selectionRevision: revision,
        filters,
        total: tableState.kind === "ready" ? tableState.data.total : 0,
        totalAll: tableState.kind === "ready" ? tableState.data.total_all : 0,
        loading: tableState.kind === "loading",
        error: tableState.kind === "error" ? tableState.message : null,
        change: setFilters,
        retry: () => retryTable((value) => value + 1),
        exportData,
      }}
    />
  );
}
