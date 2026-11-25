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
  await expect(stats.getByText("$0.00", { exact: true })).toBeVisible();
  await expect(stats.getByText("0", { exact: true })).toBeVisible();
  await expect(stats.getByText("-", { exact: true })).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Filter by application status" }),
  ).toHaveText("All");
  await expect(table.getByRole("checkbox")).toHaveCount(22);
  await expect(table.getByRole("columnheader").nth(1)).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  const status = table.getByRole("columnheader").last();
  await expect(status).toHaveText("Application status");
  await expect(status).toHaveCSS("text-align", "left");
  await expect(status.getByRole("button")).toHaveCount(0);
  await expect(
    table
      .getByRole("row")
      .filter({ hasText: "Fixture Artisan" })
      .getByRole("cell")
      .nth(5),
  ).toHaveText("-");
  await expect(page.getByLabel("Rows per page")).toHaveValue("25");
  await expect(table.getByRole("row")).toHaveCount(22);
  await expect(page.getByText("Page 1 of 1")).toBeVisible();
  await page.getByRole("textbox", { name: "Search vendors" }).fill("Fixture");
  await expect(table.getByRole("link")).toHaveText(["Fixture Artisan"]);
  await expect(stats.getByText("21", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Fixture Artisan" }).press("Enter");
  await expect(page.getByText("Handmade baskets")).toBeVisible();
  await expect(page.getByText("5,000", { exact: true })).toBeVisible();
  const payment = page.getByRole("region", { name: "Payment" });
  await expect(
    payment
      .locator(".fact-pair")
      .filter({ hasText: "Total paid" })
      .locator("dd"),
  ).toHaveText("-");
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
    "",
    "-",
    "Archived Vendor",
    "Fixture Vendor Contact",
    "Craft",
    "2",
    "f14, 15",
    "Yes",
    "-",
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
  await expect(overview.getByText("5,000", { exact: true })).toBeVisible();
  await expect(overview.getByText("About 5k", { exact: true })).toHaveCount(0);
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
  const stage = page.getByRole("button", {
    name: "Filter by application status",
  });
  await stage.click();
  await page.getByRole("menuitemradio", { name: "Accepted" }).click();
  await expect(table.getByRole("link")).toHaveText(["Sample Vendor 2"]);
  await stage.click();
  await page.getByRole("menuitemradio", { name: "Denied" }).click();
  await expect(table.getByRole("link")).toHaveText(["Sample Vendor 3"]);
  await stage.click();
  await page.getByRole("menuitemradio", { name: "All", exact: true }).click();
  await page.getByLabel("Rows per page").selectOption("5");
  await expect(table.getByRole("link")).toHaveCount(5);
  await expect(page.getByText("Page 1 of 5")).toBeVisible();
  await page.getByRole("button", { name: "Sort by vendor" }).click();
  await page.getByRole("button", { name: "Sort by vendor" }).click();
  await expect(table.getByRole("link").first()).toHaveText("Sample Vendor 20");
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page
    .getByRole("button", { name: "Reorder Application status" })
    .press("ArrowUp");
  await expect(table.getByRole("columnheader").last()).toHaveText(
    "Paid before deadline",
  );
  await page.getByRole("button", { name: "Show Vendor type column" }).click();
  await expect(
    table.getByRole("columnheader", { name: "Vendor type" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Sort by, Vendor" }).click();
  await page
    .getByRole("menuitemradio", { name: "Application status", exact: true })
    .click();
  await page.getByRole("menuitemradio", { name: "Denied to applied" }).click();
  await expect(table.getByRole("link").first()).toHaveText("Sample Vendor 3");
});

test("the select-all checkbox clears the vendor selection", async ({
  page,
}) => {
  await page.goto(`/tests/live-fixture.html?path=${encodeURIComponent(index)}`);
  const selectAll = page.getByRole("checkbox", {
    name: "Select all vendors on this page",
  });
  const checkboxSize = await selectAll.boundingBox();
  const firstRow = page
    .getByRole("table", { name: "Vendor applications" })
    .getByRole("row")
    .nth(1);
  const cellPositions = await firstRow.getByRole("cell").evaluateAll((cells) =>
    cells.map((cell) => ({
      x: cell.getBoundingClientRect().x,
      width: cell.getBoundingClientRect().width,
    })),
  );
  await selectAll.check();
  expect(await selectAll.boundingBox()).toEqual(checkboxSize);
  expect(
    await firstRow.getByRole("cell").evaluateAll((cells) =>
      cells.map((cell) => ({
        x: cell.getBoundingClientRect().x,
        width: cell.getBoundingClientRect().width,
      })),
    ),
  ).toEqual(cellPositions);
  await expect(page.getByText("21 selected", { exact: true })).toBeVisible();
  await selectAll.uncheck();
  await expect(selectAll).not.toBeChecked();
  await expect(page.getByText("21 selected", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Bulk edit" })).toBeHidden();
});

test("selected vendors can be edited together", async ({ page }) => {
  await page.goto(`/tests/live-fixture.html?path=${encodeURIComponent(index)}`);
  await page
    .getByRole("checkbox", { name: "Select vendor Fixture Artisan" })
    .check();
  await page
    .getByRole("checkbox", { name: "Select vendor Sample Vendor 1" })
    .check();
  await expect(page.getByText("2 selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Bulk edit" }).click();
  const editor = page.getByRole("dialog", { name: "Bulk edit 2 vendors" });
  await editor
    .getByLabel("Set application status for all selected")
    .selectOption("accepted");
  await editor
    .getByLabel("Vendor category for Fixture Artisan")
    .selectOption("ARTS_CRAFTS");
  await editor.getByRole("button", { name: "Save changes" }).click();
  await expect(editor).toBeHidden();
  await expect(
    page.getByRole("row").filter({ hasText: "Fixture Artisan" }),
  ).toContainText("Arts & Crafts");
  await page
    .getByRole("button", { name: "Filter by application status" })
    .click();
  await page.getByRole("menuitemradio", { name: "Accepted" }).click();
  await expect(
    page.getByRole("row").filter({ hasText: "Fixture Artisan" }),
  ).toContainText("Accepted");
});
