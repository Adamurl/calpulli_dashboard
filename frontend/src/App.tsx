import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Bell, Menu, Search, X, ArrowUpRight, Flower2 } from "lucide-react";
import { supabase, demoEnabled } from "./auth";
import { inquiries } from "./data";
import { emptyWorkspace, workspaceSchema } from "./domain";
import type { Draft, Page, Workspace } from "./domain";
import { Sidebar } from "./components/Sidebar";
import { Login } from "./components/Login";
import { Home } from "./components/Home";
import { Requests } from "./components/Requests";
import { Inbox } from "./components/Inbox";
import { Detail } from "./components/Detail";
import { Composer } from "./components/Composer";
import {
  Clients,
  Templates,
  ActivityPage,
  SettingsPage,
} from "./components/WorkspacePages";
import { Modal } from "./components/ui";
function loadWorkspace(): Workspace {
  try {
    const value = localStorage.getItem("calpulli-demo-v1");
    return value ? workspaceSchema.parse(JSON.parse(value)) : emptyWorkspace;
  } catch {
    return emptyWorkspace;
  }
}
const pages: Page[] = [
  "Home",
  "Presentations",
  "Inbox",
  "Drafts",
  "Clients",
  "Templates",
  "Activity",
  "Settings",
];
function pageFromHash(): Page {
  const raw = location.hash.slice(1);
  return pages.find((p) => p.toLowerCase() === raw) ?? "Home";
}
type Composition =
  { kind: "new"; inquiryId: string } | { kind: "edit"; draft: Draft };
