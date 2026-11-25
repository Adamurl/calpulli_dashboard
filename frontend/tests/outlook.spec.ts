import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

const base = "**/api/v1/outlook";
const vendor = "33333333-3333-4333-8333-000000000000";
const presentation = "11111111-1111-4111-8111-111111111111";
const sender = "shared@example.invalid";
const customer = "customer@example.invalid";
const sent = {
  id: "SENT-01",
  conversation_id: "CONV-01",
  subject: "Workshop details",
  sender,
  recipients: [customer],
  at: "2026-11-18T10:00:00Z",
  body_text: "Thanks for your request.",
  has_attachments: false,
};
const incoming = {
  id: "IN-01",
  conversation_id: "CONV-01",
  subject: "Re: Workshop details",
  sender: customer,
  recipients: [sender],
  at: "2026-11-19T10:00:00Z",
  body_text: "Could you review this?\n\nThanks!",
  has_attachments: true,
};
function fixturePath(path: string) {
  return `/tests/live-fixture.html?outlook&path=${encodeURIComponent(path)}`;
}

async function stubMailbox(page: Page) {
  await page.route(`${base}/capabilities`, (route) =>
    route.fulfill({
      json: {
        mailbox_available: true,
        test_mode: false,
        mailbox_address: sender,
      },
    }),
  );
  await page.route(`${base}/messages?**`, (route) => {
    const query = new URL(route.request().url()).searchParams;
    const message = query.get("folder") === "inbox" ? incoming : sent;
    return route.fulfill({
      json: {
        messages: query.has("contact") ? [] : [message],
        next_skip:
          !query.has("contact") && query.get("skip") === "0" ? 25 : null,
      },
    });
  });
}

