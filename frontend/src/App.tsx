import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { z } from "zod";
import {
  Bell,
  Menu,
  Search,
  X,
  ArrowUpRight,
  Home as HomeIcon,
  FileText,
  Inbox as InboxIcon,
  Mail,
  Users,
  LayoutTemplate,
  Settings,
} from "lucide-react";
import { supabase, demoEnabled, passwordRecovery } from "./auth";
import { apiFetch, ApiError } from "./api";
import { inquiries } from "./data";
import { emptyWorkspace, workspaceSchema } from "./domain";
import type { Draft, Page, Workspace } from "./domain";
import {
  pages,
  pagePath,
  pageFromLocation,
  detailFromLocation,
} from "./navigation";
import { Sidebar } from "./components/Sidebar";
import { Login } from "./components/Login";
import { PasswordReset, ForgotPassword } from "./components/PasswordReset";
import { Home } from "./components/Home";
import { Requests } from "./components/Requests";
import { Inbox } from "./components/Inbox";
import { Detail } from "./components/Detail";
import { LiveWorkspace } from "./components/LiveWorkspace";
import { Composer } from "./components/Composer";
import { Clients, Templates, SettingsPage } from "./components/WorkspacePages";
import logo from "./assets/Calpulli_Logo.png";
import { Modal } from "./components/ui";
function loadWorkspace(): Workspace {
  try {
    const value = localStorage.getItem("calpulli-demo-v1");
    return value ? workspaceSchema.parse(JSON.parse(value)) : emptyWorkspace;
  } catch {
    return emptyWorkspace;
  }
}
const pageIcons = {
  Home: HomeIcon,
  Presentations: FileText,
  Inbox: InboxIcon,
  Drafts: Mail,
  Clients: Users,
  Templates: LayoutTemplate,
  Settings,
} satisfies Record<Page, typeof HomeIcon>;
type Composition =
  { kind: "new"; inquiryId: string } | { kind: "edit"; draft: Draft };
type ApiAccess =
  | { kind: "checking" }
  | { kind: "allowed"; accessToken: string; userId: string }
  | { kind: "denied"; accessToken: string; message: string };
