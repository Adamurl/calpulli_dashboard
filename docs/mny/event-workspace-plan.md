# Event workspace and presentation dashboard ideas

This is a feature plan. Items below are proposals unless marked as already available.

## Navigation

Keep Mexica New Year as an event workspace with an overview and event-specific sections for vendor applications, spot assignments, email, and eventually volunteers, dancers, parking, and other event needs. The current vendor application list remains under Mexica New Year.

A separate Vendors section across events may become useful when another event needs it. Design that section around a shared vendor profile and event-specific applications, decisions, payments, and assignments. Do not assume a vendor's decision or spot carries over to another event.

## Mexica New Year overview

- Show application totals and a graph of vendor signups over time, with an event-year selector.
- Show a map of the event and vendor spots. Distinguish available, assigned, and unavailable spots when inventory and map coordinates exist. Link assigned spots to vendor records.
- Show new event-related emails and outstanding follow-ups. Define how an email is identified as event-related before displaying it here.
- Add sections for volunteers, dancers, parking, and other logistics when their workflows are defined.

## Vendor applications and decisions

The application list and vendor detail pages already exist. The API can record an individual acceptance or decline separately from email delivery. The bulk editor can change selected vendors individually or set one application status for all selected vendors. Historical application status uses imported application and acceptance email records. Payment and spot assignment are separate.

- Design decision controls and add decision history to Activity.
- Keep decisions separate from email delivery. The individual decision records its time and rejects conflicting edits.
- Add selection and bulk acceptance, with a review of the selected applications and a result for each one. Prevent repeated actions from creating duplicate decisions.
- Add a separate bulk acceptance email workflow. Review recipients and message content before sending. Track delivery per recipient, failures, and retries so a retry does not resend successful messages. Sending requires explicit authorization.
- Decide whether and how staff can reverse a decision, and how declined applications appear in the list. Avoid changing historical records based on missing data.

## Presentation overview

Create a month calendar for confirmed events and proposed event dates. Clearly distinguish a proposed date from a booked event and link each entry to its inquiry. Provide a list view for accessibility and busy months.

Show presentation-specific notifications and follow-ups near the calendar, including new inquiries, relevant contact form requests, new emails, and messages needing a reply. Define matching and follow-up rules so unrelated mailbox messages do not appear as presentation work. Reuse established home-page patterns where they fit.

## Suggested delivery order

1. Align vendor navigation and detail layout with presentation details.
2. Verify individual vendor decisions against PostgreSQL and add a visible decision history.
3. Verify bulk selection and acceptance with conflict handling against PostgreSQL.
4. Add reviewed, per-recipient acceptance emails and delivery tracking.
5. Build the Mexica New Year overview using available application and inventory data. Add the map when coordinates and an event layout are available.
6. Build the presentation calendar and section-specific notifications. Add volunteer, dancer, and parking workflows after their requirements are defined.
