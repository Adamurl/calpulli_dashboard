import { test, expect } from "@playwright/test";

test("presentation module hierarchy, aliases and responsive navigation", async ({
  page,
}) => {
  await page.goto("/tests/nav-check.html");
  await page.getByRole("button", { name: "Run navigation checks" }).click();
  await expect(page.locator("#results h2")).toHaveText(
    "23 navigation checks passed",
    { timeout: 60000 },
  );
  await expect(page.locator("#results .fail")).toHaveCount(0);
});