test("incoming Outlook thread opens every message, downloads an attachment and replies with a safely previewed attachment email", async ({
  page,
}) => {
  await stubMailbox(page);
  await page.route(`${base}/conversations/CONV-01`, (route) =>
    route.fulfill({ json: [incoming, sent] }),
  );
  await page.route(`${base}/messages/IN-01/attachments`, (route) =>
    route.fulfill({
      json: [
        {
          id: "ATT-01",
          name: "schedule.pdf",
          size: 12,
          content_type: "application/pdf",
        },
      ],
    }),
  );
  await page.route(`${base}/messages/IN-01/attachments/ATT-01`, (route) => {
    expect(route.request().headers().authorization).toBe(
      "Bearer fictional-browser-fixture-token",
    );
    return route.fulfill({
      contentType: "application/octet-stream",
      body: "fictional PDF",
    });
  });
  await page.route(`${base}/preview`, (route) => {
    expect(route.request().postDataJSON()).toEqual({
      body_text: "**Hello**\n\nSee the attached update.",
      format: "markdown",
    });
    return route.fulfill({
      json: {
        html: "<p><strong>Hello</strong></p><p>See the attached update.</p>",
      },
    });
  });
  const attempts: unknown[] = [];
  await page.route(`${base}/send`, (route) => {
    attempts.push(route.request().postDataJSON());
    return attempts.length === 1
      ? route.fulfill({ status: 409 })
      : route.fulfill({
          status: 202,
          json: {
            status: "accepted",
            message_id: "REPLY-01",
            conversation_id: "CONV-01",
          },
        });
  });

  await page.goto(fixturePath("/inbox"));
  const mailbox = page.getByRole("region", { name: "Outlook mailbox" });
  await expect(mailbox.getByRole("radio", { name: "Incoming" })).toBeChecked();
  await mailbox.getByRole("button", { name: /Re: Workshop details/ }).click();
  await expect(
    mailbox.getByRole("heading", { name: /Workshop details/ }),
  ).toHaveText(["Workshop details", "Re: Workshop details"]);
  await expect(
    mailbox.getByText("Could you review this?", { exact: false }),
  ).toHaveCSS("white-space", "pre-wrap");
  const download = page.waitForResponse(
    "**/api/v1/outlook/messages/IN-01/attachments/ATT-01",
  );
  await mailbox.getByRole("button", { name: "Download schedule.pdf" }).click();
  expect((await download).ok()).toBe(true);

  await mailbox
    .getByRole("article")
    .filter({
      has: page.getByRole("heading", { name: "Re: Workshop details" }),
    })
    .getByRole("button", { name: `Reply to ${customer}` })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("To", { exact: true })).toHaveValue(customer);
  await dialog.getByRole("radio", { name: "Formatted" }).click();
  const body = dialog.getByRole("textbox", { name: "Message" });
  await body.fill("Hello\n\nSee the attached update.");
  await body.evaluate((element) => {
    if (element instanceof HTMLTextAreaElement) element.setSelectionRange(0, 5);
  });
  await dialog.getByRole("button", { name: "Bold" }).click();
  await expect(body).toHaveValue("**Hello**\n\nSee the attached update.");
  await dialog.getByLabel("Attach files").setInputFiles([
    {
      name: "update.pdf",
      mimeType: "application/pdf",
      buffer: Buffer.from("new PDF"),
    },
    {
      name: "remove.png",
      mimeType: "image/png",
      buffer: Buffer.from("remove"),
    },
  ]);
  await dialog.getByRole("button", { name: "Remove remove.png" }).click();
  await dialog.getByRole("button", { name: "Review email" }).click();
  const preview = dialog.getByTitle("Formatted email preview");
  await expect(preview).toHaveAttribute("sandbox", "");
  await expect(preview.contentFrame().locator("strong")).toHaveText("Hello");
  await dialog.getByRole("button", { name: "Send email" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Check Sent Items");
  await dialog.getByRole("button", { name: "Check send status" }).click();
  await expect(
    mailbox.getByRole("status").filter({ hasText: "Accepted by Microsoft" }),
  ).toBeVisible();
  expect(attempts).toHaveLength(2);
  expect(attempts[0]).toEqual(attempts[1]);
  expect(attempts[0]).toEqual({
    request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    recipient: customer,
    subject: "Re: Workshop details",
    body_text: "**Hello**\n\nSee the attached update.",
    format: "markdown",
    attachments: [
      {
        name: "update.pdf",
        content_type: "application/pdf",
        content_base64: Buffer.from("new PDF").toString("base64"),
      },
    ],
    reply_to: "IN-01",
  });

  await mailbox.getByRole("button", { name: "More messages" }).click();
  await expect(
    mailbox.getByRole("button", { name: "Previous messages" }),
  ).toBeEnabled();
  await mailbox.getByRole("radio", { name: "Sent", exact: true }).click();
  await expect(
    mailbox.getByRole("button", { name: /Workshop details/ }),
  ).toBeVisible();
});

test("general composer picks real presentation and vendor records and personalizes active presentation templates", async ({
  page,
}) => {
  await stubMailbox(page);
  await page.goto(fixturePath("/inbox"));
  await page.getByRole("button", { name: "New Outlook email" }).click();
  const dialog = page.getByRole("dialog");
  const selector = dialog.getByRole("radiogroup", { name: "Recipient type" });
  await selector.getByRole("radio", { name: "Presentation client" }).click();
  await dialog
    .getByRole("searchbox", { name: "Search presentation client" })
    .fill("Fictional Operations School");
  const presentationChoice = dialog.getByRole("combobox", {
    name: "Presentation client",
    exact: true,
  });
  await presentationChoice.selectOption(presentation);
  await expect(dialog.getByLabel("To", { exact: true })).toHaveValue(
    "presentation@example.invalid",
  );
  await dialog
    .getByRole("combobox", { name: "Start with a template" })
    .selectOption("inquiry_received");
  await expect(dialog.getByRole("textbox", { name: "Message" })).toHaveValue(
    "Hello Fixture Contact,\n\nThank you for contacting Fictional Operations School.",
  );
  await selector.getByRole("radio", { name: "MNY vendor" }).click();
  await dialog
    .getByRole("searchbox", { name: "Search MNY vendor" })
    .fill("Fixture Artisan");
  await dialog
    .getByRole("combobox", { name: "MNY vendor", exact: true })
    .selectOption(vendor);
  await expect(dialog.getByLabel("To", { exact: true })).toHaveValue(
    "fixture@example.invalid",
  );
  await expect(dialog.getByRole("textbox", { name: "Message" })).toHaveValue(
    "",
  );
  await dialog.getByLabel("Attach files").setInputFiles({
    name: "too-large.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.alloc(2_500_001),
  });
  await expect(dialog.getByRole("alert")).toContainText("2.5 MB");
});

test("presentation and vendor Outlook tabs query their own recorded email addresses", async ({
  page,
}) => {
  await stubMailbox(page);
  await page.goto(fixturePath(`/presentations/${presentation}`));
  await page.getByRole("tab", { name: "Email thread" }).click();
  await expect(
    page.getByRole("heading", { name: "Email thread", exact: true }),
  ).toBeVisible();
  const presentationMessages = page.waitForRequest(
    (request) =>
      new URL(request.url()).searchParams.get("contact") ===
      "presentation@example.invalid",
  );
  await page.getByRole("radio", { name: "Outlook history" }).click();
  await presentationMessages;
  await page.getByRole("button", { name: "New Outlook email" }).click();
  await expect(
    page.getByRole("dialog").getByLabel("To", { exact: true }),
  ).toHaveValue("presentation@example.invalid");

  await page.goto(fixturePath(`/mexica-new-year/vendors/${vendor}`));
  const vendorMessages = page.waitForRequest(
    (request) =>
      new URL(request.url()).searchParams.get("contact") ===
      "fixture@example.invalid",
  );
  await page.getByRole("tab", { name: "Email thread" }).click();
  await vendorMessages;
  await page.getByRole("button", { name: "New Outlook email" }).click();
  await expect(
    page.getByRole("dialog").getByLabel("To", { exact: true }),
  ).toHaveValue("fixture@example.invalid");
});

test("GUID-configured mailbox avoids ambiguous reply targets and can discover inline files", async ({
  page,
}) => {
  await stubMailbox(page);
  await page.route(`${base}/capabilities`, (route) =>
    route.fulfill({
      json: { mailbox_available: true, test_mode: true, mailbox_address: null },
    }),
  );
  await page.route(`${base}/conversations/CONV-01`, (route) =>
    route.fulfill({ json: [incoming, sent] }),
  );
  await page.route(`${base}/messages/IN-01/attachments`, (route) =>
    route.fulfill({ json: [] }),
  );
  await page.route(`${base}/messages/SENT-01/attachments`, (route) =>
    route.fulfill({
      json: [
        {
          id: "INLINE-01",
          name: "inline.png",
          size: 8,
          content_type: "image/png",
        },
      ],
    }),
  );
  await page.goto(fixturePath("/inbox"));
  const mailbox = page.getByRole("region", { name: "Outlook mailbox" });
  await mailbox.getByRole("button", { name: /Re: Workshop details/ }).click();
  const outgoing = mailbox.getByRole("article").filter({
    has: page.getByRole("heading", { name: "Workshop details", exact: true }),
  });
  await expect(outgoing.getByRole("button", { name: /^Reply/ })).toHaveCount(0);
  await outgoing.getByRole("button", { name: "Check attachments" }).click();
  await expect(
    outgoing.getByRole("button", { name: "Download inline.png" }),
  ).toBeVisible();
  await mailbox.getByRole("button", { name: `Reply to ${customer}` }).click();
  await expect(page.getByRole("dialog")).toContainText("separate test message");
});
