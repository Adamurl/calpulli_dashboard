import { test, expect } from "@playwright/test";

test("live requests, full details, operations, status, notes and failures", async ({
  page,
}) => {
  await page.goto("/tests/live-check.html");
  await page.getByRole("button", { name: "Run live checks" }).click();
  await expect(page.locator("#results h2")).toHaveText(
    "23 live checks passed",
    { timeout: 60000 },
  );
  await expect(page.locator("#results .fail")).toHaveCount(0);
});
