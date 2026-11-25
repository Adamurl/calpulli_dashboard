import { formatClientPhone, optionalText } from "../display";
import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import {
  ChevronDown,
  ChevronUp,
  Circle,
  Facebook,
  Globe,
  Instagram,
  Mail,
  Pencil,
  Phone,
} from "lucide-react";
import { ApiError, apiFetch } from "../api";
import {
  spotCountForSpace,
  vendorCommentSchema,
  vendorDetailSchema,
  vendorStages,
  vendorTypeLabel,
} from "../vendorData";
import type { VendorComment, VendorDetail } from "../vendorData";
import { CommentComposer } from "./CommentComposer";
import { OutlookMailbox } from "./OutlookMailbox";
import { Modal } from "./ui";

const profileFields = [
  ["business_name", "Business name"],
  ["category", "Vendor type"],
  ["requested_space", "Requested space"],
  ["contact_name", "Contact name"],
  ["email", "Email"],
  ["phone", "Phone"],
  ["website", "Website"],
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
] as const;
type ProfileField = (typeof profileFields)[number][0];
type Profile = Record<ProfileField, string | null>;
type VendorPatch = Partial<Profile>;

const submittedDateTime = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeStyle: "short",
});

const money = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function record(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() || null : null;
}

function amount(value: unknown) {
  const raw = typeof value === "number" ? value : text(value);
  return raw !== null && Number.isFinite(Number(raw))
    ? money.format(Number(raw))
    : null;
}

