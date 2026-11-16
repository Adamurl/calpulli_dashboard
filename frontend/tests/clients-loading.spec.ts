import { test, expect } from "@playwright/test";

test("clients retain their search while skeletons resolve and Activity is unavailable", async ({
  page,
}) => {
  await page.goto(
    "/tests/live-fixture.html?path=/presentations/clients&table-delay=1000",
  );
  const clients = page.getByRole("region", { name: "Clients", exact: true });
  await expect(clients).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".client-skeleton")).toHaveCount(10);
  await expect(clients.getByRole("status")).toContainText("Loading clients");
  await expect(
    page.getByRole("button", { name: "Activity", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("textbox", { name: "Search clients" })
    .fill("Fictional Operations");
  await expect(clients).toHaveAttribute("aria-busy", "false");
  await expect(page.locator(".client-skeleton")).toHaveCount(0);
  await expect(
    page.getByRole("textbox", { name: "Search clients" }),
  ).toHaveValue("Fictional Operations");
  await expect(page.locator(".clients-table tbody th button")).toHaveCount(1);
  await page.locator(".clients-table tbody th button").click();
  await expect(page).toHaveURL(
    /\/presentations\/11111111-1111-4111-8111-111111111111$/,
  );
});

test("client placeholders fit mobile and honor reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    "/tests/live-fixture.html?path=/presentations/clients&table-delay=2500",
  );
  await expect(page.locator(".client-skeleton")).toHaveCount(10);
  await expect(
    page.getByRole("button", { name: "Previous", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeVisible();
  expect(
    await page
      .locator(".client-skeleton .skeleton")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("clients fetch only the requested page and search across all records", async ({
  page,
}) => {
  await page.goto("/tests/live-fixture.html?path=/presentations/clients");
  const rows = page.locator(".clients-table tbody th button");
  await expect(rows).toHaveCount(10);
  await expect(page.getByText("1–10 of 101", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.getByText("11–20 of 101", { exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search clients" })
    .fill("Other fixture 100");
  await expect(rows).toHaveCount(1);
  await expect(
    page.getByText("Other fixture 100", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Page 1 of 1", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Next", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("textbox", { name: "Search clients" })
    .fill("no matching person");
  await expect(page.getByText("No matching clients.")).toBeVisible();
  const calls = await page.evaluate(() =>
    Reflect.get(window, "fixture").calls.map(
      (call: { path: string; search: string }) => call.path + call.search,
    ),
  );
  expect(
    calls.some((path: string) => path.startsWith("/api/v1/presentations?")),
  ).toBe(false);
  const pages = calls.filter((path: string) =>
    path.startsWith("/api/v1/presentations/index?"),
  );
  expect(pages.length).toBeGreaterThanOrEqual(4);
  expect(
    pages.every(
      (path: string) =>
        new URL(path, "http://fixture.invalid").searchParams.get("limit") ===
        "10",
    ),
  ).toBe(true);
  expect(
    pages.some(
      (path: string) =>
        new URL(path, "http://fixture.invalid").searchParams.get("offset") ===
        "10",
    ),
  ).toBe(true);
});

test("clients show a retry on failure without fetching all contacts", async ({
  page,
}) => {
  await page.goto(
    "/tests/live-fixture.html?path=/presentations/clients&page-failure",
  );
  await expect(page.getByRole("alert")).toBeVisible();
  await page.evaluate(() => {
    Reflect.get(window, "fixture").secondPageFailure = false;
  });
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".clients-table tbody th button")).toHaveCount(10);
});
