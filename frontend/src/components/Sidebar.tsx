import {
  Home,
  Inbox,
  Users,
  FileText,
  Settings,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  LogOut,
  Mail,
  LayoutTemplate,
  Activity,
  CircleHelp,
  ArrowUpRight,
  X,
} from "lucide-react";
import { useState } from "react";
import type { Page } from "../domain";
import logo from "../assets/Calpulli_Logo.png";
import { Avatar } from "./ui";
const primary = [
  { name: "Home", icon: Home },
  { name: "Presentations", icon: FileText },
  { name: "Inbox", icon: Inbox },
  { name: "Drafts", icon: Mail },
  { name: "Clients", icon: Users },
] satisfies { name: Page; icon: typeof Home }[];
export function Sidebar({
  page,
  navigate,
  name,
  email,
  logout,
  search,
  unread,
  drafts,
  open,
  close,
  collapsed,
}: {
  page: Page;
  navigate: (p: Page) => void;
  name: string;
  email: string;
  logout: () => void;
  search: () => void;
  unread: number;
  drafts: number;
  open: boolean;
  close: () => void;
  collapsed: boolean;
}) {
  const [account, setAccount] = useState(false);
  return (
    <>
      <button
        className={`mobile-overlay ${open ? "visible" : ""}`}
        aria-label="Close navigation"
        onClick={close}
      />
      <aside className={`sidebar ${open ? "open" : ""}`}>
        <div className="sidebar-brand">
          <img className="sidebar-logo" src={logo} alt="Calpulli" />
          <b>calpulli</b>
          <button
            className="icon-button collapse"
            onClick={close}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <PanelLeftOpen size={16} />
            ) : (
              <PanelLeftClose size={16} />
            )}
          </button>
          <button
            className="icon-button mobile-close"
            onClick={close}
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>
        <button
          className="sidebar-search"
          onClick={search}
          aria-label="Search navigation"
          title="Search"
        >
          <Search size={14} />
          <span>Search</span>
          <kbd>⌘ K</kbd>
        </button>
        <nav aria-label="Main navigation">
          {primary.map(({ name, icon: Icon }) => (
            <button
              key={name}
              aria-label={name}
              title={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              aria-current={page === name ? "page" : undefined}
              onClick={() => navigate(name)}
            >
              <Icon size={16} />
              <span>{name}</span>
              {name === "Inbox" && unread > 0 && <b>{unread}</b>}
              {name === "Drafts" && drafts > 0 && <b>{drafts}</b>}
            </button>
          ))}
          <div className="nav-section">
            Workspace <ChevronDown size={11} />
          </div>
          {[
            { name: "Templates", icon: LayoutTemplate },
            { name: "Activity", icon: Activity },
          ].map(({ name, icon: Icon }) => (
            <button
              key={name}
              aria-label={name}
              title={name}
              className={`nav-item ${page === name ? "active" : ""}`}
              onClick={() =>
                navigate(name === "Templates" ? "Templates" : "Activity")
              }
            >
              <Icon size={16} />
              <span>{name}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
            aria-label="Settings"
            title="Settings"
          >
            <Settings size={16} />
            <span>Settings</span>
          </button>
          <a
            className="nav-item"
            aria-label="Visit Calpulli"
            title="Visit Calpulli"
            href="https://www.calpullitonalehqueh.org"
            target="_blank"
            rel="noreferrer"
          >
            <CircleHelp size={16} />
            <span>Visit Calpulli</span>
            <ArrowUpRight size={13} />
          </a>
          {account && (
            <div className="account-menu">
              <strong>{name}</strong>
              <small>{email}</small>
              <button
                onClick={() => {
                  setAccount(false);
                  navigate("Settings");
                }}
              >
                <Settings size={14} /> Account & workspace
              </button>
              <button onClick={logout}>
                <LogOut size={14} /> Log out
              </button>
            </div>
          )}
          <button
            className="account-button"
            onClick={() => setAccount(!account)}
            aria-label={`${name} Calpulli Tonalehqueh`}
            title="Account"
            aria-expanded={account}
          >
            <Avatar name={name} small />
            <span>
              <b>{name}</b>
              <small>Calpulli Tonalehqueh</small>
            </span>
            <ChevronDown size={13} />
          </button>
        </div>
      </aside>
    </>
  );
}
