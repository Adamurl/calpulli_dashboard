import { staffDisplayName } from "../staff";
import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  Menu,
  Search,
  X,
  FileText,
  Home,
  Inbox,
  Mail,
  Users,
  LayoutTemplate,
  Settings,
  ArrowUpRight,
  RefreshCw,
} from "lucide-react";
import type { Inquiry, Page } from "../domain";
import { errorMessage, fetchPresentations, toInquiry } from "../presentations";
import type { LoadState, Presentation } from "../presentations";
import { Sidebar } from "./Sidebar";
import { LivePresentationIndex } from "./LivePresentationIndex";
import { fetchPresentationIndex } from "../indexData";
import { LiveDetail } from "./LiveDetail";
import { Clients, LiveTemplates } from "./WorkspacePages";
import { Modal } from "./ui";

const icons = {
  Home,
  Presentations: FileText,
  Inbox,
  Drafts: Mail,
  Clients: Users,
  Templates: LayoutTemplate,
  Settings,
} satisfies Record<Page, typeof Home>;
export function LiveWorkspace({
  session,
  page,
  detail,
  open: openPresentation,
  navigate,
  logout,
}: {
  session: Session;
  page: Page;
  detail: string | null;
  open: (id: string) => void;
  navigate: (page: Page) => void;
  logout: () => Promise<string | null>;
}) {
  const [records, setRecords] = useState<LoadState<Inquiry[]>>({
    kind: "loading",
  });
  const [attempt, setAttempt] = useState(0);
  const [indexVisited, setIndexVisited] = useState(page === "Presentations");
  const [mobile, setMobile] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState(false);
  const [query, setQuery] = useState("");
  const [toast, setToast] = useState("");
  const [indexRevision, setIndexRevision] = useState(0);
  const [indexOrder, setIndexOrder] = useState<string[]>([]);
  const [savedPresentation, setSavedPresentation] =
    useState<Presentation | null>(null);
  const [searchRecords, setSearchRecords] = useState<LoadState<Inquiry[]>>({
    kind: "loading",
  });
  const needsOverview =
    !detail && (page === "Home" || page === "Clients" || page === "Inbox");
  const [exportTarget, setExportTarget] = useState<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!needsOverview) return;
    const controller = new AbortController();
    setRecords({ kind: "loading" });
    fetchPresentations(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setRecords({ kind: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setRecords({ kind: "error", message: errorMessage(error) });
      });
    return () => controller.abort();
  }, [session.user.id, attempt, needsOverview]);
  useEffect(() => {
    if (!search) return;
    const controller = new AbortController();
    setSearchRecords({ kind: "loading" });
    const timer = setTimeout(() => {
      fetchPresentationIndex(
        {
          query: query.trim(),
          status: null,
          ascending: false,
          index: 0,
          size: 20,
        },
        controller.signal,
      )
        .then((page) => {
          if (!controller.signal.aborted)
            setSearchRecords({ kind: "ready", data: page.items });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted)
            setSearchRecords({ kind: "error", message: errorMessage(error) });
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [search, query, session.user.id]);
  useEffect(() => {
    if (page === "Presentations") setIndexVisited(true);
  }, [page, detail]);
  useEffect(() => {
    const handle = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setSearch((value) => !value);
      }
    };
    window.addEventListener("keydown", handle);
    return () => window.removeEventListener("keydown", handle);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const items = records.kind === "ready" ? records.data : [];
  const email = session.user.email || "Staff account";
  const name = staffDisplayName(session.user);
  const rememberIndexIds = useCallback(
    (ids: string[]) => setIndexOrder(ids),
    [],
  );
  const currentIndex = detail ? indexOrder.indexOf(detail) : -1;
  const previousId = currentIndex > 0 ? indexOrder[currentIndex - 1] : null;
  const nextId =
    currentIndex >= 0 ? (indexOrder[currentIndex + 1] ?? null) : null;
  function go(next: Page) {
    setMobile(false);
    navigate(next);
  }
  function open(id: string) {
    openPresentation(id);
    setSearch(false);
    setMobile(false);
    window.scrollTo(0, 0);
  }
  const Icon = icons[detail ? "Presentations" : page];
  const detailView = detail ? (
    <LiveDetail
      key={detail}
      id={detail}
      staffName={name}
      saved={savedPresentation?.id === detail ? savedPresentation : null}
      back={() => go("Presentations")}
      previousId={previousId}
      nextId={nextId}
      move={open}
      notify={setToast}
      updated={(data) => {
        setSavedPresentation(data);
        const item = toInquiry(data);
        setIndexRevision((value) => value + 1);
        setRecords((state) =>
          state.kind === "ready"
            ? {
                kind: "ready",
                data: state.data.map((existing) =>
                  existing.id === item.id ? item : existing,
                ),
              }
            : state,
        );
      }}
    />
  ) : null;
  return (
    <div className={`app-shell ${collapsed ? "sidebar-hidden" : ""}`}>
      <Sidebar
        page={page}
        navigate={go}
        name={name}
        email={email}
        logout={() => {
          void logout().then((message) => {
            if (message) setToast(message);
          });
        }}
        search={() => setSearch(true)}
        unread={0}
        drafts={0}
        open={mobile}
        collapsed={collapsed}
        close={() => {
          if (innerWidth < 760) setMobile(false);
          else setCollapsed(!collapsed);
        }}
      />
      <main className="workspace">
        <header
          className={`topbar ${!detail && page === "Templates" ? "templates-topbar" : ""}`}
        >
          <div>
            <button
              className="icon-button menu-toggle"
              aria-label="Open navigation"
              onClick={() => {
                setCollapsed(false);
                setMobile(!mobile);
              }}
            >
              <Menu size={18} />
            </button>
            {!detail && page === "Templates" ? (
              <div className="templates-heading">
                <h1>Email templates</h1>
                <p>
                  Edit the reusable messages staff can choose for each
                  presentation.
                </p>
              </div>
            ) : (
              <h1 className="page-title">
                <Icon size={17} aria-hidden="true" />
                {detail ? `Presentation #${detail.slice(0, 8)}` : page}
              </h1>
            )}
          </div>
          <div>
            <div className="header-export" ref={setExportTarget} />
            {!detail && (
              <button
                className="icon-button"
                aria-label="Search workspace"
                onClick={() => setSearch(true)}
              >
                <Search size={17} />
              </button>
            )}
          </div>
        </header>
        {page === "Presentations" ? (
          <>
            {indexVisited && (
              <div hidden={Boolean(detail)}>
                <LivePresentationIndex
                  open={open}
                  notify={setToast}
                  exportTarget={detail ? null : exportTarget}
                  revision={indexRevision}
                  visibleIdsChanged={rememberIndexIds}
                  detailMode={Boolean(detail)}
                />
              </div>
            )}
            {detail && detailView}
          </>
        ) : detail ? (
          detailView
        ) : needsOverview &&
          records.kind === "loading" &&
          page !== "Clients" ? (
          <div className="list-page" role="status">
            Loading presentations…
          </div>
        ) : needsOverview && records.kind === "error" ? (
          <div className="list-page">
            <section className="card data-error" role="alert">
              <p>{records.message}</p>
              <button
                className="button"
                onClick={() => setAttempt((value) => value + 1)}
              >
                <RefreshCw size={14} />
                Try again
              </button>
            </section>
          </div>
        ) : page === "Clients" ? (
          <Clients
            items={items}
            open={open}
            live
            loading={records.kind === "loading"}
          />
        ) : page === "Home" ? (
          <div className="list-page">
            <section className="live-overview">
              <div>
                <h2>Presentation workspace</h2>
                <p>Your requests and recorded operational information.</p>
              </div>
              <button className="button" onClick={() => go("Presentations")}>
                View presentations
                <ArrowUpRight size={14} />
              </button>
            </section>
            <div className="metric-strip">
              {[
                { label: "Total requests", value: items.length },
                {
                  label: "New inquiries",
                  value: items.filter((item) => item.status === "new").length,
                },
                {
                  label: "In review",
                  value: items.filter((item) => item.status === "reviewing")
                    .length,
                },
                {
                  label: "Booked",
                  value: items.filter((item) => item.status === "booked")
                    .length,
                },
              ].map((metric) => (
                <button
                  className="metric"
                  key={metric.label}
                  onClick={() => go("Presentations")}
                >
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </button>
              ))}
            </div>
            <section className="card live-request-list">
              <h2>Recent requests</h2>
              {items.length ? (
                items.slice(0, 8).map((item) => (
                  <button key={item.id} onClick={() => open(item.id)}>
                    <span>
                      <strong>{item.organization}</strong>
                      <small>{item.name}</small>
                    </span>
                    <span>{item.title}</span>
                    <ArrowUpRight size={14} />
                  </button>
                ))
              ) : (
                <p>No presentation requests found.</p>
              )}
            </section>
          </div>
        ) : page === "Inbox" ? (
          <div className="list-page">
            <section className="card live-request-list">
              <h2>Presentation conversations</h2>
              <p>
                Open a request to view its stored conversation. Historical
                submissions may have no email history.
              </p>
              {items.slice(0, 20).map((item) => (
                <button key={item.id} onClick={() => open(item.id)}>
                  <span>
                    <strong>{item.organization}</strong>
                    <small>{item.name}</small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
              <button
                className="text-button"
                onClick={() => go("Presentations")}
              >
                Browse all presentations
                <ArrowUpRight size={14} />
              </button>
            </section>
          </div>
        ) : page === "Settings" ? (
          <div className="list-page settings-page">
            <section className="card settings-card">
              <h2>Your account</h2>
              <p>{email}</p>
              <p>
                Staff access is verified by the backend. Presentation records,
                statuses, and internal notes are stored in Supabase.
              </p>
              <h2>Email channel</h2>
              <p>
                Staff can edit templates and create approval-gated drafts in a
                presentation’s Email thread. Delivery behavior is shown before
                sending, including mock or test delivery mode.
              </p>
            </section>
          </div>
        ) : page === "Templates" ? (
          <LiveTemplates notify={setToast} />
        ) : (
          <div className="list-page">
            <section className="card detail-facts">
              <h2>{page === "Drafts" ? "Email drafts" : "Email templates"}</h2>
              <p>
                {page === "Drafts"
                  ? "Saved backend messages appear in the conversation tab of their presentation. Draft editing and email delivery are not enabled in this workspace yet."
                  : "Template editing and email delivery will be connected in a separate email workflow update."}
              </p>
              <button className="button" onClick={() => go("Presentations")}>
                View presentations
              </button>
            </section>
          </div>
        )}
      </main>
      {search && (
        <Modal title="Search your workspace" close={() => setSearch(false)}>
          <div className="command-search">
            <Search size={18} />
            <input
              autoFocus
              aria-label="Search workspace records"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Find presentations, clients, and organizations…"
              maxLength={200}
            />
          </div>
          <div className="command-results">
            {searchRecords.kind === "loading" ? (
              <p role="status">Searching presentations…</p>
            ) : searchRecords.kind === "error" ? (
              <p role="alert">{searchRecords.message}</p>
            ) : searchRecords.data.length ? (
              searchRecords.data.map((item) => (
                <button key={item.id} onClick={() => open(item.id)}>
                  <span>
                    {item.organization}
                    <small>{item.name}</small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))
            ) : (
              <p>No matching presentations.</p>
            )}
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
          <button
            onClick={() => setToast("")}
            aria-label="Dismiss notification"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
