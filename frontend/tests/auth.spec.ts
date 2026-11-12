import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

const userId = "11111111-1111-4111-8111-111111111111";
function session() {
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) =>
    Buffer.from(JSON.stringify(value)).toString("base64url");
  return {
    access_token: `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp: expiresAt, aud: "authenticated", role: "authenticated" })}.fictional-signature`,
    refresh_token: "fictional-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: expiresAt,
    user: {
      id: userId,
      aud: "authenticated",
      role: "authenticated",
      email: "staff@example.org",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
      is_anonymous: false,
      created_at: "2026-01-01T00:00:00Z",
    },
  };
}

async function login(page: Page) {
  const data = session();
  await page.route("**/auth/v1/token?grant_type=password", (route) =>
    route.fulfill({ json: data }),
  );
  await page.route("**/auth/v1/logout**", (route) =>
    route.fulfill({ status: 204 }),
  );
  await page.goto("/");
  await page.getByLabel("Email address").fill("staff@example.org");
  await page.getByLabel("Password", { exact: true }).fill("fictional-password");
  await page.getByRole("button", { name: "Log in", exact: true }).click();
  return data;
}

test("signed-in staff sends their JWT to the same-origin API", async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route("**/api/v1/auth/me", (route) => {
    requests.push(route.request().headers()["authorization"]);
    return route.fulfill({ json: { id: userId } });
  });
  const data = await login(page);
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  expect(requests.length).toBeGreaterThan(0);
  expect(
    requests.every((header) => header === `Bearer ${data.access_token}`),
  ).toBe(true);
});

test("logged-in users without staff approval cannot enter the workspace", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({ status: 403, json: { error: { code: "http_403" } } }),
  );
  await login(page);
  await expect(page.getByRole("alert")).toContainText(
    "does not have staff access",
  );
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByRole("button", { name: "Log out", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Welcome back." }),
  ).toBeVisible();
});

test("unavailable authentication can be retried without opening the workspace", async ({
  page,
}) => {
  let available = false;
  await page.route("**/api/v1/auth/me", (route) =>
    available
      ? route.fulfill({ json: { id: userId } })
      : route.fulfill({ status: 503, json: { error: { code: "http_503" } } }),
  );
  await login(page);
  await expect(page.getByRole("alert")).toContainText("Unable to verify");
  await expect(page.getByRole("navigation")).toHaveCount(0);
  available = true;
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
});

test("an HTML SPA fallback cannot be mistaken for API approval", async ({
  page,
}) => {
  await page.route("**/api/v1/auth/me", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: "<!doctype html><h1>Frontend</h1>",
    }),
  );
  await login(page);
  await expect(page.getByRole("alert")).toContainText("Unable to verify");
  await expect(page.getByRole("navigation")).toHaveCount(0);
});

test("fictional demo mode never requests API access", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.startsWith("/api/"))
      requests.push(request.url());
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Explore demo workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Home", exact: true }),
  ).toBeVisible();
  expect(requests).toEqual([]);
});