export function App() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(Boolean(supabase)),
    [demo, setDemo] = useState(false),
    [page, setPage] = useState<Page>(pageFromHash),
    [detail, setDetail] = useState<string | null>(null),
    [workspace, setWorkspace] = useState(loadWorkspace),
    [composition, setComposition] = useState<Composition | null>(null),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [mobile, setMobile] = useState(false),
    [sidebarHidden, setSidebarHidden] = useState(false),
    [toast, setToast] = useState(""),
    [notifications, setNotifications] = useState(false);
  const [storageError, setStorageError] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, current) => {
      setSession(current);
      setLoading(false);
    });
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (!error) setSession(data.session);
        setLoading(false);
      })
      .catch(() => setLoading(false));
    return () => data.subscription.unsubscribe();
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("calpulli-demo-v1", JSON.stringify(workspace));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [workspace]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearch((s) => !s);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);
  useEffect(() => {
    const handler = () => {
      setPage(pageFromHash());
      setDetail(null);
    };
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(timer);
  }, [toast]);
  const items = inquiries.map((i) => ({
    ...i,
    status: workspace.statuses[i.id] ?? i.status,
    unread: i.unread && !workspace.read.includes(i.id),
  }));
  const activeItems = items.filter((i) => !workspace.archived.includes(i.id));
  const name = session?.user.email?.split("@")[0] ?? "Alex";
  const email = session?.user.email ?? "alex@example.org";
  function navigate(next: Page) {
    setPage(next);
    setDetail(null);
    setMobile(false);
    location.hash = next.toLowerCase();
  }
  function open(id: string) {
    setDetail(id);
    setSearch(false);
    setMobile(false);
    setWorkspace((w) => ({ ...w, read: [...new Set([...w.read, id])] }));
    window.scrollTo(0, 0);
  }
  function compose(inquiryId = detail ?? items[0].id) {
    setComposition({ kind: "new", inquiryId });
  }
  function save(draft: Draft) {
    setWorkspace((w) => ({
      ...w,
      drafts: [...w.drafts.filter((d) => d.id !== draft.id), draft],
    }));
    setToast(
      draft.status === "review"
        ? "Email saved for review. No email was sent."
        : "Draft saved in this browser.",
    );
  }
  async function logout() {
    if (session && supabase) {
      try {
        const { error } = await supabase.auth.signOut();
        if (error) {
          setToast("Unable to log out. Please try again.");
          return;
        }
      } catch {
        setToast("Unable to log out. Please try again.");
        return;
      }
    }
    setDemo(false);
    setSession(null);
    setDetail(null);
    setPage("Home");
    location.hash = "home";
  }
  if (loading)
    return (
      <div className="loading">
        <Flower2 size={30} />
        <p>Opening your workspace…</p>
      </div>
    );
  if (!session && !demo)
    return (
      <Login
        onDemo={() => {
          if (demoEnabled) setDemo(true);
        }}
      />
    );
  const selected = items.find((i) => i.id === detail);
  const composing = composition
    ? composition.kind === "edit"
      ? items.find((i) => i.id === composition.draft.inquiryId)
      : items.find((i) => i.id === composition.inquiryId)
    : null;
  return (
    <div className={`app-shell ${sidebarHidden ? "sidebar-hidden" : ""}`}>
      <Sidebar
        page={page}
        navigate={navigate}
        name={name}
        email={email}
        logout={() => {
          void logout();
        }}
        search={() => setSearch(true)}
        unread={activeItems.filter((i) => i.unread).length}
        drafts={workspace.drafts.length}
        open={mobile}
        close={() => {
          if (innerWidth < 760) setMobile(false);
          else setSidebarHidden(!sidebarHidden);
        }}
      />
      <main className="workspace">
        <header className="topbar">
          <div>
            <button
              className="icon-button menu-toggle"
              onClick={() => {
                setSidebarHidden(false);
                setMobile(!mobile);
              }}
              aria-label="Open navigation"
            >
              <Menu size={18} />
            </button>
            <span className="breadcrumb">
              <span className="breadcrumb-symbol">c</span>
              {selected ? "Presentations" : page}
              <span className="breadcrumb-slash">/</span>
              <span className="muted">
                {selected ? `#${selected.id}` : "Workspace"}
              </span>
            </span>
          </div>
          <div>
            <span className="preview-label">
              <span className="tiny-dot" /> Sample workspace
            </span>
            <button
              className="icon-button"
              onClick={() => setSearch(true)}
              aria-label="Search workspace"
            >
              <Search size={17} />
            </button>
            <button
              className="icon-button notification-button"
              aria-label="Notifications"
              onClick={() => setNotifications(!notifications)}
            >
              <Bell size={17} />
              {activeItems.some((i) => i.unread) && <i />}
            </button>
          </div>
        </header>
        <div className="preview-banner">
          <span>
            You're exploring fictional data.{" "}
            {session
              ? "Signed in with Supabase."
              : "Your changes stay in this browser."}
          </span>
          <button onClick={() => navigate("Settings")}>
            Preview details
            <ArrowUpRight size={12} />
          </button>
        </div>
        {storageError && (
          <p className="error storage-error" role="alert">
            Browser storage is unavailable. Changes will be lost when this page
            closes.
          </p>
        )}
        {selected ? (
          <Detail
            item={selected}
            drafts={workspace.drafts.filter((d) => d.inquiryId === selected.id)}
            notes={workspace.notes[selected.id] ?? []}
            back={() => setDetail(null)}
            compose={() => compose(selected.id)}
            edit={(draft) => setComposition({ kind: "edit", draft })}
            note={(text) => {
              setWorkspace((w) => ({
                ...w,
                notes: {
                  ...w.notes,
                  [selected.id]: [...(w.notes[selected.id] ?? []), text],
                },
              }));
              setToast("Internal note saved.");
            }}
            status={(value) => {
              setWorkspace((w) => ({
                ...w,
                statuses: { ...w.statuses, [selected.id]: value },
              }));
              setToast("Sample request status updated.");
            }}
            archive={() => {
              setWorkspace((w) => ({
                ...w,
                archived: [...w.archived, selected.id],
              }));
              setDetail(null);
              setToast(
                "Conversation archived. Reset the sample workspace to restore it.",
              );
            }}
          />
        ) : page === "Home" ? (
          <Home
            items={activeItems}
            drafts={workspace.drafts}
            navigate={navigate}
            open={open}
            compose={() => compose()}
            name={name}
            search={() => setSearch(true)}
          />
        ) : page === "Presentations" ? (
          <Requests items={items} open={open} notify={setToast} />
        ) : page === "Inbox" || page === "Drafts" ? (
          <Inbox
            key={page}
            items={activeItems}
            drafts={workspace.drafts}
            open={open}
            compose={() => compose()}
            edit={(draft) => setComposition({ kind: "edit", draft })}
            mode={page}
          />
        ) : page === "Clients" ? (
          <Clients items={items} open={open} />
        ) : page === "Templates" ? (
          <Templates
            notify={setToast}
            useTemplate={(subject, body) =>
              setComposition({
                kind: "edit",
                draft: {
                  id: crypto.randomUUID(),
                  inquiryId: items[0].id,
                  to: items[0].email,
                  subject,
                  body: body.replaceAll("[Name]", items[0].name.split(" ")[0]),
                  status: "draft",
                  updated: new Date().toISOString(),
                },
              })
            }
          />
        ) : page === "Activity" ? (
          <ActivityPage workspace={workspace} items={items} open={open} />
        ) : (
          <SettingsPage
            name={name}
            email={email}
            isDemo={!session}
            configured={Boolean(supabase)}
            notify={setToast}
          />
        )}
      </main>
      {composition && composing && (
        <Composer
          inquiry={composing}
          items={items}
          draft={composition.kind === "edit" ? composition.draft : undefined}
          save={save}
          close={() => setComposition(null)}
        />
      )}{" "}
      {search && (
        <Modal title="Search your workspace" close={() => setSearch(false)}>
          <div className="command-search">
            <Search size={18} />
            <input
              autoFocus
              aria-label="Search workspace records"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Find people, presentations, and pages…"
            />
          </div>
          <div className="command-results">
            {pages
              .filter((p) => p.toLowerCase().includes(query.toLowerCase()))
              .map((p) => (
                <button
                  key={p}
                  onClick={() => {
                    navigate(p);
                    setSearch(false);
                  }}
                >
                  <span>{p}</span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
            {items
              .filter((i) =>
                `${i.name} ${i.organization} ${i.title}`
                  .toLowerCase()
                  .includes(query.toLowerCase()),
              )
              .slice(0, 6)
              .map((i) => (
                <button key={i.id} onClick={() => open(i.id)}>
                  <span>
                    {i.organization}
                    <small>
                      {i.name} · #{i.id}
                    </small>
                  </span>
                  <ArrowUpRight size={14} />
                </button>
              ))}
          </div>
        </Modal>
      )}
      {notifications && (
        <div className="notifications card">
          <div className="section-head">
            <h2>Needs your attention</h2>
            <button
              className="icon-button"
              onClick={() => setNotifications(false)}
              aria-label="Close notifications"
            >
              <X size={16} />
            </button>
          </div>
          {activeItems
            .filter((i) => i.unread)
            .map((i) => (
              <button
                key={i.id}
                onClick={() => {
                  open(i.id);
                  setNotifications(false);
                }}
              >
                <strong>{i.name}</strong>
                <p>{i.organization}</p>
              </button>
            ))}
          {!activeItems.some((i) => i.unread) && (
            <p className="muted">You're all caught up.</p>
          )}
        </div>
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
