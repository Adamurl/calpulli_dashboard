import {
  ArrowUpRight,
  ArrowRight,
  Mail,
  Clock3,
  CalendarDays,
  ChevronRight,
  Plus,
  Sparkles,
  Flower2,
  MessageSquare,
  Check,
  Inbox,
  Search,
} from "lucide-react";
import type { Draft, Inquiry, Page } from "../domain";
import { dateLabel } from "../data";
import { Badge, Avatar } from "./ui";
export function Home({
  items,
  drafts,
  navigate,
  open,
  compose,
  name,
  search,
}: {
  items: Inquiry[];
  drafts: Draft[];
  navigate: (page: Page) => void;
  open: (id: string) => void;
  compose: () => void;
  name: string;
  search: () => void;
}) {
  const newCount = items.filter((i) => i.status === "new").length;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  return (
    <div className="home-content">
      <div className="home-period">
        <span>Workspace overview</span>
        <span>
          <span className="tiny-dot" /> Preview workspace · Fictional data
        </span>
      </div>
      <div className="hero">
        <span className="eyebrow">YOUR COMMUNITY, IN GOOD HANDS</span>
        <h1>
          {greeting}, {name.split(" ")[0]}.<br />
          <span>Let’s make meaningful connections.</span>
        </h1>
        <p>One place for your presentations, people, and conversations.</p>
        <button className="home-search-card" onClick={search}>
          <span>Find a client, presentation, or conversation…</span>
          <span>
            <Search size={16} />
            <kbd>⌘ K</kbd>
          </span>
        </button>
        <div className="hero-actions">
          <button className="button primary" onClick={compose}>
            <Plus size={15} /> New email
          </button>
          <button className="button" onClick={() => navigate("Presentations")}>
            View presentations
            <ArrowUpRight size={14} />
          </button>
        </div>
      </div>
      <div className="metric-strip">
        {[
          {
            label: "New inquiries",
            value: newCount,
            sub: "Ready for a warm welcome",
            icon: Inbox,
            page: "Presentations",
          },
          {
            label: "Unread conversations",
            value: items.filter((i) => i.unread).length,
            sub: "Keep the conversation going",
            icon: MessageSquare,
            page: "Inbox",
          },
          {
            label: "Upcoming presentations",
            value: items.filter((i) => i.status === "booked").length,
            sub: "Moments to look forward to",
            icon: CalendarDays,
            page: "Presentations",
          },
          {
            label: "Email drafts",
            value: drafts.length,
            sub: "A little thought, ready to share",
            icon: Mail,
            page: "Drafts",
          },
        ].map(({ label, value, sub, icon: Icon, page }) => (
          <button
            className="metric"
            key={label}
            onClick={() =>
              navigate(
                page === "Presentations"
                  ? "Presentations"
                  : page === "Inbox"
                    ? "Inbox"
                    : "Drafts",
              )
            }
          >
            <div>
              <span>{label}</span>
              <Icon size={15} />
            </div>
            <strong>{value}</strong>
            <small>{sub}</small>
          </button>
        ))}
      </div>
      <div className="home-grid">
        <section className="card attention-card">
          <div className="section-head">
            <h2>
              Needs your attention{" "}
              <span className="count">
                {items.filter((i) => i.unread).length}
              </span>
            </h2>
            <button className="text-button" onClick={() => navigate("Inbox")}>
              View inbox
              <ArrowUpRight size={13} />
            </button>
          </div>
          {items
            .filter((i) => i.unread)
            .map((i) => (
              <button
                className="attention-row"
                key={i.id}
                onClick={() => open(i.id)}
              >
                <Avatar name={i.name} />
                <div>
                  <strong>{i.organization}</strong>
                  <p>{i.preview}</p>
                  <small>
                    {i.name} · {i.title}
                  </small>
                </div>
                <ChevronRight size={16} />
              </button>
            ))}
          <div className="card-footer">
            <Clock3 size={13} /> A thoughtful reply goes a long way.
          </div>
        </section>
        <section className="community-card">
          <div className="community-art" aria-hidden="true">
            <div className="sun" />
            <div className="arch a1" />
            <div className="arch a2" />
            <div className="arch a3" />
            <Flower2 className="flower" size={92} strokeWidth={1} />
            <span className="art-label">CULTURE CONNECTS US</span>
          </div>
          <div className="community-copy">
            <span className="eyebrow">A LITTLE MORE HUMAN</span>
            <h2>Start with a hello.</h2>
            <p>
              Make every client feel welcome with a personal message, written in
              your voice.
            </p>
            <button className="button" onClick={compose}>
              Write a personal email
              <ArrowRight size={14} />
            </button>
          </div>
        </section>
        <section className="card upcoming-card">
          <div className="section-head">
            <h2>Coming together soon</h2>
            <button
              className="text-button"
              onClick={() => navigate("Presentations")}
            >
              View all
              <ArrowUpRight size={13} />
            </button>
          </div>
          {items
            .filter((i) => i.status === "booked")
            .map((i) => (
              <button
                className="upcoming-row"
                key={i.id}
                onClick={() => open(i.id)}
              >
                <div className="date-tile">
                  <small>
                    {new Date(i.date + "T12:00:00").toLocaleString("en-US", {
                      month: "short",
                    })}
                  </small>
                  <b>{i.date.slice(-2)}</b>
                </div>
                <div>
                  <strong>{i.organization}</strong>
                  <p>
                    {i.title} · {i.location}
                  </p>
                </div>
                <Badge status={i.status} />
              </button>
            ))}
        </section>
        <section className="card quick-card">
          <div className="section-head">
            <h2>A good place to start</h2>
            <Sparkles size={16} />
          </div>
          <button onClick={() => navigate("Templates")}>
            <span className="quick-icon">
              <Mail size={17} />
            </span>
            <span>
              <strong>Make it your own</strong>
              <small>Explore your email templates</small>
            </span>
            <ChevronRight size={15} />
          </button>
          <button onClick={() => navigate("Settings")}>
            <span className="quick-icon green">
              <Check size={17} />
            </span>
            <span>
              <strong>Your workspace, connected</strong>
              <small>Review account and email settings</small>
            </span>
            <ChevronRight size={15} />
          </button>
        </section>
      </div>
      <div className="home-bottom">
        <Flower2 size={14} /> Made for the work that brings us together.
        <span>Sample workspace · {dateLabel("2026-11-10")}</span>
      </div>
    </div>
  );
}
