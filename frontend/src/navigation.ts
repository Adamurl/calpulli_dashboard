import type { Page } from "./domain";

export const pagePaths = {
  Home: "/",
  Inbox: "/inbox",
  Presentations: "/presentations",
  Drafts: "/presentations/drafts",
  Clients: "/presentations/clients",
  Templates: "/presentations/templates",
  Vendors: "/mexica-new-year/vendors",
  Assignments: "/mexica-new-year/assignments",
  Outreach: "/mexica-new-year/outreach",
  Settings: "/settings",
} satisfies Record<Page, string>;
export const pages = Object.keys(pagePaths).filter(
  (name): name is Page => name in pagePaths,
);
export const presentationChildren: Page[] = ["Drafts", "Clients", "Templates"];
export const mexicaNewYearPages: Page[] = [
  "Vendors",
  "Assignments",
  "Outreach",
];
const aliases = new Map<string, Page>([
  ["/mexica-new-year", "Vendors"],
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
  if (vendorFromLocation(current)) return "Vendors";
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

export const vendorYears = [2027, 2026] as const;
export type VendorYear = (typeof vendorYears)[number];
export type VendorRoute = { year: VendorYear; id: string | null };
export const defaultVendorRoute: VendorRoute = {
  year: vendorYears[0],
  id: null,
};

const vendorPathPattern =
  /^\/mexica-new-year\/vendors(?:\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}))?\/?$/i;

export function vendorPath({ year, id }: VendorRoute): string {
  const path = id
    ? `${pagePaths.Vendors}/${encodeURIComponent(id)}`
    : pagePaths.Vendors;
  return year === defaultVendorRoute.year ? path : `${path}?event_year=${year}`;
}

export function vendorFromLocation(
  current: Pick<Location, "pathname" | "search"> = window.location,
): VendorRoute | null {
  const destination =
    current.pathname === "/login"
      ? (new URLSearchParams(current.search).get("next") ?? "")
      : current.pathname + current.search;
  const [path, search] = destination.split("?");
  const match = vendorPathPattern.exec(path);
  if (!match) return null;
  const yearParam = new URLSearchParams(search).get("event_year");
  const year = vendorYears.find((candidate) => String(candidate) === yearParam);
  return { year: year ?? defaultVendorRoute.year, id: match[1] ?? null };
}
