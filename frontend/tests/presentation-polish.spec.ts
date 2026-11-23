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
    await expect(venue.locator("dt")).toHaveText([
      "Date",
      "Time",
      "Location",
      "Expected guests",
      "Audience distance",
      "Unavailable logistics",
    ]);
    await expect(page.getByLabel("Event calendar")).toHaveCount(0);
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

for (const timezoneId of ["America/Los_Angeles", "Pacific/Auckland"]) {
  test.describe(`calendar in ${timezoneId}`, () => {
    test.use({ timezoneId, viewport: { width: 1280, height: 900 } });

    test(`event schedule, pills and read-only calendar fit desktop and mobile in ${timezoneId}`, async ({
      page,
    }) => {
      await page.goto(
        `${presentationFixture}&event-details&event-date=2026-11-29&start-time=15:00:00&end-time=16:00:00`,
      );
      const calendar = page.getByRole("region", { name: "Event calendar" });
      await expect(calendar.getByText("November 2026")).toBeVisible();
      await expect(
        calendar.getByRole("gridcell", { selected: true }),
      ).toHaveText("29");
      await expect(calendar.getByRole("button")).toHaveCount(0);
      await expect(calendar.getByRole("combobox")).toHaveCount(0);
      await expect(page.getByText("3:00 – 4:00 PM")).toBeVisible();
      await expect(
        page.getByText("America/Los_Angeles", { exact: true }),
      ).toBeVisible();
      await expect(page.getByText("Time", { exact: true })).toHaveCSS(
        "color",
        "rgb(166, 166, 166)",
      );
      const zone = page.getByText("America/Los_Angeles", { exact: true });
      await expect(zone).toHaveCSS("color", "rgb(166, 166, 166)");
      await expect(zone).toHaveCSS("font-size", "10px");
      await expect(
        page
          .getByRole("list", { name: "Event types and setting" })
          .getByRole("listitem"),
      ).toHaveText([
        "K-12 school",
        "Community celebration",
        "Public",
        "Outdoor",
      ]);
      const venue = page.locator(".presentation-venue-facts");
      await expect(venue.getByText("Audience distance")).toBeVisible();
      await expect(venue.getByText("Microphone stand")).toBeVisible();
      await expect(calendar).toHaveClass(/\bcard\b/);
      await expect(venue.getByLabel("Event calendar")).toHaveCount(0);
      const desktopVenue = await venue.boundingBox();
      const desktopCalendar = await calendar.boundingBox();
      const monthGrid = await calendar.getByRole("grid").boundingBox();
      if (!desktopVenue || !desktopCalendar || !monthGrid)
        throw new Error("Desktop event details are missing");
      expect(desktopCalendar.x).toBeGreaterThan(
        desktopVenue.x + desktopVenue.width,
      );
      expect(desktopCalendar.y).toBeCloseTo(desktopVenue.y);
      await expect(calendar).toHaveCSS("padding", "20px");
      expect(monthGrid.width).toBeCloseTo(168);
      expect(desktopCalendar.width - monthGrid.width).toBeCloseTo(42);
      expect(desktopCalendar.height).toBeLessThanOrEqual(240);
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileVenue = await venue.boundingBox();
      const mobileCalendar = await calendar.boundingBox();
      if (!mobileVenue || !mobileCalendar)
        throw new Error("Mobile event details are missing");
      expect(mobileCalendar.y).toBeGreaterThan(
        mobileVenue.y + mobileVenue.height,
      );
      expect(mobileCalendar.width).toBeCloseTo(desktopCalendar.width);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth),
      ).toBeLessThanOrEqual(390);
    });
  });
}