function timestamp(value: unknown) {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

function webLink(value: string, platform?: "instagram" | "facebook") {
  const handle = /^@?[\w.]+$/.test(value);
  const candidate =
    platform && handle
      ? `https://www.${platform}.com/${value.replace(/^@/, "")}`
      : /^[a-z][a-z\d+.-]*:/i.test(value)
        ? value
        : `https://${value}`;
  try {
    const url = new URL(candidate);
    return ["http:", "https:"].includes(url.protocol) &&
      url.hostname.includes(".") &&
      !url.username &&
      !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

function FactRows({ rows }: { rows: [string, ReactNode][] }) {
  return (
    <dl>
      {rows.map(([label, value]) => (
        <div className="fact-pair" key={label}>
          <dt>{label}</dt>
          <dd>
            {(typeof value === "string" ? optionalText(value) : value) ?? "-"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function VendorEdit({
  profile,
  close,
  save,
  saving,
  error,
}: {
  profile: Profile;
  close: () => void;
  save: (changes: VendorPatch) => void;
  saving: boolean;
  error: string;
}) {
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    const changes: VendorPatch = {};
    for (const [key] of profileFields) {
      const original = profile[key] ?? "";
      const value = text(values.get(key));
      if ((value ?? "") !== original) changes[key] = value;
    }
    if (Object.keys(changes).length) save(changes);
    else close();
  }

  return (
    <Modal title="Edit vendor" close={close} wide>
      <form onSubmit={submit}>
        <fieldset
          className="composer-body vendor-edit-fields"
          disabled={saving}
        >
          {profileFields.map(([field, label]) => (
            <label key={field}>
              {label}
              <input
                name={field}
                defaultValue={profile[field] ?? ""}
                inputMode={
                  field === "email"
                    ? "email"
                    : field === "phone"
                      ? "tel"
                      : undefined
                }
                maxLength={500}
              />
            </label>
          ))}
        </fieldset>
        <div className="modal-footer">
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <div>
            <button className="button" type="button" onClick={close}>
              Cancel
            </button>
            <button className="button primary" disabled={saving}>
              {saving ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function VendorActivity({
  submitted,
  created,
  accepted,
  comments,
  importedNotes,
  staffName,
  commentPath,
}: {
  submitted: Date | null;
  created: Date | null;
  accepted: Date | null;
  comments: VendorComment[];
  importedNotes: string[];
  staffName: string;
  commentPath: `/api/v1/${string}`;
}) {
  const [posted, setPosted] = useState<VendorComment[]>([]);
  const [draft, setDraft] = useState("");
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState("");
  const entries = [
    {
      id: "submitted",
      title: "Application received",
      at: submitted,
      kind: "created",
      body: null,
    },
    {
      id: "created",
      title: "Vendor record created",
      at: created,
      kind: "created",
      body: null,
    },
    {
      id: "accepted",
      title: "Acceptance email sent",
      at: accepted,
      kind: "email_sent",
      body: null,
    },
    ...[...comments, ...posted].map((comment) => ({
      id: comment.id,
      title: "Staff comment",
      at: new Date(comment.created_at),
      kind: "note_added",
      body: comment.body,
    })),
  ]
    .flatMap(({ at, ...entry }) => (at ? [{ ...entry, at }] : []))
    .sort((a, b) => b.at.getTime() - a.at.getTime());

  async function post(body: string) {
    setError("");
    setPosting(true);
    try {
      const response = await apiFetch(commentPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      const comment = vendorCommentSchema.parse(await response.json());
      setPosted((current) => [...current, comment]);
      setDraft("");
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Unable to post the comment. Try again.",
      );
    } finally {
      setPosting(false);
    }
  }

  const dateLabel = (at: Date) =>
    at.toLocaleDateString([], {
      weekday: "long",
      month: "long",
      day: "numeric",
      year: "numeric",
    });

  return (
    <div className="activity-pane vendor-activity">
      <section className="timeline-section">
        <h2>
          Activity{" "}
          <span className="muted">
            Only you and other staff can see comments
          </span>
        </h2>
        <CommentComposer
          staffName={staffName}
          value={draft}
          onChange={setDraft}
          onPost={(comment) => void post(comment)}
          saving={posting}
        />
        {error && (
          <p role="alert" className="error">
            {error}
          </p>
        )}
        {entries.length || importedNotes.length ? (
          <div className="shopify-timeline">
            {entries.map(({ id, title, at, kind, body }, index) => (
              <div key={id}>
                {(index === 0 ||
                  dateLabel(at) !== dateLabel(entries[index - 1].at)) && (
                  <div className="timeline-day">{dateLabel(at)}</div>
                )}
                <article className={`shopify-activity activity-${kind}`}>
                  <span className="shopify-activity-dot" />
                  <div className="shopify-activity-copy">
                    <header>
                      <strong>{title}</strong>
                      <time dateTime={at.toISOString()}>
                        {at.toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </header>
                    {body && <p>{body}</p>}
                  </div>
                </article>
              </div>
            ))}
            {importedNotes.length > 0 && (
              <>
                <div className="timeline-day">
                  Earlier notes · date unavailable
                </div>
                {importedNotes.map((note) => (
                  <article
                    className="shopify-activity activity-note_added"
                    key={note}
                  >
                    <span className="shopify-activity-dot" />
                    <div className="shopify-activity-copy">
                      <strong>Staff note</strong>
                      <p>{note}</p>
                    </div>
                  </article>
                ))}
              </>
            )}
          </div>
        ) : (
          <p className="empty-activity">No activity is recorded.</p>
        )}
      </section>
    </div>
  );
}

export function VendorRecord({
  initial,
  staffName,
  path,
  commentPath,
  back,
  move,
  onSaved,
}: {
  initial: VendorDetail;
  staffName: string;
  path: `/api/v1/${string}`;
  commentPath: `/api/v1/${string}`;
  back: ReactNode;
  move: (id: string) => void;
  onSaved: () => void;
}) {
  const [vendor, setVendor] = useState(initial);
  const [view, setView] = useState<"Activity" | "Email thread">("Activity");
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const decision = record(vendor.responses.decision);
  const legacy = record(vendor.responses.legacy_vendor);
  const staff = record(vendor.responses.staff_details);
  const submitted = timestamp(vendor.submitted_at ?? legacy.submitted_at);
  const accepted = timestamp(legacy.acceptance_email_sent_at);
  const hasAcceptance =
    Boolean(accepted) || legacy.acceptance_email_sent === true;
  const payment = optionalText(text(legacy.payment_status));
  const paid = payment?.toLowerCase() === "paid";
  const zelle = amount(legacy.zelle_amount);
  const cash = amount(legacy.cash_amount);
  const paymentMethod = optionalText(text(legacy.payment_method));
  const reportedMethod = paymentMethod?.toLowerCase();
  const importedNotes = [
    ...new Set(
      [
        text(staff.staff_note),
        text(legacy.internal_notes),
        text(legacy.additional_notes),
      ].filter((note) => note !== null),
    ),
  ];
  const comments = Array.isArray(initial.responses.comments)
    ? initial.responses.comments.flatMap((entry) => {
        const parsed = vendorCommentSchema.safeParse(entry);
        return parsed.success ? [parsed.data] : [];
      })
    : [];
  const contactName = optionalText(vendor.contact_name);
  const contactEmail = optionalText(vendor.email);
  const contactPhone = optionalText(vendor.phone);
  const mailingAddress = optionalText(
    text(vendor.responses.mailing_address ?? legacy.mailing_address),
  );
  const phoneLink = contactPhone?.replace(/[^+\d]/g, "");
  const profile: Profile = {
    business_name: vendor.business_name,
    category: vendor.category,
    contact_name: vendor.contact_name,
    email: vendor.email,
    phone: vendor.phone,
    requested_space:
      "requested_space" in staff
        ? text(staff.requested_space)
        : text(vendor.responses.booth_size_requested ?? legacy.requested_space),
    website:
      "website" in staff
        ? text(staff.website)
        : text(vendor.responses.website ?? legacy.website),
    instagram:
      "instagram" in staff
        ? text(staff.instagram)
        : text(vendor.responses.instagram ?? legacy.instagram),
    facebook:
      "facebook" in staff
        ? text(staff.facebook)
        : text(vendor.responses.facebook ?? legacy.facebook),
  };
  const requestedCount =
    spotCountForSpace(profile.requested_space) ?? vendor.requested_spot_count;
  const paymentRows: [string, ReactNode][] = [
    [
      "Payment status",
      payment
        ? payment
            .replace(/[_-]/g, " ")
            .replace(/^./, (character) => character.toUpperCase())
        : null,
    ],
    ["Total paid", amount(legacy.amount_paid)],
    ["Requested spots", requestedCount],
    [
      "Paid before deadline",
      vendor.paid_before_deadline === null
        ? null
        : vendor.paid_before_deadline
          ? "Yes"
          : "No",
    ],
  ];
  if (hasAcceptance || paid)
    paymentRows.push(["Amount due", amount(legacy.amount_due)]);
  const methodRows: [string, ReactNode][] = [
    ["Zelle", zelle ?? (reportedMethod === "zelle" ? "Recorded" : null)],
    ["Cash", cash ?? (reportedMethod === "cash" ? "Recorded" : null)],
  ];
  if (paymentMethod && reportedMethod !== "cash" && reportedMethod !== "zelle")
    methodRows.push(["Other method", paymentMethod]);
  const merchandise = optionalText(
    text(vendor.responses.merchandise ?? legacy.merchandise),
  );
  const links = [
    {
      label: "Instagram",
      Icon: Instagram,
      value: optionalText(profile.instagram),
      href: profile.instagram
        ? webLink(profile.instagram, "instagram")
        : undefined,
    },
    {
      label: "Facebook",
      Icon: Facebook,
      value: optionalText(profile.facebook),
      href: profile.facebook
        ? webLink(profile.facebook, "facebook")
        : undefined,
    },
    {
      label: "Website",
      Icon: Globe,
      value: optionalText(profile.website),
      href: profile.website ? webLink(profile.website) : undefined,
    },
  ];
  const spots = new Map<string, Record<string, unknown>>(
    (vendor.assigned_spot_labels ?? []).map((label) => [label, {}]),
  );
  const linked = vendor.responses.linked_spots;
  if (Array.isArray(linked)) {
    for (const entry of linked) {
      const spot = record(record(entry).spot);
      const label =
        typeof spot.label === "number" ? String(spot.label) : text(spot.label);
      if (label) spots.set(label, spot);
    }
  }
  const stage = vendorStages[vendor.stage];

  function openEditor() {
    setError("");
    setEditOpen(true);
  }
  async function save(changes: VendorPatch) {
    setSaving(true);
    setError("");
    try {
      const response = await apiFetch(path, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(changes),
      });
      setVendor(vendorDetailSchema.parse(await response.json()));
      setEditOpen(false);
      onSaved();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.message
          : "Unable to save vendor changes. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="detail-page live-detail vendor-detail">
      <div className="detail-toolbar">
        {back}
        <div className="detail-actions">
          <button className="button" onClick={openEditor} disabled={saving}>
            <Pencil size={14} aria-hidden="true" /> Edit
          </button>
          <button
            className="icon-button"
            aria-label="Previous vendor"
            title="Previous vendor"
            disabled={!vendor.previous_id || saving}
            onClick={() => vendor.previous_id && move(vendor.previous_id)}
          >
            <ChevronUp size={17} aria-hidden="true" />
          </button>
          <button
            className="icon-button"
            aria-label="Next vendor"
            title="Next vendor"
            disabled={!vendor.next_id || saving}
            onClick={() => vendor.next_id && move(vendor.next_id)}
          >
            <ChevronDown size={17} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="detail-grid">
        <div className="detail-main">
          <div className="detail-title">
            <div>
              <h2>
                {optionalText(vendor.business_name) ?? "-"}
                <span className={`badge ${stage.color}`}>
                  <Circle size={8} aria-hidden="true" />
                  {vendor.stage === "unknown" ? "-" : stage.label}
                </span>
              </h2>
              <p className="presentation-source">
                {submitted ? (
                  <>
                    Submitted{" "}
                    <time dateTime={submitted.toISOString()}>
                      {submittedDateTime.format(submitted)}
                    </time>{" "}
                    from Mexica New Year {vendor.event_year}
                  </>
                ) : (
                  <>Mexica New Year {vendor.event_year}</>
                )}
              </p>
            </div>
          </div>
          <div className="presentation-overview presentation-overview--stacked">
            <section
              className="card detail-facts"
              aria-label="Business overview"
            >
              <h3>Business overview</h3>
              <FactRows
                rows={[
                  ["Vendor type", vendorTypeLabel(vendor.category)],
                  [
                    "Social media followers",
                    vendor.follower_count === null
                      ? null
                      : vendor.follower_count.toLocaleString("en-US"),
                  ],
                  [
                    "Tribal affiliation",
                    text(
                      vendor.responses.tribal_affiliation ??
                        legacy.tribal_affiliation,
                    ),
                  ],
                  ...links.flatMap<[string, ReactNode]>(
                    ({ label, Icon, value, href }) =>
                      value
                        ? [
                            [
                              label,
                              <span className="vendor-link">
                                <Icon size={14} aria-hidden="true" />
                                {href ? (
                                  <a
                                    href={href}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    {value}
                                  </a>
                                ) : (
                                  value
                                )}
                              </span>,
                            ],
                          ]
                        : [],
                  ),
                ]}
              />
              {merchandise && (
                <dl className="vendor-merchandise">
                  <div className="fact-pair">
                    <dt>Merchandise</dt>
                    <dd>{merchandise}</dd>
                  </div>
                </dl>
              )}
            </section>
            <section className="card detail-facts" aria-label="Payment">
              <h3>Payment</h3>
              <FactRows rows={paymentRows} />
              <h4 className="vendor-payment-methods">Payment methods</h4>
              <FactRows rows={methodRows} />
            </section>
          </div>
          <section
            className="card detail-facts vendor-spots"
            aria-label="Assigned spots"
          >
            <h3>Assigned spots</h3>
            <FactRows rows={[["Requested space", profile.requested_space]]} />
            <div className="template-table-wrap">
              <table className="template-table" aria-label="Assigned spots">
                <thead>
                  <tr>
                    <th scope="col">Spot</th>
                    <th scope="col">Ring</th>
                    <th scope="col">Spot status</th>
                    <th scope="col">Price</th>
                  </tr>
                </thead>
                <tbody>
                  {[...spots].map(([label, spot]) => (
                    <tr key={label}>
                      <th scope="row">{label}</th>
                      <td>
                        {typeof spot.ring === "number"
                          ? spot.ring
                          : (optionalText(text(spot.ring)) ?? "-")}
                      </td>
                      <td>{optionalText(text(spot.status)) ?? "-"}</td>
                      <td>{amount(spot.price) ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <div
            className="detail-tabs"
            role="tablist"
            aria-label="Vendor sections"
          >
            {(["Activity", "Email thread"] as const).map((name, index) => (
              <button
                key={name}
                role="tab"
                id={`vendor-tab-${index}`}
                aria-controls={`vendor-panel-${index}`}
                aria-selected={view === name}
                className={view === name ? "selected" : ""}
                onClick={() => setView(name)}
              >
                {name}
              </button>
            ))}
          </div>
          <div
            role="tabpanel"
            id={`vendor-panel-${view === "Activity" ? 0 : 1}`}
            aria-labelledby={`vendor-tab-${view === "Activity" ? 0 : 1}`}
          >
            {view === "Activity" ? (
              <VendorActivity
                submitted={submitted}
                created={timestamp(legacy.created_at)}
                accepted={accepted}
                comments={comments}
                importedNotes={importedNotes}
                staffName={staffName}
                commentPath={commentPath}
              />
            ) : (
              <OutlookMailbox
                key={vendor.email}
                contact={{ address: vendor.email ?? "", kind: "vendor" }}
              />
            )}
          </div>
        </div>
        <aside className="client-sidebar vendor-sidebar">
          {text(decision.status) && (
            <section>
              <h2>Application decision</h2>
              <p>
                {text(decision.status) === "accepted" ? "Accepted" : "Denied"}.
                No email was sent by this action.
              </p>
            </section>
          )}
          <section>
            <h2>Contact</h2>
            <h3>{contactName ?? "-"}</h3>
            {contactEmail && (
              <a
                className="contact-link"
                href={`mailto:${encodeURIComponent(contactEmail).replace(/%40/g, "@")}`}
              >
                <Mail size={14} aria-hidden="true" />{" "}
                {contactEmail.toLowerCase()}
              </a>
            )}
            {contactPhone && (
              <a
                className="contact-link"
                href={phoneLink ? `tel:${phoneLink}` : undefined}
              >
                <Phone size={14} aria-hidden="true" />{" "}
                {formatClientPhone(contactPhone)}
              </a>
            )}
            {mailingAddress && <p>{mailingAddress}</p>}
          </section>
        </aside>
      </div>
      {editOpen && (
        <VendorEdit
          profile={profile}
          close={() => setEditOpen(false)}
          save={(changes) => void save(changes)}
          saving={saving}
          error={error}
        />
      )}
    </div>
  );
}
