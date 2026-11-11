import {
  Search,
  ArrowDown,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Download,
} from "lucide-react";
import { useState } from "react";
import type { Inquiry } from "../domain";
import { dateLabel } from "../data";
import { Badge, Empty } from "./ui";
export function Requests({
  items,
  open,
  notify,
}: {
  items: Inquiry[];
  open: (id: string) => void;
  notify: (s: string) => void;
}) {
  const [tab, setTab] = useState("All"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [ascending, setAscending] = useState(false);
  const filtered = items
    .filter(
      (i) =>
        (tab === "All" ||
          (tab === "New" && i.status === "new") ||
          (tab === "In review" && i.status === "reviewing") ||
          (tab === "Booked" && i.status === "booked") ||
          (tab === "Completed" && i.status === "completed")) &&
        `${i.name} ${i.organization} ${i.id} ${i.title}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    )
    .sort((a, b) =>
      ascending ? a.date.localeCompare(b.date) : b.date.localeCompare(a.date),
    );
  function exportRows() {
    const rows = items.filter((i) =>
      selected.length ? selected.includes(i.id) : filtered.includes(i),
    );
    const text = [
      ["ID", "Client", "Organization", "Date", "Status"],
      ...rows.map((i) => [i.id, i.name, i.organization, i.date, i.status]),
    ]
      .map((row) =>
        row.map((v) => '"' + v.replaceAll('"', '""') + '"').join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "calpulli-sample-presentations.csv";
    a.click();
    URL.revokeObjectURL(url);
    notify("Sample presentations exported.");
  }
  return (
    <div className="list-page">
      <div className="page-heading">
        <div>
          <h1>Presentations</h1>
          <p>From the first hello to the final applause.</p>
        </div>
        <button className="button" onClick={exportRows}>
          <Download size={14} />
          Export {selected.length ? `(${selected.length})` : ""}
        </button>
      </div>
      <div className="small-metrics">
        {["new", "reviewing", "proposal_sent", "booked"].map((s, index) => (
          <div key={s}>
            <span>
              {
                [
                  "New inquiries",
                  "In review",
                  "Proposals sent",
                  "Booked presentations",
                ][index]
              }
            </span>
            <b>{items.filter((i) => i.status === s).length}</b>
          </div>
        ))}
      </div>
      <section className="card table-card">
        <div className="table-tabs">
          {["All", "New", "In review", "Booked", "Completed"].map((t) => (
            <button
              key={t}
              className={tab === t ? "selected" : ""}
              onClick={() => {
                setTab(t);
                setSelected([]);
              }}
            >
              {t}
              {t === "All" && <span>{items.length}</span>}
            </button>
          ))}
        </div>
        <div className="table-tools">
          <label className="search-field">
            <Search size={15} />
            <input
              aria-label="Search presentations"
              placeholder="Search and filter presentations"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <button
            className="button compact"
            onClick={() => setAscending(!ascending)}
          >
            <ArrowDown size={13} />
            Date {ascending ? "↑" : "↓"}
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>
                  <input
                    aria-label="Select all presentations"
                    type="checkbox"
                    checked={
                      filtered.length > 0 &&
                      filtered.every((i) => selected.includes(i.id))
                    }
                    onChange={(e) =>
                      setSelected(
                        e.target.checked ? filtered.map((i) => i.id) : [],
                      )
                    }
                  />
                </th>
                <th>Request</th>
                <th>Event date</th>
                <th>Client</th>
                <th>Organization</th>
                <th>Status</th>
                <th>Source</th>
                <th>Guests</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id}>
                  <td>
                    <input
                      aria-label={`Select request ${i.id}`}
                      type="checkbox"
                      checked={selected.includes(i.id)}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, i.id]
                            : selected.filter((id) => id !== i.id),
                        )
                      }
                    />
                  </td>
                  <td>
                    <button className="table-link" onClick={() => open(i.id)}>
                      #{i.id}
                    </button>
                  </td>
                  <td>{dateLabel(i.date)}</td>
                  <td>{i.name}</td>
                  <td>
                    <button
                      className="table-link normal"
                      onClick={() => open(i.id)}
                    >
                      {i.organization}
                    </button>
                  </td>
                  <td>
                    <Badge status={i.status} />
                  </td>
                  <td>
                    <span className="source-dot" />
                    {i.source === "wix"
                      ? "Wix form"
                      : i.source === "manual"
                        ? "Manual"
                        : "Historical import"}
                  </td>
                  <td>{i.guests}</td>
                  <td>
                    <button
                      className="icon-button"
                      aria-label={`Open request ${i.id}`}
                      onClick={() => open(i.id)}
                    >
                      <ArrowUpRight size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && (
          <Empty title="No presentations found">
            Try another name, organization, or request number.
          </Empty>
        )}
        <div className="pagination">
          <span>
            {filtered.length ? `1–${filtered.length}` : "0"} of{" "}
            {filtered.length} presentations{" "}
            {selected.length > 0 && `· ${selected.length} selected`}
          </span>
          <div>
            <button disabled aria-label="Previous page">
              <ChevronLeft size={14} />
            </button>
            <button disabled aria-label="Next page">
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </section>
      <p className="table-caption">
        Every presentation starts with a connection.{" "}
        <button
          className="text-button"
          onClick={() =>
            notify(
              "Wix receiver is prepared in the backend. Live activation is not enabled.",
            )
          }
        >
          About request sources
          <ArrowUpRight size={12} />
        </button>
      </p>
    </div>
  );
}
