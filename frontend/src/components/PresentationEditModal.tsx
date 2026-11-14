import { useState } from "react";
import type { FormEvent } from "react";
import type { Presentation } from "../presentations";
import { Modal } from "./ui";
import { DatePicker } from "./DatePicker";

const eventTypeOptions = [
  "k12_school",
  "college_university",
  "nonprofit",
  "government",
  "corporate",
  "cultural_organization",
  "funeral",
  "grand_opening",
  "other",
] as const;
const referralOptions = [
  "website",
  "instagram",
  "facebook",
  "tiktok",
  "word_of_mouth",
  "mexica_new_year",
  "previous_performance",
  "referral",
  "other",
] as const;

type EditForm = {
  event_date: string;
  start_time: string;
  end_time: string;
  event_timezone: string;
  event_access: string;
  event_setting: string;
  event_types: string[];
  event_purpose: string;
  venue_address: string;
  estimated_guests: string;
  audience_distance_12ft: string;
  unavailable_logistics: string;
  organization_name: string;
  contact_first_name: string;
  contact_last_name: string;
  contact_email: string;
  contact_phone: string;
  organization_website: string;
  referral_sources: string[];
  referral_reference: string;
  additional_notes: string;
};

export type PresentationEditPayload = Pick<
  Presentation,
  | "event_date"
  | "start_time"
  | "end_time"
  | "event_timezone"
  | "event_access"
  | "event_setting"
  | "event_types"
  | "event_purpose"
  | "venue_address"
  | "estimated_guests"
  | "audience_distance_12ft"
  | "unavailable_logistics"
  | "organization_name"
  | "contact_first_name"
  | "contact_last_name"
  | "contact_email"
  | "contact_phone"
  | "organization_website"
  | "referral_sources"
  | "referral_reference"
  | "additional_notes"
>;

function initialValues(item: Presentation): EditForm {
  return {
    event_date: item.event_date ?? "",
    start_time: item.start_time?.slice(0, 5) ?? "",
    end_time: item.end_time?.slice(0, 5) ?? "",
    event_timezone: item.event_timezone ?? "America/Los_Angeles",
    event_access: item.event_access ?? "",
    event_setting: item.event_setting ?? "",
    event_types: item.event_types,
    event_purpose: item.event_purpose ?? "",
    venue_address: item.venue_address ?? "",
    estimated_guests:
      item.estimated_guests === null ? "" : String(item.estimated_guests),
    audience_distance_12ft: item.audience_distance_12ft ?? "",
    unavailable_logistics: item.unavailable_logistics ?? "",
    organization_name: item.organization_name ?? "",
    contact_first_name: item.contact_first_name ?? "",
    contact_last_name: item.contact_last_name ?? "",
    contact_email: item.contact_email ?? "",
    contact_phone: item.contact_phone ?? "",
    organization_website: item.organization_website ?? "",
    referral_sources: item.referral_sources,
    referral_reference: item.referral_reference ?? "",
    additional_notes: item.additional_notes ?? "",
  };
}

function optional(value: string) {
  return value.trim() || null;
}