const apiUserSchema = z.object({ id: z.uuid() });
export function App() {
  if (passwordRecovery) return <PasswordReset />;
  if (location.pathname === "/forgot-password") return <ForgotPassword />;
  return <WorkspaceApp />;
}
function WorkspaceApp() {
  const [session, setSession] = useState<Session | null>(null),
    [loading, setLoading] = useState(Boolean(supabase)),
    [demo, setDemo] = useState(false),
    [page, setPage] = useState<Page>(pageFromLocation),
    [detail, setDetail] = useState<string | null>(detailFromLocation),
    [workspace, setWorkspace] = useState(loadWorkspace),
    [composition, setComposition] = useState<Composition | null>(null),
    [search, setSearch] = useState(false),
    [query, setQuery] = useState(""),
    [mobile, setMobile] = useState(false),
    [sidebarHidden, setSidebarHidden] = useState(false),
    [toast, setToast] = useState(""),
    [notifications, setNotifications] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const [exportTarget, setExportTarget] = useState<HTMLDivElement | null>(null);
  const [apiAccess, setApiAccess] = useState<ApiAccess>({ kind: "checking" });
  const [accessAttempt, setAccessAttempt] = useState(0);
  const signedIn = Boolean(session) || demo;
  useEffect(() => {
    if (!session) return;
    const controller = new AbortController();
    const accessToken = session.access_token;
    const userId = session.user.id;
    setApiAccess((previous) =>
      previous.kind === "allowed" && previous.userId === userId
        ? previous
        : { kind: "checking" },
    );
    apiFetch("/api/v1/auth/me", { signal: controller.signal })
      .then(async (response) => {
        const user = apiUserSchema.parse(await response.json());
        if (user.id !== userId) throw new ApiError(403);
        if (!controller.signal.aborted)
          setApiAccess({ kind: "allowed", accessToken, userId });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setApiAccess({
            kind: "denied",
            accessToken,
            message:
              error instanceof ApiError
                ? error.message
                : "Unable to verify workspace access. Please try again.",
          });
      });
    return () => controller.abort();
  }, [session?.access_token, session?.user.id, accessAttempt]);
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_event, current) => {
      if (!current) setApiAccess({ kind: "checking" });
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
    if (!demo) return;
    try {
      localStorage.setItem("calpulli-demo-v1", JSON.stringify(workspace));
      setStorageError(false);
    } catch {
      setStorageError(true);
    }
  }, [workspace, demo]);
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
    if (loading) return;
    const handler = () => {
      const next = pageFromLocation();
      const nextDetail = next === "Presentations" ? detailFromLocation() : null;
      const path = nextDetail ? `/presentations/${nextDetail}` : pagePath(next);
      const destination = signedIn
        ? path
        : next === "Home"
          ? "/login"
          : `/login?next=${encodeURIComponent(path)}`;
      if (
        `${location.pathname}${location.search}${location.hash}` !== destination
      )
        history.replaceState(null, "", destination);
      setPage(next);
      setDetail(nextDetail);
    };
    handler();
    window.addEventListener("popstate", handler);
    window.addEventListener("hashchange", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      window.removeEventListener("hashchange", handler);
    };
  }, [loading, signedIn]);
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
    const path = pagePath(next);
    if (location.pathname !== path) history.pushState(null, "", path);
  }
  function open(id: string) {
    setPage("Presentations");
    setDetail(id);
    const path = `/presentations/${encodeURIComponent(id)}`;
    if (location.pathname !== path) history.pushState(null, "", path);
    setSearch(false);
    setMobile(false);
    if (demo)
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
          return "Unable to log out. Please try again.";
        }
      } catch {
        setToast("Unable to log out. Please try again.");
        return "Unable to log out. Please try again.";
      }
    }
    setDemo(false);
    setApiAccess({ kind: "checking" });
    setSession(null);
    setDetail(null);
    setPage("Home");
    history.replaceState(null, "", "/login");
    return null;
  }
  if (loading)
    return (
      <div className="loading">
        <img className="loading-logo" src={logo} alt="Calpulli" />
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
  if (session && !demo) {
    if (
      apiAccess.kind === "checking" ||
      (apiAccess.kind === "allowed" && apiAccess.userId !== session.user.id) ||
      (apiAccess.kind === "denied" &&
        apiAccess.accessToken !== session.access_token)
    )
      return <main className="loading">Checking workspace access…</main>;
    if (apiAccess.kind === "denied")
      return (
        <main className="login-page">
          <section className="login-card">
            <h1>Workspace access</h1>
            <p role="alert">{apiAccess.message}</p>
            <button onClick={() => setAccessAttempt((attempt) => attempt + 1)}>
              Try again
            </button>
            <button onClick={logout}>Log out</button>
          </section>
        </main>
      );
  }
  if (session && !demo)
    return (
      <LiveWorkspace
        key={session.user.id}
        session={session}
        page={page}
        detail={detail}
        open={open}
        navigate={navigate}
        logout={logout}
      />
    );
  const PageIcon = pageIcons[detail ? "Presentations" : page];
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
        collapsed={sidebarHidden}
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
            <h1 className="page-title">
              <PageIcon size={17} aria-hidden="true" />
              {selected ? `Presentation #${selected.id}` : page}
            </h1>
          </div>
          <div>
            <span className="pill">Demo</span>
            <div className="header-export" ref={setExportTarget} />
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
            back={() => navigate("Presentations")}
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
              navigate("Presentations");
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
            search={() => setSearch(true)}
          />
        ) : page === "Presentations" ? (
          <Requests
            items={items}
            open={open}
            notify={setToast}
            exportTarget={exportTarget}
          />
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
