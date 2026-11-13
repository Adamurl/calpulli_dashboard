import { test, expect } from "@playwright/test";

test("clients retain their search while skeletons resolve and Activity is unavailable", async ({
  page,
}) => {
  await page.goto(
    "/tests/live-fixture.html?path=/presentations/clients&list-delay=1000",
  );
  const clients = page.getByRole("region", { name: "Clients", exact: true });
  await expect(clients).toHaveAttribute("aria-busy", "true");
  await expect(page.locator(".client-skeleton")).toHaveCount(8);
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
  await expect(page.locator(".clients-grid > button")).toHaveCount(1);
  await page.locator(".clients-grid > button").click();
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
    "/tests/live-fixture.html?path=/presentations/clients&list-delay=2500",
  );
  await expect(page.locator(".client-skeleton")).toHaveCount(8);
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
