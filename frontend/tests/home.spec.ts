import { expect, test } from "@playwright/test";

test("Home shows scoped analytics, searches requests, and opens the New view", async ({
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-11-22T18:00:00Z"));
  await page.goto("/tests/live-fixture.html?path=/&home-mailbox");
  const analytics = page.getByRole("region", { name: "Workspace analytics" });
  const period = page.getByRole("combobox", { name: "Analytics period" });
  await expect(period).toHaveValue("Last 30 days");
  const workspace = await page.locator(".workspace").boundingBox();
  const selector = await period.boundingBox();
  if (!workspace || !selector)
    throw new Error("Home analytics layout is missing");
  expect(selector.x - workspace.x).toBeLessThanOrEqual(24);
  await expect(page.locator(".topbar .page-title")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Search workspace", exact: true }),
  ).toHaveCount(0);
  await expect(
    analytics.getByRole("button", { name: /^New emails/ }),
  ).toContainText("12");
  const trend = analytics.getByRole("img", {
    name: "+50% vs. the previous 30 days",
  });
  await expect(trend).toBeVisible();
  const points = await trend.locator("polyline").getAttribute("points");
  expect(points?.split(" ")).toHaveLength(6);
  await expect(
    analytics.getByRole("button", { name: /^Presentation requests/ }),
  ).toContainText("1");
  await expect(
    analytics.getByRole("button", { name: /^MNY vendor applications/ }),
  ).toContainText("21");
  await expect(
    analytics.getByRole("button", { name: /^MNY vendor applications/ }),
  ).toContainText("2027");
  await period.selectOption("Last 7 days");
  await expect(
    analytics.getByRole("img", { name: "-50% vs. the previous 7 days" }),
  ).toHaveAttribute("data-trend", "down");
  await expect(
    analytics.getByRole("button", { name: /^MNY vendor applications/ }),
  ).toContainText("-30%");
  await period.selectOption("This quarter");
  await expect(
    analytics.getByRole("img", { name: "+100% vs. the previous 53 days" }),
  ).toHaveAttribute("data-trend", "up");
  await expect(
    analytics.getByRole("button", { name: /^MNY vendor applications/ }),
  ).toContainText("25");
  await expect(
    page.getByRole("button", { name: "Reply to emails 3" }),
  ).toBeVisible();

  const search = page.getByRole("searchbox", {
    name: "Search workspace records",
  });
  await search.fill("missing presentation");
  await expect(page.getByText("No matching presentations.")).toBeVisible();
  await search.fill("Fictional Operations");
  await expect(
    page.getByRole("button", { name: /^Fictional Operations School/ }),
  ).toBeVisible();
  await search.press("Escape");
  await expect(search).toHaveValue("");
  const calls = await page.evaluate(() =>
    Reflect.get(window, "fixture").calls.map(
      ({ path, search }: { path: string; search: string }) => ({
        path,
        search,
      }),
    ),
  );
  expect(calls.map(({ path }) => path)).not.toContain("/api/v1/presentations");
  expect(
    new Set(
      calls
        .filter(({ path }) => path === "/api/v1/mny/vendors/activity")
        .map(({ search }) => new URLSearchParams(search).get("days")),
    ),
  ).toEqual(new Set(["30", "7", "53"]));
  await page
    .getByRole("button", { name: "New presentation requests 1" })
    .click();
  await expect(page).toHaveURL(/\/presentations$/);
  await expect
    .poll(async () =>
      page.evaluate(() =>
        Reflect.get(window, "fixture").calls.some(
          ({ path, search }: { path: string; search: string }) =>
            path === "/api/v1/presentations/index" &&
            search.includes("status=new") &&
            search.includes("limit=10"),
        ),
      ),
    )
    .toBe(true);
});

test("Home remains searchable on mobile when Outlook is unavailable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/tests/live-fixture.html?path=/");
  const analytics = page.getByRole("region", { name: "Workspace analytics" });
  await expect(
    analytics
      .getByRole("button", { name: /^New emails/ })
      .getByText("-", { exact: true }),
  ).toBeVisible();
  await expect(
    analytics.getByRole("button", { name: /^MNY vendor applications/ }),
  ).toContainText("21");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page
    .getByRole("searchbox", { name: "Search workspace records" })
    .fill("Fictional Operations");
  await page
    .getByRole("button", { name: /^Fictional Operations School/ })
    .click();
  await expect(page).toHaveURL(
    /\/presentations\/11111111-1111-4111-8111-111111111111$/,
  );
});

test("Home reply shortcut opens Outlook even when presentation conversations fail", async ({
  page,
}) => {
  await page.goto("/tests/live-fixture.html?path=/&home-mailbox&page-failure");
  await page.getByRole("button", { name: "Reply to emails 3" }).click();
  await expect(page).toHaveURL(/\/inbox$/);
  await expect(
    page.getByRole("region", { name: "Outlook mailbox" }),
  ).toBeVisible();
  await expect(
    page.getByRole("alert").filter({
      hasText: "Unable to verify workspace access or load data",
    }),
  ).toBeVisible();
});

test("Demo Home opens the New view and keeps the sample email composer", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.getByRole("button", { name: "New email", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("button", { name: /^New presentation requests/ })
    .click();
  await expect(
    page.getByRole("button", { name: "New", exact: true }),
  ).toHaveClass(/selected/);
});