test("schedule local times and the event calendar follow saved event dates", async ({
  page,
}) => {
  await page.goto(
    `${presentationFixture}&event-date=2026-11-30&start-time=11:30:00&end-time=12:15:00`,
  );
  await expect(page.getByText("11:30 AM – 12:15 PM")).toBeVisible();
  await page.getByRole("button", { name: "Edit", exact: true }).click();
  const editor = page.getByRole("dialog", {
    name: "Edit presentation details",
  });
  const date = editor.getByRole("button", { name: /Event date/ });
  await date.click();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Enter");
  await expect(date).toContainText("December 1st, 2026");
  await editor.getByRole("button", { name: "Save changes" }).click();
  const calendar = page.getByRole("region", { name: "Event calendar" });
  await expect(calendar.getByText("December 2026")).toBeVisible();
  await expect(calendar.getByRole("gridcell", { selected: true })).toHaveText(
    "1",
  );
  await page.goto(`${presentationFixture}&end-time=00:15:00`);
  await expect(page.getByText("End time", { exact: true })).toBeVisible();
  await expect(page.getByText("12:15 AM")).toBeVisible();
  await expect(calendar).toHaveCount(0);
});

test("sidebar status and the operations tab preserve workspace actions", async ({
  page,
}) => {
  await page.goto(
    `${presentationFixture}&operations-failure=1&client-phone=%2B14155550134&client-email=Fixture%40EXAMPLE.INVALID`,
  );
  const sidebar = page.locator(".client-sidebar");
  const status = sidebar.getByRole("button", { name: /Request status/ });
  await expect(status).toHaveText("Unknown");
  expect((await status.boundingBox())?.y).toBeLessThan(
    (await sidebar.getByRole("heading", { name: "Client" }).boundingBox())!.y,
  );
  await expect(sidebar.locator(".avatar")).toHaveCount(0);
  await expect(
    sidebar.getByRole("link", { name: "+1 (415) 555 - 0134" }),
  ).toHaveAttribute("href", "tel:+14155550134");
  await expect(
    sidebar.getByRole("link", { name: "fixture@example.invalid", exact: true }),
  ).toHaveAttribute("href", "mailto:Fixture@EXAMPLE.INVALID");
  await status.press("Enter");
  const reviewing = sidebar.getByRole("radio", { name: "In review" });
  const option = sidebar.locator("label").filter({ hasText: "In review" });
  const optionBox = await option.boundingBox();
  const textBox = await option
    .getByText("In review", { exact: true })
    .boundingBox();
  if (!optionBox || !textBox) throw new Error("Status option is missing");
  expect(textBox.x - optionBox.x).toBeCloseTo(8);
  const menuBox = await sidebar.locator(".status-picker-content").boundingBox();
  const triggerBox = await status.boundingBox();
  if (!menuBox || !triggerBox) throw new Error("Status dropdown is missing");
  expect(menuBox.width).toBeLessThanOrEqual(140);
  expect(menuBox.x).toBeCloseTo(triggerBox.x);
  await reviewing.focus();
  await reviewing.press("Space");
  await expect(status).toHaveText("In review");
  await expect(page.locator(".presentation-title .badge")).toHaveText(
    "In review",
  );
  await expect(page.getByText("Status changed", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Event operations" }).click();
  const operations = page.getByRole("tabpanel", { name: "Event operations" });
  await expect(operations.getByRole("alert")).toBeVisible();
  await page.evaluate(() => {
    window.fixture.operationsFailure = false;
  });
  await operations.getByRole("button", { name: "Try again" }).click();
  await expect(operations.getByText("1200.00")).toBeVisible();
  await operations.getByRole("button", { name: "Operational details" }).click();
  await expect(operations.getByText("Three reserved spaces")).toBeVisible();
  await expect(sidebar.getByText("Payment and paperwork")).toHaveCount(0);

  await page.goto(
    `${presentationFixture}&operations-missing=1&status-conflict=1`,
  );
  await page.getByRole("tab", { name: "Event operations" }).click();
  await expect(
    operations.getByText("No operational information is recorded."),
  ).toBeVisible();
  await status.click();
  await sidebar.getByText("In review", { exact: true }).click();
  await expect(sidebar.getByRole("alert")).toContainText(
    "This request changed",
  );
  await expect(status).toHaveText("Unknown");
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
  for (const field of ["Website", "Expected guests"]) {
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
  const calendar = editor.getByRole("region", { name: "Event date calendar" });
  await expect(calendar.getByRole("navigation")).toHaveCount(0);
  await expect(calendar.getByRole("combobox")).toHaveCount(2);
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
