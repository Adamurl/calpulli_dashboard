# Integration contracts and setup

Detailed wire contracts are in the [Wix webhook reference](presentations/wix-webhook.md) and [Gmail provider reference](email/gmail-provider.md). Application-level email endpoints are documented in the [email workflow API](email/api.md).

## Current state

A normalized Wix receiver is implemented locally. Its real Automation mapping and delivery have not been verified. The Gmail sending adapter and environment-based refresh-token support are implemented locally; see [Email workflow](email/README.md). OAuth consent setup, live sending, Pub/Sub, and background synchronization remain unactivated or planned. No integration has been activated and no hosted receiver URL exists yet.

## Wix Automation target

The intended flow is Wix Forms, then **Send HTTP request**, then FastAPI, then PostgreSQL. The target is the hosted backend route:

```text
https://<your-api-host>/api/v1/integrations/wix/presentations
```

This is a deployment placeholder, not a live URL. Do not send the form to a Supabase REST table or include database credentials in Wix.

[Wix's HTTP request documentation](https://support.wix.com/en/article/the-new-automation-builder-sending-data-via-webhook) describes **Choose fields**, custom key mapping, body nesting, and **Preview request body**. The current adapter accepts the explicit contract below. It does not guess the format of **All automation data**.

## Configure the request after preview review

1. Set the method to **POST**.
2. Choose **Choose fields** and map exact API key names to form values.
3. Enable **Nest request body under data**.
4. Add the stable provider `submission_id` and the form's `form_id`.
5. Add `webhook_token` as a private static value matching `WIX_WEBHOOK_TOKEN`. Do not map it from a requester-editable form field.
6. Map the required and optional presentation fields in [the data reference](presentations/README.md).
7. Preview a fictional test submission and confirm its actual JSON before activating the automation.

The backend also requires `WIX_FORM_ID`. It rejects a different form with HTTP 403. The form ID is an identifier, not a secret. Keep `WIX_WEBHOOK_TOKEN` separate from `INTERNAL_API_TOKEN`.

The body has a flat field map inside `data`. This fictional example deliberately leaves the credential blank and cannot authenticate:

```json
{
  "data": {
    "webhook_token": "",
    "form_id": "fictional-form",
    "submission_id": "fictional-submission",
    "event_date": "2027-03-20",
    "start_time": "14:00",
    "end_time": "15:00",
    "event_timezone": "America/Los_Angeles",
    "event_types": ["cultural_organization"],
    "event_purpose": "Fictional cultural education event",
    "venue_address": "Fictional venue, San Jose, CA",
    "estimated_guests": 100,
    "audience_distance_12ft": "yes",
    "unavailable_logistics": "None",
    "contact_first_name": "Sample",
    "contact_last_name": "Coordinator",
    "contact_email": "sample@example.org",
    "contact_phone": "+1 555 010 0200"
  }
}
```

Dates use ISO format. Times are local values; timezone is a separate field. Checkbox values must become arrays of the documented tokens, not display labels or comma-separated text. `estimated_guests` must be a JSON integer. Confirm these conversions using Wix's preview rather than assuming the form emits the required types. If Wix cannot produce this contract, adapt the provider boundary only after inspecting a real fictional payload.

## Persistence and recovery

A first accepted submission returns HTTP 201 with its internal UUID and `status=created`. A retry with the same form ID, submission ID, and normalized content returns HTTP 200 with `status=duplicate`. Changed content under the same identity returns HTTP 409. The receiver acknowledges after the request and its activity commit.

The body limit is 64 KiB. Errors never echo the credential or requester details. The source snapshot excludes `webhook_token`. Keep an operational record of failed deliveries without copying personal data into general logs.

End-to-end delivery, Wix retry timing, rate controls, alerting, and reconciliation remain deployment acceptance checks. No durable queue or worker is implemented.

1. Set the method to **POST**.
2. Choose **Choose fields** and map exact API key names to form values.
3. Enable **Nest request body under data**.
4. Add the stable provider `submission_id` and the form's `form_id`.
5. Add `webhook_token` as a private static value matching `WIX_WEBHOOK_TOKEN`. Do not map it from a requester-editable form field.
6. Map the required and optional presentation fields in [the data reference](PRESENTATIONS.md).
7. Preview a fictional test submission and confirm its actual JSON before activating the automation.

The local sending adapter supports OAuth refresh, `gmail.send`, MIME delivery, provider message/thread IDs, and outbound replies that retain conversation headers. Application drafts and approvals are implemented. Default delivery is mocked. See the [Gmail technical reference](email/gmail-provider.md) for exact inputs, outputs, and error handling.

An approved organizational mailbox and initial OAuth consent setup are still required for live activation. Incoming reply ingestion, Pub/Sub notifications, and background synchronization remain future work.

Future synchronization must persist progress and process messages idempotently. Notifications indicate a mailbox change; they are not the message-history source. Reconcile periodically, retry transient failures with bounded backoff, and define full resynchronization when incremental history expires.

Encrypt refresh tokens with separately managed keys. Restrict token access and define revocation, rotation, and reconnect procedures. Never log authorization codes, tokens, or email contents.

## Hosting decision

The receiver needs a reachable HTTPS backend before Wix can call it. [Vercel supports FastAPI](https://vercel.com/docs/frameworks/backend/fastapi), but a deployment still needs a plan review, database connection choice, dependency lockfile, secret setup, and request-limit checks. Do not assume a free plan is suitable for the organization's use.

Hosting is a later, separately authorized step. The current Docker and engine configuration is not claimed to be configured for a serverless transaction pooler. Verify prepared-statement support, connection options, and connection limits for the chosen Supabase endpoint before deployment.
