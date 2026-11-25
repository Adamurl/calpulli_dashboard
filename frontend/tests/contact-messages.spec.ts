import { expect, test } from "@playwright/test";

test("staff can open a website submission in the Inbox and page through messages", async ({
  page,
}) => {
  const message = {
    id: "f917be60-b445-4089-81fe-1ebf2ad56526",
    first_name: "Avery",
    last_name: "Example",
    email: "avery@example.com",
    phone: "+1 408 555 0100",
    message: "Hello,\n<em>Is the event open to the public?</em>",
    received_at: "2026-11-22T17:00:00Z",
  };
  await page.route("**/api/v1/contact-messages?*", async (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer fictional-browser-fixture-token",
    );
    const first = route.request().url().endsWith("offset=0");
    await route.fulfill({
      json: {
        messages: first
          ? [message]
          : [
              {
                ...message,
                id: "older",
                first_name: null,
                last_name: null,
                email: null,
                phone: null,
              },
            ],
        previous_offset: first ? null : 0,
        next_offset: first ? 20 : null,
      },
    });
  });
  await page.goto("/tests/live-fixture.html?contact-messages&path=%2Finbox");
  const section = page.getByRole("region", {
    name: "Website contact messages",
  });
  await section.getByText("Avery Example").click();
  await expect(section.getByText(message.email)).toBeVisible();
  await expect(section.getByText(message.phone)).toBeVisible();
  await expect(section.getByText(/<em>Is the event open/)).toBeVisible();
  await section.getByRole("button", { name: "Older messages" }).click();
  await expect(section.getByText("Website visitor")).toBeVisible();
  await section.getByRole("button", { name: "Newer messages" }).click();
  await expect(section.getByText("Avery Example")).toBeVisible();
});
