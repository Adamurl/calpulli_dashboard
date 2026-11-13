import type { Page } from "./domain";

export const pagePaths = {
  Home: "/",
  Inbox: "/inbox",
  Presentations: "/presentations",
  Drafts: "/presentations/drafts",
  Clients: "/presentations/clients",
  Templates: "/presentations/templates",
  Settings: "/settings",
} satisfies Record<Page, string>;
export const pages = Object.keys(pagePaths).filter(
  (name): name is Page => name in pagePaths,
);
export const presentationChildren: Page[] = ["Drafts", "Clients", "Templates"];
const aliases = new Map<string, Page>([
  ["/drafts", "Drafts"],
  ["/clients", "Clients"],
  ["/templates", "Templates"],
  ["/activity", "Presentations"],
  ["/presentations/activity", "Presentations"],
]);
export function pagePath(page: Page): string {
  return pagePaths[page];
}
function pageFromPath(path: string | null): Page | undefined {
  return (
    pages.find((page) => pagePaths[page] === path) ??
    (path ? aliases.get(path) : undefined)
  );
}
export function pageFromLocation(
  current: Pick<Location, "pathname" | "search" | "hash"> = window.location,
): Page {
  const hash = current.hash.slice(1);
  const legacy =
    pages.find((page) => page.toLowerCase() === hash) ??
    pageFromPath(`/${hash}`);
  if (current.hash && legacy) return legacy;
  const path =
    current.pathname === "/login"
      ? new URLSearchParams(current.search).get("next")
      : current.pathname;
  return (
    pageFromPath(path) ??
    (detailFromLocation(current) ? "Presentations" : "Home")
  );
}
export function detailFromLocation(
  current: Pick<Location, "pathname" | "search"> = window.location,
): string | null {
  const path =
    current.pathname === "/login"
      ? new URLSearchParams(current.search).get("next")
      : current.pathname;
  if (!path || pageFromPath(path)) return null;
  return (
    /^\/presentations\/(\d{1,20}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})\/?$/.exec(
      path,
    )?.[1] ?? null
  );
}
