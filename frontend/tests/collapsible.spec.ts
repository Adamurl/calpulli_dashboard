import { test, expect } from "@playwright/test";

test("disclosures, status spacing and existing expandable controls", async ({
  page,
}) => {
  await page.goto("/tests/collapsible-check.html");
  await page.getByRole("button", { name: "Run collapsible checks" }).click();
  await expect(page.locator("#results h2")).toHaveText(
    "16 collapsible checks passed",
    { timeout: 60000 },
  );
  await expect(page.locator("#results .fail")).toHaveCount(0);
});

test("disclosure and status choices support keyboard operation", async ({
  page,
}) => {
  await page.goto(
    "/tests/live-fixture.html?path=/presentations/11111111-1111-4111-8111-111111111111",
  );
  const operations = page.getByRole("button", {
    name: "Operational details",
    exact: true,
  });
  await operations.focus();
  await operations.press("Space");
  await expect(operations).toHaveAttribute("aria-expanded", "true");
  await operations.press("Enter");
  await expect(operations).toHaveAttribute("aria-expanded", "false");
  const status = page.getByRole("button", { name: /^Request status:/ });
  await status.focus();
  await status.press("Enter");
  await expect(
    page.getByRole("radio", { name: "Booked", exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Booked", exact: true }).check();
  await expect(status).toContainText("Booked");
  await expect(status).toHaveAttribute("aria-expanded", "false");
});
