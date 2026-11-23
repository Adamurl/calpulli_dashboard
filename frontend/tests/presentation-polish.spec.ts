import { test, expect } from "@playwright/test";

const presentationFixture =
  "/tests/live-fixture.html?path=/presentations/11111111-1111-4111-8111-111111111111";

test.describe("presentation overview", () => {
  test.use({ timezoneId: "America/Los_Angeles" });

  test("shows the organization, submission source and stacked details", async ({
    page,
  }) => {
    const fixture =
      "/tests/live-fixture.html?path=/presentations/11111111-1111-4111-8111-111111111111";
    await page.goto(
      `${fixture}&presentation-source=wix&received-at=2026-11-22T17:02:00Z`,
    );
    await expect(
      page.getByRole("heading", { name: /Fictional Operations School/ }),
    ).toBeVisible();
    await expect(
      page.getByText("November 22, 2026 at 9:02 AM from website form"),
    ).toBeVisible();

    const request = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Request details", exact: true }),
    });
    const venue = page.locator("section").filter({
      has: page.getByRole("heading", { name: "Event and venue", exact: true }),
    });
    await expect(request.getByText("Fixture form notes")).toBeVisible();
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const requestBox = await request.boundingBox();
      const venueBox = await venue.boundingBox();
      if (!requestBox || !venueBox) throw new Error("Overview is not visible");
      expect(requestBox.x).toBeCloseTo(venueBox.x);
      expect(requestBox.width).toBeCloseTo(venueBox.width);
      expect(requestBox.y + requestBox.height).toBeLessThan(venueBox.y);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(width);
    }

    await page.goto(
      `${fixture}&organization-name=%20N%2FA%20&missing-received=1`,
    );
    await expect(
      page.getByRole("heading", { name: /Fixture Contact/, level: 2 }),
    ).toBeVisible();
    await expect(page.getByText("CSV import", { exact: true })).toBeVisible();
  });
});

test("reopening and saving an email draft preserves placeholders", async ({
  page,
}) => {
  await page.goto(
    "/tests/live-fixture.html?email-draft=1&path=/presentations/11111111-1111-4111-8111-111111111111",
  );
  await page.getByRole("tab", { name: "Email thread" }).click();
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  const editor = page.getByRole("dialog");
  await expect(editor.getByLabel("Subject", { exact: true })).toHaveValue(
    "Hello [Name]",
  );
  await expect(editor.getByLabel("Message", { exact: true })).toHaveValue(
    "Thanks, [Name]",
  );
  await editor.locator(".email-variable-inputs input").fill("Updated");
  await editor.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".email-card .email-text")).toHaveText(
    "Thanks, Updated",
  );
  await page.getByRole("button", { name: "Edit draft", exact: true }).click();
  await expect(editor.getByLabel("Message", { exact: true })).toHaveValue(
    "Thanks, [Name]",
  );
  await expect(editor.locator(".email-variable-inputs input")).toHaveValue(
    "Updated",
  );
});

test("templates, presentation facts, staff identity, chips and calendar", async ({
  page,
}) => {
  await page.goto("/tests/presentation-polish-check.html");
  await page.getByRole("button", { name: "Run polish checks" }).click();
  await expect(page.locator("#results h2")).toHaveText(
    "35 polish checks passed",
    { timeout: 60000 },
  );
  await expect(page.locator("#results .fail")).toHaveCount(0);
});

test("calendar keyboard selection, clearing and Escape preserve the editor", async ({
  page,
}) => {
  await page.goto(
    "/tests/live-fixture.html?path=/presentations/11111111-1111-4111-8111-111111111111",
  );
  for (const field of ["Website", "Expected guests", "Event types"]) {
    const fact = page.locator(".fact-pair").filter({
      has: page.getByText(field, { exact: true }),
    });
    await expect(fact.locator("dd")).toHaveText("-");
  }
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Edit presentation details",
  });
  const trigger = editor.getByRole("button", { name: /Event date/ });
  await trigger.click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  await expect(trigger).not.toContainText("Choose date");
  await trigger.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await page.keyboard.press("Escape");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(editor).toBeVisible();
  await trigger.click();
  await editor.getByRole("button", { name: "Clear date" }).click();
  await expect(trigger).toContainText("Choose date");
  const chip = editor.getByRole("button", { name: "k12 school", exact: true });
  await chip.focus();
  await chip.press("Space");
  await expect(chip).toHaveAttribute("aria-pressed", "true");
});

test("template heading sits left of search on desktop and mobile", async ({
  page,
}) => {
  await page.goto("/tests/live-fixture.html?path=/presentations/templates");
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    const heading = page.getByRole("heading", {
      name: "Email templates",
      exact: true,
    });
    const search = page.getByRole("button", {
      name: "Search workspace",
      exact: true,
    });
    await expect(heading).toBeVisible();
    await expect(search).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Preview TEST_INQUIRY" }),
    ).toHaveCount(0);
    const headingBox = await heading.boundingBox();
    const searchBox = await search.boundingBox();
    if (!headingBox || !searchBox)
      throw new Error("Template header is not visible");
    expect(headingBox.x + headingBox.width).toBeLessThan(searchBox.x);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page
    .getByRole("button", { name: "Search workspace", exact: true })
    .click();
  await expect(
    page.getByRole("dialog", { name: "Search your workspace" }),
  ).toBeVisible();
});
