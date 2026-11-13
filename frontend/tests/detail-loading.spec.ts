import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";

const id = "11111111-1111-4111-8111-111111111111";
const path = `/presentations/${id}`;
declare global {
  interface Window {
    fixture: {
      id: string;
      calls: { path: string; method: string; aborted?: boolean }[];
      detailDelay: number;
      noteDelay: number;
      operationsFailure: boolean;
      signInAgain: () => void;
    };
  }
}

async function fixture(page: Page, parameters = "") {
  await page.goto(`/tests/live-fixture.html?path=${path}&${parameters}`);
}

test("direct details prioritize the record and progressively fill independent sections", async ({
  page,
}) => {
  await fixture(
    page,
    "detail-delay=1200&operations-delay=2200&activities-delay=600",
  );
  await expect(page.locator(".presentation-skeleton")).toBeVisible();
  await expect(page.locator(".presentation-skeleton")).toHaveAttribute(
    "aria-busy",
    "true",
  );
  await expect(
    page.getByRole("button", { name: "Back to presentations" }),
  ).toBeVisible();
  await expect(page.locator(".client-sidebar h3")).toHaveText(
    "Fixture Contact",
  );
  await expect(
    page.getByLabel("Loading operational information", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Loading internal notes", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reload request" }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Loading internal notes", { exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Loading operational information", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("1200.00", { exact: true })).toBeVisible();
  const requests = await page.evaluate(() =>
    window.fixture.calls
      .filter((call) => !call.aborted)
      .map((call) => call.path),
  );
  expect(
    requests.filter((url) => url.startsWith("/api/v1/presentations")),
  ).toEqual([
    `/api/v1/presentations/${id}`,
    `/api/v1/presentations/${id}/activities`,
    `/api/v1/presentations/${id}/operations`,
  ]);
});