export function PresentationEditModal({
  item,
  saving,
  error,
  close,
  save,
}: {
  item: Presentation;
  saving: boolean;
  error: string;
  close: () => void;
  save: (values: PresentationEditPayload) => void;
}) {
  const [form, setForm] = useState(() => initialValues(item));
  function change<K extends keyof EditForm>(key: K, value: EditForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save({
      event_date: optional(form.event_date),
      start_time: optional(form.start_time),
      end_time: optional(form.end_time),
      event_timezone: optional(form.event_timezone),
      event_access: optional(form.event_access),
      event_setting: optional(form.event_setting),
      event_types: form.event_types,
      event_purpose: optional(form.event_purpose),
      venue_address: optional(form.venue_address),
      estimated_guests: form.estimated_guests
        ? Number(form.estimated_guests)
        : null,
      audience_distance_12ft: optional(form.audience_distance_12ft),
      unavailable_logistics: optional(form.unavailable_logistics),
      organization_name: optional(form.organization_name),
      contact_first_name: optional(form.contact_first_name),
      contact_last_name: optional(form.contact_last_name),
      contact_email: optional(form.contact_email),
      contact_phone: optional(form.contact_phone),
      organization_website: optional(form.organization_website),
      referral_sources: form.referral_sources,
      referral_reference: optional(form.referral_reference),
      additional_notes: optional(form.additional_notes),
    });
  }
  return (
    <Modal title="Edit presentation details" close={close} wide>
      <form onSubmit={submit}>
        <div className="composer-body presentation-edit-form">
          <section>
            <h3>Contact</h3>
            <label>
              First name
              <input
                required
                maxLength={500}
                value={form.contact_first_name}
                onChange={(event) =>
                  change("contact_first_name", event.target.value)
                }
              />
            </label>
            <label>
              Last name
              <input
                required
                maxLength={500}
                value={form.contact_last_name}
                onChange={(event) =>
                  change("contact_last_name", event.target.value)
                }
              />
            </label>
            <label>
              Email
              <input
                type="email"
                maxLength={320}
                value={form.contact_email}
                onChange={(event) =>
                  change("contact_email", event.target.value)
                }
              />
            </label>
            <label>
              Phone
              <input
                maxLength={100}
                value={form.contact_phone}
                onChange={(event) =>
                  change("contact_phone", event.target.value)
                }
              />
            </label>
            <label>
              Organization
              <input
                maxLength={500}
                value={form.organization_name}
                onChange={(event) =>
                  change("organization_name", event.target.value)
                }
              />
            </label>
            <label>
              Website
              <input
                maxLength={500}
                value={form.organization_website}
                onChange={(event) =>
                  change("organization_website", event.target.value)
                }
              />
            </label>
          </section>
          <section>
            <h3>Event</h3>
            <DatePicker
              label="Event date"
              value={form.event_date}
              onChange={(value) => change("event_date", value)}
              disabled={saving}
            />
            <label>
              Start time
              <input
                type="time"
                value={form.start_time}
                onChange={(event) => change("start_time", event.target.value)}
              />
            </label>
            <label>
              End time
              <input
                type="time"
                value={form.end_time}
                onChange={(event) => change("end_time", event.target.value)}
              />
            </label>
            <label>
              Time zone
              <input
                maxLength={100}
                value={form.event_timezone}
                onChange={(event) =>
                  change("event_timezone", event.target.value)
                }
              />
            </label>
            <label>
              Location
              <input
                maxLength={500}
                value={form.venue_address}
                onChange={(event) =>
                  change("venue_address", event.target.value)
                }
              />
            </label>
            <label>
              Expected guests
              <input
                type="number"
                min={1}
                max={10000000}
                value={form.estimated_guests}
                onChange={(event) =>
                  change("estimated_guests", event.target.value)
                }
              />
            </label>
            <label>
              Access
              <select
                value={form.event_access}
                onChange={(event) => change("event_access", event.target.value)}
              >
                <option value="">Not provided</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </label>
            <label>
              Setting
              <select
                value={form.event_setting}
                onChange={(event) =>
                  change("event_setting", event.target.value)
                }
              >
                <option value="">Not provided</option>
                <option value="indoor">Indoor</option>
                <option value="outdoor">Outdoor</option>
                <option value="unsure">Unsure</option>
              </select>
            </label>
            <label>
              Audience distance
              <select
                value={form.audience_distance_12ft}
                onChange={(event) =>
                  change("audience_distance_12ft", event.target.value)
                }
              >
                <option value="">Not provided</option>
                <option value="yes">At least 12 feet</option>
                <option value="no">Less than 12 feet</option>
                <option value="unsure">Unsure</option>
              </select>
            </label>
          </section>
          <section className="edit-wide">
            <h3>Request details</h3>
            <fieldset>
              <legend>Event types</legend>
              {eventTypeOptions.map((value) => (
                <button
                  type="button"
                  className="event-type-chip"
                  key={value}
                  aria-pressed={form.event_types.includes(value)}
                  onClick={() =>
                    change(
                      "event_types",
                      form.event_types.includes(value)
                        ? form.event_types.filter((entry) => entry !== value)
                        : [...form.event_types, value],
                    )
                  }
                >
                  {value.replaceAll("_", " ")}
                </button>
              ))}
            </fieldset>
            <label>
              Purpose
              <textarea
                rows={3}
                maxLength={10000}
                value={form.event_purpose}
                onChange={(event) =>
                  change("event_purpose", event.target.value)
                }
              />
            </label>
            <label>
              Unavailable logistics
              <textarea
                rows={3}
                maxLength={10000}
                value={form.unavailable_logistics}
                onChange={(event) =>
                  change("unavailable_logistics", event.target.value)
                }
              />
            </label>
            <label>
              Additional notes
              <textarea
                rows={3}
                maxLength={10000}
                value={form.additional_notes}
                onChange={(event) =>
                  change("additional_notes", event.target.value)
                }
              />
            </label>
            <fieldset>
              <legend>Referral sources</legend>
              {referralOptions.map((value) => (
                <label className="edit-choice" key={value}>
                  <input
                    type="checkbox"
                    checked={form.referral_sources.includes(value)}
                    onChange={(event) =>
                      change(
                        "referral_sources",
                        event.target.checked
                          ? [...form.referral_sources, value]
                          : form.referral_sources.filter(
                              (entry) => entry !== value,
                            ),
                      )
                    }
                  />
                  {value.replaceAll("_", " ")}
                </label>
              ))}
            </fieldset>
            <label>
              Referral details
              <input
                maxLength={500}
                value={form.referral_reference}
                onChange={(event) =>
                  change("referral_reference", event.target.value)
                }
              />
            </label>
          </section>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </div>
        <div className="modal-footer">
          <button className="button" type="button" onClick={close}>
            Cancel
          </button>
          <button className="button primary" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
