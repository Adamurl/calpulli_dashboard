import { useEffect, useState } from "react";
import { apiFetch } from "../api";
import type { Inquiry } from "../domain";
import { fetchPresentationIndex } from "../indexData";
import { vendorYears } from "../navigation";
import type { VendorYear } from "../navigation";
import { outlookError } from "../outlook";
import type { LoadState } from "../presentations";
import { vendorDetailSchema, vendorListSchema } from "../vendorData";

export type ComposeContext = "other" | "presentation" | "vendor";

type ContactResult = {
  id: string;
  label: string;
  item?: Inquiry;
};

export type ContactSelection = {
  address: string;
  presentation?: Inquiry;
};

export function OutlookContactPicker({
  kind,
  change,
}: {
  kind: Exclude<ComposeContext, "other">;
  change: (value: ContactSelection | null) => void;
}) {
  const [year, setYear] = useState<VendorYear>(vendorYears[0]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState("");
  const [results, setResults] = useState<LoadState<ContactResult[]>>({
    kind: "loading",
  });
  const [contactState, setContactState] = useState<LoadState<string> | null>(
    null,
  );
  const target = kind === "presentation" ? "presentation client" : "MNY vendor";

  useEffect(() => {
    const controller = new AbortController();
    setResults({ kind: "loading" });
    const timer = setTimeout(async () => {
      try {
        const data =
          kind === "presentation"
            ? (
                await fetchPresentationIndex(
                  {
                    query: query.trim(),
                    status: null,
                    index: 0,
                    size: 20,
                    ascending: false,
                  },
                  controller.signal,
                )
              ).items
                .filter((item) => item.email)
                .map((item) => ({
                  id: item.id,
                  label: `${item.organization} · ${item.name}`,
                  item,
                }))
            : (
                await apiFetch(
                  `/api/v1/mny/vendors?${new URLSearchParams({
                    limit: "20",
                    offset: "0",
                    event_year: String(year),
                    q: query.trim(),
                  })}`,
                  { signal: controller.signal },
                ).then(async (response) =>
                  vendorListSchema.parse(await response.json()),
                )
              ).items.map((item) => ({
                id: item.id,
                label:
                  item.business_name ?? item.contact_name ?? "Unnamed vendor",
              }));
        if (!controller.signal.aborted) setResults({ kind: "ready", data });
      } catch (failure) {
        if (!controller.signal.aborted)
          setResults({ kind: "error", message: outlookError(failure) });
      }
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [kind, query, year]);

  useEffect(() => {
    if (!selected || kind !== "vendor") return;
    const controller = new AbortController();
    setContactState({ kind: "loading" });
    apiFetch(
      `/api/v1/mny/vendors/${encodeURIComponent(selected)}?event_year=${year}`,
      { signal: controller.signal },
    )
      .then(async (response) => vendorDetailSchema.parse(await response.json()))
      .then((item) => {
        if (controller.signal.aborted) return;
        const address = item.email ?? "";
        setContactState({ kind: "ready", data: address });
        if (address) change({ address });
      })
      .catch((failure: unknown) => {
        if (!controller.signal.aborted)
          setContactState({ kind: "error", message: outlookError(failure) });
      });
    return () => controller.abort();
  }, [change, kind, selected, year]);

  function clear() {
    setSelected("");
    setContactState(null);
    change(null);
  }

  return (
    <>
      {kind === "vendor" && (
        <label>
          Event year
          <select
            value={year}
            onChange={(event) => {
              const next = vendorYears.find(
                (entry) => String(entry) === event.target.value,
              );
              if (next) {
                clear();
                setYear(next);
              }
            }}
          >
            {vendorYears.map((entry) => (
              <option key={entry}>{entry}</option>
            ))}
          </select>
        </label>
      )}
      <label>
        Search {target}
        <input
          type="search"
          value={query}
          onChange={(event) => {
            clear();
            setQuery(event.target.value);
          }}
          maxLength={100}
        />
      </label>
      {results.kind === "loading" && (
        <p role="status">Finding {target} records…</p>
      )}
      {results.kind === "error" && (
        <p role="alert" className="error">
          {results.message}
        </p>
      )}
      {results.kind === "ready" && (
        <label>
          {kind === "presentation" ? "Presentation client" : "MNY vendor"}
          <select
            required
            value={selected}
            onChange={(event) => {
              clear();
              setSelected(event.target.value);
              const entry = results.data.find(
                (item) => item.id === event.target.value,
              );
              if (entry?.item)
                change({ address: entry.item.email, presentation: entry.item });
            }}
          >
            <option value="">Choose a record</option>
            {results.data.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {results.kind === "ready" && !results.data.length && (
        <p className="muted">No matching records. Try another search.</p>
      )}
      {contactState?.kind === "loading" && (
        <p role="status">Loading vendor email address…</p>
      )}
      {contactState?.kind === "error" && (
        <p role="alert" className="error">
          {contactState.message}
        </p>
      )}
      {contactState?.kind === "ready" && !contactState.data && (
        <p className="notice">This vendor record has no email address.</p>
      )}
    </>
  );
}
