import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "./ui/collapsible";
import {
  Home,
  Inbox,
  FileText,
  Sun,
  Settings,
  Search,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  LogOut,
  CircleHelp,
  ArrowUpRight,
  X,
} from "lucide-react";
import { useState } from "react";
import { mexicaNewYearPages, presentationChildren } from "../navigation";
import type { Page } from "../domain";
import logo from "../assets/Calpulli_Logo.png";
import { Avatar } from "./ui";
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
  const mnyActive = mexicaNewYearPages.includes(page);
  const mnyOpen = mnyActive && !collapsed;
  const [account, setAccount] = useState(false);
  const childActive = presentationChildren.includes(page);
  const presentationActive = page === "Presentations" || childActive;
  const presentationOpen = presentationActive && !collapsed;
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
          <button
            className={`nav-item ${page === "Home" ? "active" : ""}`}
            aria-label="Home"
            title="Home"
            aria-current={page === "Home" ? "page" : undefined}
            onClick={() => navigate("Home")}
          >
            <Home size={16} />
            <span>Home</span>
          </button>
          <Collapsible className="presentation-module" open={presentationOpen}>
            <div className="module-nav-row">
              <button
                className={`nav-item ${page === "Presentations" ? "active" : ""}`}
                aria-label="Presentations"
                title="Presentations"
                aria-current={page === "Presentations" ? "page" : undefined}
                aria-expanded={presentationOpen}
                aria-controls="presentation-tools"
                onClick={() => {
                  if (collapsed) close();
                  navigate("Presentations");
                }}
              >
                <FileText size={16} />
                <span>Presentations</span>
              </button>
            </div>
            <CollapsibleContent
              keepMounted
              className="presentation-children"
              id="presentation-tools"
              role="group"
              aria-label="Presentation tools"
            >
              {presentationChildren.map((child) => (
                <button
                  key={child}
                  className={`nav-item nav-child ${page === child ? "active" : ""}`}
                  aria-label={child}
                  title={`Presentation ${child.toLowerCase()}`}
                  aria-current={page === child ? "page" : undefined}
                  onClick={() => navigate(child)}
                >
                  <span>{child}</span>
                  {child === "Drafts" && drafts > 0 && <b>{drafts}</b>}
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>
          <Collapsible className="mny-module" open={mnyOpen}>
            <div className="module-nav-row">
              <button
                className="nav-item"
                aria-label="Mexica New Year"
                title="Mexica New Year"
                aria-expanded={mnyOpen}
                aria-controls="mny-tools"
                onClick={() => {
                  if (collapsed) close();
                  navigate("Vendors");
                }}
              >
                <Sun size={16} />
                <span>Mexica New Year</span>
              </button>
            </div>
            <CollapsibleContent
              keepMounted
              className="mny-children"
              id="mny-tools"
              role="group"
              aria-label="Mexica New Year tools"
            >
              {mexicaNewYearPages.map((child) => (
                <button
                  key={child}
                  className={`nav-item nav-child ${page === child ? "active" : ""}`}
                  aria-label={
                    child === "Vendors"
                      ? "Vendor Applications"
                      : child === "Assignments"
                        ? "Spot Assignments"
                        : child
                  }
                  aria-current={page === child ? "page" : undefined}
                  onClick={() => navigate(child)}
                >
                  <span>
                    {child === "Vendors"
                      ? "Vendor Applications"
                      : child === "Assignments"
                        ? "Spot Assignments"
                        : child}
                  </span>
                </button>
              ))}
            </CollapsibleContent>
          </Collapsible>
          <button
            className={`nav-item ${page === "Inbox" ? "active" : ""}`}
            aria-label="Inbox"
            title="Inbox"
            aria-current={page === "Inbox" ? "page" : undefined}
            onClick={() => navigate("Inbox")}
          >
            <Inbox size={16} />
            <span>Inbox</span>
            {unread > 0 && <b>{unread}</b>}
          </button>
        </nav>
        <div className="sidebar-bottom">
          <button
            className={`nav-item ${page === "Settings" ? "active" : ""}`}
            onClick={() => navigate("Settings")}
            aria-current={page === "Settings" ? "page" : undefined}
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
          <Collapsible open={account} onOpenChange={setAccount}>
            <CollapsibleContent className="account-menu">
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
            </CollapsibleContent>
            <CollapsibleTrigger
              className="account-button"
              aria-label={`${name} Calpulli Tonalehqueh`}
              title="Account"
            >
              <Avatar name={name} small />
              <span>
                <b>{name}</b>
                <small>Calpulli Tonalehqueh</small>
              </span>
              <ChevronDown size={13} />
            </CollapsibleTrigger>
          </Collapsible>
        </div>
      </aside>
    </>
  );
}