test("conversation loads on demand and remains loaded between tab changes", async ({
  page,
}) => {
  await fixture(page, "email-delay=800");
  await expect(
    page.getByRole("tab", { name: "Conversation thread" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Conversation thread" }).click();
  await expect(
    page.getByLabel("Loading conversation history", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "No conversation history yet" }),
  ).toBeVisible();
  await page
    .getByRole("tab", { name: "Presentation details", exact: true })
    .click();
  await page.getByRole("tab", { name: "Conversation thread" }).click();
  expect(
    await page.evaluate(
      () =>
        window.fixture.calls.filter((call) => call.path.endsWith("/emails"))
          .length,
    ),
  ).toBe(1);
});

test("section retry preserves the loaded record and unsaved note", async ({
  page,
}) => {
  await fixture(page, "detail-delay=800");
  await expect(page.locator(".presentation-skeleton")).toBeVisible();
  await page.evaluate(() => {
    window.fixture.operationsFailure = true;
  });
  await expect(page.locator(".detail-sections [role=alert]")).toBeVisible();
  await page
    .getByLabel("Internal note", { exact: true })
    .fill("Keep this unsaved note");
  await page.evaluate(() => {
    window.fixture.operationsFailure = false;
  });
  await page
    .locator(".detail-sections [role=alert]")
    .getByRole("button", { name: "Try again" })
    .click();
  await expect(page.getByText("1200.00", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Internal note", { exact: true })).toHaveValue(
    "Keep this unsaved note",
  );
  expect(
    await page.evaluate(
      () =>
        window.fixture.calls.filter(
          (call) =>
            call.path === `/api/v1/presentations/${window.fixture.id}` &&
            !call.aborted,
        ).length,
    ),
  ).toBe(1);
  expect(
    await page.evaluate(
      () =>
        window.fixture.calls.filter((call) => call.path.endsWith("/operations"))
          .length,
    ),
  ).toBe(2);
});

test("detail URLs support history, refresh, and returning to the filtered index", async ({
  page,
}) => {
  const html = await readFile(
    new URL("./live-fixture.html", import.meta.url),
    "utf8",
  );
  await page.route("**/presentations/**", (route) =>
    route.request().isNavigationRequest()
      ? route.fulfill({ contentType: "text/html", body: html })
      : route.continue(),
  );
  await page.goto("/tests/live-fixture.html");
  await page
    .getByRole("textbox", { name: "Search presentations" })
    .fill("Fictional Operations");
  await page
    .getByRole("button", { name: "Fictional Operations School", exact: true })
    .click();
  await expect(page).toHaveURL(path);
  await expect(page.locator(".client-sidebar h3")).toHaveText(
    "Fixture Contact",
  );
  await page.goBack();
  await expect(page).toHaveURL("/presentations");
  await expect(
    page.getByRole("textbox", { name: "Search presentations" }),
  ).toHaveValue("Fictional Operations");
  await page.goForward();
  await expect(page).toHaveURL(path);
  await expect(page.locator(".client-sidebar h3")).toHaveText(
    "Fixture Contact",
  );
  await page.reload();
  await expect(page).toHaveURL(path);
  await expect(page.locator(".client-sidebar h3")).toHaveText(
    "Fixture Contact",
  );
  expect(
    await page.evaluate(() =>
      window.fixture.calls.some((call) =>
        /\/(index|statistics)$/.test(call.path),
      ),
    ),
  ).toBe(false);
  await page.getByRole("button", { name: "Back to presentations" }).click();
  await expect(page).toHaveURL("/presentations");
  await expect(
    page.getByRole("textbox", { name: "Search presentations" }),
  ).toBeVisible();
});

test("navigation aborts stale details and failed records do not load secondary sections", async ({
  page,
}) => {
  await fixture(page, "detail-delay=1800");
  await expect(page.locator(".presentation-skeleton")).toBeVisible();
  await page.evaluate(() => {
    window.fixture.detailDelay = 0;
    history.pushState(
      null,
      "",
      "/presentations/22222222-2222-4222-8222-000000000001",
    );
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.locator(".detail-title p")).toHaveText("Earlier fixture");
  expect(
    await page.evaluate(() =>
      window.fixture.calls
        .filter(
          (call) => call.path === `/api/v1/presentations/${window.fixture.id}`,
        )
        .every((call) => call.aborted),
    ),
  ).toBe(true);
  await page.evaluate(() => {
    history.pushState(
      null,
      "",
      "/presentations/99999999-9999-4999-8999-999999999999",
    );
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("alert")).toContainText(
    "This record was not found",
  );
  expect(
    await page.evaluate(
      () =>
        window.fixture.calls.filter(
          (call) =>
            call.path.includes("99999999") &&
            /\/(activities|emails|operations)$/.test(call.path),
        ).length,
    ),
  ).toBe(0);
});

test("detail skeletons fit mobile and respect reduced motion", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await fixture(page, "detail-delay=2500");
  await expect(page.locator(".presentation-skeleton")).toBeVisible();
  expect(
    await page
      .locator(".presentation-skeleton .skeleton")
      .first()
      .evaluate((element) => getComputedStyle(element).animationName),
  ).toBe("none");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("signed-out detail links return to the same presentation after staff approval", async ({
  page,
}) => {
  await fixture(page, "signed-out");
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
  expect(new URL(page.url()).searchParams.get("next")).toBe(path);
  await page.evaluate(() => window.fixture.signInAgain());
  await expect(page).toHaveURL(path);
  await expect(page.locator(".client-sidebar h3")).toHaveText(
    "Fixture Contact",
  );
});

test("leaving during a save still refreshes the preserved index after it settles", async ({
  page,
}) => {
  await page.goto("/tests/live-fixture.html");
  await page
    .getByRole("button", { name: "Fictional Operations School", exact: true })
    .click();
  await page
    .getByLabel("Internal note", { exact: true })
    .fill("Saved while returning to the list");
  await page.evaluate(() => {
    window.fixture.noteDelay = 2000;
  });
  const before = await page.evaluate(
    () =>
      window.fixture.calls.filter((call) => call.path.endsWith("/index"))
        .length,
  );
  await page.getByRole("button", { name: "Add note", exact: true }).click();
  await page.getByRole("button", { name: "Back to presentations" }).click();
  await page
    .getByRole("button", { name: "Fictional Operations School", exact: true })
    .click();
  await expect(page.locator(".client-sidebar h3")).toHaveText(
    "Fixture Contact",
  );
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.fixture.calls.filter((call) => call.path.endsWith("/index"))
            .length,
      ),
    )
    .toBeGreaterThan(before);
  await expect(page.locator(".timeline")).toContainText(
    "Saved while returning to the list",
  );
});
