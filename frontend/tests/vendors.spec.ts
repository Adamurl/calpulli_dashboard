import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

const index = "/mexica-new-year/vendors";
const archive = "44444444-4444-4444-8444-444444444444";
const historical = `${index}/${archive}?event_year=2026`;

test("the vendor table paginates and searches independently of year totals", async ({
  page,
}) => {
  await page.goto(`/tests/live-fixture.html?path=${encodeURIComponent(index)}`);
  const stats = page.getByRole("region", { name: "2027 vendor statistics" });
  const table = page.getByRole("table");
  await expect(stats.getByText("21", { exact: true })).toBeVisible();
  await expect(stats.getByText("Unavailable", { exact: true })).toHaveCount(3);
  await expect(page.getByRole("button", { name: /^All\b/ })).toHaveText(
    /All\s*21/,
  );
  await expect(table.getByRole("checkbox")).toHaveCount(0);
  await expect(table.getByRole("columnheader").first()).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  const status = table.getByRole("columnheader").last();
  await expect(status).toHaveText("Status");
  await expect(status).toHaveCSS("text-align", "left");
  await expect(status.getByRole("button")).toHaveCount(0);
  await expect(
    table
      .getByRole("row")
      .filter({ hasText: "Fixture Artisan" })
      .getByRole("cell")
      .nth(4),
  ).toHaveText("-");
  await expect(page.getByLabel("Rows per page")).toHaveValue("10");
  await expect(table.getByRole("row")).toHaveCount(11);
  await expect(page.getByText("Page 1 of 3")).toBeVisible();
  await page.getByRole("button", { name: "Last page", exact: true }).click();
  await expect(table.getByRole("link")).toHaveText(["Sample Vendor 20"]);
  await page.getByRole("textbox", { name: "Search vendors" }).fill("Fixture");
  await expect(table.getByRole("link")).toHaveText(["Fixture Artisan"]);
  await expect(stats.getByText("21", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Fixture Artisan" }).press("Enter");
  await expect(page.getByText("Handmade baskets")).toBeVisible();
  await expect(page.getByText("About 5k")).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("textbox", { name: "Search vendors" }),
  ).toHaveValue("Fixture");
  await page.getByRole("button", { name: "Event year, 2027" }).press("Enter");
  await expect(page.getByRole("menuitemradio")).toHaveCount(2);
  await expect(page.getByRole("menuitemradio", { name: "2027" })).toBeChecked();
  await page.getByRole("menuitemradio", { name: "2026" }).click();
  await expect(page).toHaveURL(`${index}?event_year=2026`);
  await expect(table.getByRole("row").last().getByRole("cell")).toHaveText([
    "-",
    "Archived Vendor",
    "Fixture Vendor Contact",
    "Craft",
    "2",
    "f14, 15",
    "Yes",
    "Spot assigned",
  ]);
  await expect(
    page
      .getByRole("region", { name: "2026 vendor statistics" })
      .getByText("$125.50"),
  ).toBeVisible();
});

test("an archived vendor keeps its year through login, refresh, and return to list", async ({
  page,
}) => {
  const html = await readFile(
    new URL("./live-fixture.html", import.meta.url),
    "utf8",
  );
  await page.route("**/mexica-new-year/vendors/**", (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({ body: html, contentType: "text/html" })
      : route.continue(),
  );
  await page.goto(
    `/tests/live-fixture.html?path=${encodeURIComponent(historical)}&signed-out`,
  );
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe(historical);
  await page.evaluate(() => window.fixture.signInAgain());
  await expect(page).toHaveURL(historical);
  await expect(
    page.getByRole("heading", { name: "Archived Vendor" }),
  ).toBeVisible();
  await page.reload();
  await expect(page).toHaveURL(historical);
  await expect(page.getByText("A fictional note.")).toBeVisible();
  await expect(page.getByText("Spot assigned", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "Payment" }).getByText("$125.50"),
  ).toHaveCount(2);
  await expect(
    page.getByRole("table", { name: "Assigned spots" }).getByRole("rowheader"),
  ).toHaveText(["f14", "15"]);
  await expect(page.getByText("Acceptance email sent")).toBeVisible();
  await page.getByRole("link", { name: "Back to vendors" }).click();
  await expect(page).toHaveURL(`${index}?event_year=2026`);
  await expect(
    page.getByRole("link", { name: "Archived Vendor" }),
  ).toBeVisible();
});

test("a failed table can be retried without hiding the event totals", async ({
  page,
}) => {
  await page.goto(`/tests/live-fixture.html?path=${encodeURIComponent(index)}`);
  const stats = page.getByRole("region", { name: "2027 vendor statistics" });
  await expect(stats.getByText("21", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Fixture Artisan" }),
  ).toBeVisible();
  await page.evaluate(() =>
    Object.assign(window.fixture, { vendorFailure: true }),
  );
  await page.getByRole("textbox", { name: "Search vendors" }).fill("Fixture");
  await expect(page.getByRole("alert")).toContainText(
    "Unable to verify workspace access or load data",
  );
  await expect(stats.getByText("21", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    Object.assign(window.fixture, { vendorFailure: false }),
  );
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(
    page.getByRole("link", { name: "Fixture Artisan" }),
  ).toBeVisible();
});

test("a vendor profile keeps edits and notes when browsing neighboring records", async ({
  page,
}) => {
  await page.goto(`/tests/live-fixture.html?path=${encodeURIComponent(index)}`);
  await page.getByRole("link", { name: "Fixture Artisan" }).click();
  await expect(page.getByText("Applied", { exact: true })).toBeVisible();
  const payment = page.getByRole("region", { name: "Payment" });
  const overview = page.getByRole("region", { name: "Business overview" });
  await expect(payment.getByText("Amount due", { exact: true })).toHaveCount(0);
  await expect(
    payment.getByText("Payment methods", { exact: true }),
  ).toBeVisible();
  await expect(payment.getByText("Cash", { exact: true })).toBeVisible();
  await expect(payment.getByText("Zelle", { exact: true })).toBeVisible();
  await expect(payment.getByText("Total paid", { exact: true })).toBeVisible();
  await expect(payment.getByText("1", { exact: true })).toBeVisible();
  await expect(overview.getByText("Fixture community")).toBeVisible();
  await expect(overview.getByText("Handmade baskets")).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Mexica New Year tools" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: "Presentation tools" }),
  ).toBeHidden();
  await expect(page.getByText("Application received")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "@fixture.art" }),
  ).toHaveAttribute("href", "https://www.instagram.com/fixture.art");
  const actions = page.locator(".detail-actions").getByRole("button");
  await expect(actions.nth(0)).toHaveAccessibleName("Edit");
  await expect(actions.nth(1)).toHaveAccessibleName("Previous vendor");
  await expect(actions.nth(2)).toHaveAccessibleName("Next vendor");
  await expect(
    page.getByRole("button", { name: "Previous vendor" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", { name: "Edit vendor" });
  await editor.getByLabel("Business name").fill("Fixture Artist");
  await editor.getByLabel("Requested space").fill("10 x 20");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(
    page.getByRole("heading", { name: /Fixture Artist/ }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Internal note" })
    .fill("Confirm the booth size.");
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await page.getByRole("button", { name: "Next vendor" }).click();
  await expect(
    page.getByRole("heading", { name: /Sample Vendor 1 Applied/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Previous vendor" }).click();
  await expect(page.getByText("Confirm the booth size.")).toBeVisible();
  await expect(page.getByText("10 x 20")).toBeVisible();
  await expect(payment.getByText("2", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Assigned spots" }).getByRole("row"),
  ).toHaveCount(1);
  await page.getByRole("link", { name: "Back to vendors" }).click();
  await expect(
    page.getByRole("link", { name: "Fixture Artist" }),
  ).toBeVisible();
});

test("vendor stage filters and sorting cover the complete year", async ({
  page,
}) => {
  await page.goto(`/tests/live-fixture.html?path=${encodeURIComponent(index)}`);
  const table = page.getByRole("table", { name: "Vendor applications" });
  const stage = page.getByRole("group", { name: "Filter by vendor stage" });
  await stage.getByRole("button", { name: "Accepted", exact: true }).click();
  await expect(table.getByRole("link")).toHaveText(["Sample Vendor 2"]);
  await stage.getByRole("button", { name: "Paid", exact: true }).click();
  await expect(table.getByRole("link")).toHaveText(["Sample Vendor 3"]);
  await stage.getByRole("button", { name: /^All\b/ }).click();
  await page.getByLabel("Rows per page").selectOption("5");
  await expect(table.getByRole("link")).toHaveCount(5);
  await expect(page.getByText("Page 1 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Sort by vendor" }).click();
  await page.getByRole("button", { name: "Sort by vendor" }).click();
  await expect(table.getByRole("link").first()).toHaveText("Sample Vendor 20");
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page.getByRole("button", { name: "Reorder Status" }).press("ArrowUp");
  await expect(table.getByRole("columnheader").last()).toHaveText(
    "Paid before deadline",
  );
  await page.getByRole("button", { name: "Show Category column" }).click();
  await expect(
    table.getByRole("columnheader", { name: "Category" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sort by, Vendor" }).click();
  await page
    .getByRole("menuitemradio", { name: "Status", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Assigned to new" }).click();
  await expect(table.getByRole("link").first()).toHaveText("Sample Vendor 3");
});
