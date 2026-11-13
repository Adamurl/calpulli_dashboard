import { test, expect } from "@playwright/test";

test("presentation table and statistics load independently with server paging", async ({
  page,
}) => {
  await page.goto("/tests/index-check.html");
  await page.getByRole("button", { name: "Run loading checks" }).click();
  await expect(page.locator("#results h2")).toHaveText(
    "21 loading checks passed",
    { timeout: 60000 },
  );
  await expect(page.locator("#results .fail")).toHaveCount(0);
});

test("table skeletons honor reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/tests/live-fixture.html?table-delay=2500&stats-delay=2500");
  await expect(page.locator(".skeleton-row")).toHaveCount(10);
  expect(
    await page
      .locator(".skeleton-cell")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
});
