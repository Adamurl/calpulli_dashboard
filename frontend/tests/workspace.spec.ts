import { test, expect } from "@playwright/test";
async function enter(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
}
test("login boundary, shell, request filters and client detail", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/#inbox");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByRole("button", { name: "Show password" }).click();
  await expect(page.getByLabel("Password", { exact: true })).toHaveAttribute(
    "type",
    "text",
  );
  await enter(page);
  await page
    .getByRole("button", { name: "Presentations", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Presentations", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Search presentations" })
    .fill("Oak Valley");
  await expect(
    page.getByRole("button", { name: "Oak Valley Elementary", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Community Arts Center", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Oak Valley Elementary", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Elena Morales", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /^Request status:/ }).click();
  await page.getByRole("radio", { name: "In review", exact: true }).check();
  await expect(page.locator(".detail-title h2")).toContainText("In review");
  await page
    .getByRole("textbox", { name: "Internal note" })
    .fill("Check the indoor performance space.");
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await expect(
    page.getByText("Check the indoor performance space.", { exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("personal drafts persist, edit, review and remain in the client thread", async ({
  page,
}) => {
  await enter(page);
  await page.getByRole("button", { name: "New email", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(dialog.getByRole("alert")).toContainText("valid recipient");
  await dialog
    .getByRole("textbox", { name: "Subject", exact: true })
    .fill("A presentation just for your community");
  await dialog
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Hello Elena,\nWe would love to learn more about your celebration.");
  await dialog.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("button", { name: /^Drafts/ }).click();
  await page
    .getByRole("button", { name: /A presentation just for your community/ })
    .click();
  await page
    .getByRole("textbox", { name: "Message", exact: true })
    .fill("Hello Elena,\nThursday would be a lovely time to connect.");
  await page.getByRole("button", { name: "Review email", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText(
    "It does not send an email.",
  );
  await page
    .getByRole("button", { name: "Save for review", exact: true })
    .click();
  await page.reload();
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await page.getByRole("button", { name: /^Drafts/ }).click();
  await page.getByRole("button", { name: "Needs review", exact: true }).click();
  await expect(
    page.getByRole("button", {
      name: /A presentation just for your community/,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Search workspace", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Search workspace records" })
    .fill("Oak Valley");
  await page.getByRole("button", { name: /Oak Valley Elementary/ }).click();
  await page
    .getByRole("button", { name: "Conversation thread", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Awaiting review", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Thursday would be a lovely time to connect.", {
      exact: false,
    }),
  ).toBeVisible();
});
test("mobile navigation, template workflow and account logout", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await enter(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: "Templates", exact: true }).click();
  await page
    .getByRole("button", { name: "A warm welcome", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Use this template", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Message", exact: true }),
  ).toHaveValue(/Hello Elena/);
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Inbox", exact: false })
    .first()
    .click();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", { name: "Open navigation", exact: true })
    .click();
  await page.getByRole("button", { name: /Alex Calpulli Tonalehqueh/ }).click();
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});
test("supabase auth rejects invalid credentials without exposing errors", async ({
  page,
}) => {
  await page.route("**/auth/v1/token?grant_type=password", (route) =>
    route.fulfill({
      status: 400,
      contentType: "application/json",
      body: JSON.stringify({
        error: "invalid_grant",
        error_description: "Invalid login credentials",
      }),
    }),
  );
  await page.goto("/");
  await page
    .getByRole("textbox", { name: "Email address", exact: true })
    .fill("invalid@example.org");
  await page.getByLabel("Password", { exact: true }).fill("invalid-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Unable to sign in.");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});

test("collapsed navigation and data table controls", async ({ page }) => {
  await enter(page);
  await page
    .getByRole("button", { name: "Collapse sidebar", exact: true })
    .click();
  const navigation = page.getByRole("navigation", { name: "Main navigation" });
  await expect(
    navigation.getByRole("button", { name: "Presentations", exact: true }),
  ).toBeVisible();
  await navigation
    .getByRole("button", { name: "Presentations", exact: true })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Presentations",
  );
  await page.getByRole("combobox", { name: "Rows per page" }).selectOption("5");
  await expect(page.locator("tbody tr")).toHaveCount(5);
  const first = await page.locator("tbody tr").first().innerText();
  await page.getByRole("button", { name: "Next page", exact: true }).click();
  await expect(page.locator("tbody tr").first()).not.toHaveText(first);
  await page.getByRole("button", { name: "First page", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Select all presentations on this page" })
    .check();
  await expect(page.getByText(/5 of .*row\(s\) selected/)).toBeVisible();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page
    .getByRole("checkbox", { name: "Organization", exact: true })
    .uncheck();
  await expect(
    page.getByRole("columnheader", { name: "Organization", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("checkbox", { name: "Organization", exact: true })
    .check();
  await page.getByRole("button", { name: "Columns", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Search presentations" })
    .fill("no matching presentation");
  await expect(
    page.getByText("No presentations found. Try another search or status."),
  ).toBeVisible();
  await expect(page.getByText("Page 0 of 0", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Expand sidebar", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Collapse sidebar", exact: true }),
  ).toBeVisible();
});

test("split login and statistics period controls", async ({ page }) => {
  await page.setViewportSize({ width: 1900, height: 1000 });
  await page.goto("/");
  await expect(page.locator(".login-background img")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Forgot password?" }),
  ).toHaveAttribute("href", "/forgot-password");
  await expect(page.locator(".login-card form > button svg")).toHaveCount(0);
  await enter(page);
  await page
    .getByRole("button", { name: "Presentations", exact: true })
    .click();
  await expect(
    page.locator(".period-menu > [data-slot=collapsible-trigger]"),
  ).toHaveText("Today");
  await page.locator(".period-menu > [data-slot=collapsible-trigger]").click();
  await page.getByRole("radio", { name: /Last 7 days/ }).check();
  await expect(
    page.locator(".period-menu > [data-slot=collapsible-trigger]"),
  ).toHaveText("7 days");
  await expect(page.locator(".request-stat svg")).toHaveCount(4);
  await page.locator(".period-menu > [data-slot=collapsible-trigger]").click();
  await page.getByRole("radio", { name: /Last 30 days/ }).check();
  await expect(
    page.locator(".period-menu > [data-slot=collapsible-trigger]"),
  ).toHaveText("30 days");
  expect(
    (await page.locator(".list-page").boundingBox())?.width,
  ).toBeGreaterThan(1600);
});
