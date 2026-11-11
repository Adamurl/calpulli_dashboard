"""Presentation email policy, independent of HTTP and mail providers."""

import re
from dataclasses import dataclass
from enum import StrEnum
from html import escape
from types import MappingProxyType


class SendingRule(StrEnum):
    AUTOMATIC = "automatic"
    APPROVAL = "approval_required"
    MANUAL = "manual_only"


class EmailEvent(StrEnum):
    INQUIRY_CREATED = "inquiry_created"
    MISSING_INFORMATION = "missing_information"
    APPROVED_FOR_CALL = "approved_for_call"
    CALL_BOOKED = "call_booked"
    CALL_REMINDER_DUE = "call_reminder_due"
    CALL_COMPLETED = "call_completed"
    CONTRACT_READY = "contract_ready"
    SIGNED_AND_PAID = "signed_and_paid"
    FINAL_LOGISTICS_NEEDED = "final_logistics_needed"
    EVENT_DETAILS_COMPLETE = "event_details_complete"
    PRESENTATION_COMPLETED = "presentation_completed"
    BALANCE_OVERDUE = "balance_overdue"
    INQUIRY_DECLINED = "inquiry_declined"
    SPECIAL_SITUATION = "special_situation"


@dataclass(frozen=True)
class WorkflowRule:
    template_key: str
    sending_rule: SendingRule
    reason: str
    required_variables: tuple[str, ...]


WORKFLOWS = MappingProxyType(
    {
        EmailEvent.INQUIRY_CREATED: WorkflowRule(
            "inquiry_received", SendingRule.AUTOMATIC, "A new inquiry was received.", ("Name",)
        ),
        EmailEvent.MISSING_INFORMATION: WorkflowRule(
            "more_information_needed",
            SendingRule.APPROVAL,
            "Staff identified missing information.",
            ("Name", "Presentation Details", "Details Form Link"),
        ),
        EmailEvent.APPROVED_FOR_CALL: WorkflowRule(
            "schedule_call",
            SendingRule.APPROVAL,
            "Staff approved an introductory call.",
            ("Name", "Booking Link"),
        ),
        EmailEvent.CALL_BOOKED: WorkflowRule(
            "meeting_confirmation",
            SendingRule.AUTOMATIC,
            "The introductory call was booked.",
            ("Name", "Requested Date", "Time", "Time Zone", "Google Meet Link", "Reschedule Link"),
        ),
        EmailEvent.CALL_REMINDER_DUE: WorkflowRule(
            "meeting_reminder",
            SendingRule.AUTOMATIC,
            "The call is within the next 24 hours.",
            ("Name", "Requested Date", "Time", "Time Zone", "Google Meet Link"),
        ),
        EmailEvent.CALL_COMPLETED: WorkflowRule(
            "conversation_follow_up",
            SendingRule.APPROVAL,
            "The introductory call was completed.",
            ("Name", "Presentation Details"),
        ),
        EmailEvent.CONTRACT_READY: WorkflowRule(
            "contract_and_payment",
            SendingRule.APPROVAL,
            "Staff prepared the contract for review.",
            ("Name", "Contract Link", "Deposit Amount", "Payment Instructions", "Due Date"),
        ),
        EmailEvent.SIGNED_AND_PAID: WorkflowRule(
            "booking_confirmed",
            SendingRule.AUTOMATIC,
            "Staff verified signature and payment.",
            ("Name", "Requested Date", "Location"),
        ),
        EmailEvent.FINAL_LOGISTICS_NEEDED: WorkflowRule(
            "final_logistics_request",
            SendingRule.AUTOMATIC,
            "Final event logistics are needed.",
            ("Name", "Logistics Form Link", "Due Date"),
        ),
        EmailEvent.EVENT_DETAILS_COMPLETE: WorkflowRule(
            "final_confirmation",
            SendingRule.APPROVAL,
            "Staff marked event details complete.",
            (
                "Name",
                "Requested Date",
                "Time",
                "Time Zone",
                "Location",
                "Arrival Time",
                "Parking Instructions",
                "Changing Room Information",
                "Day-of Contact",
                "Calpulli Contact",
                "Calpulli Phone",
            ),
        ),
        EmailEvent.PRESENTATION_COMPLETED: WorkflowRule(
            "thank_you_feedback",
            SendingRule.AUTOMATIC,
            "The presentation was completed.",
            ("Name", "Feedback Form Link"),
        ),
        EmailEvent.BALANCE_OVERDUE: WorkflowRule(
            "payment_reminder",
            SendingRule.APPROVAL,
            "Staff identified an overdue balance.",
            ("Name", "Balance Amount", "Due Date", "Payment Instructions"),
        ),
        EmailEvent.INQUIRY_DECLINED: WorkflowRule(
            "decline_or_referral",
            SendingRule.APPROVAL,
            "A decline always requires staff approval.",
            ("Name",),
        ),
        EmailEvent.SPECIAL_SITUATION: WorkflowRule(
            "custom_follow_up",
            SendingRule.MANUAL,
            "Special communications require a manual send.",
            ("Name", "Presentation Details"),
        ),
    }
)

STATE_EVENTS = MappingProxyType(
    {
        "new": EmailEvent.INQUIRY_CREATED,
        "declined": EmailEvent.INQUIRY_DECLINED,
        "completed": EmailEvent.PRESENTATION_COMPLETED,
    }
)
VARIABLES = frozenset(
    {
        "Name",
        "Organization",
        "Event Name",
        "Event Description",
        "Requested Date",
        "Alternate Date",
        "Location",
        "Presentation Details",
        "Time",
        "Time Zone",
        "Booking Link",
        "Google Meet Link",
        "Phone Details",
        "Reschedule Link",
        "Contract Link",
        "Deposit Amount",
        "Payment Instructions",
        "Due Date",
        "Arrival Time",
        "Parking Instructions",
        "Changing Room Information",
        "Day-of Contact",
        "Calpulli Contact",
        "Calpulli Phone",
        "Details Form Link",
        "Logistics Form Link",
        "Feedback Form Link",
        "Balance Amount",
    }
)
TOKEN = re.compile(r"\[([^\[\]]+)\]")


def template_variables(subject: str, body: str) -> set[str]:
    found = set(TOKEN.findall(subject + "\n" + body))
    if found - VARIABLES:
        raise ValueError("Unknown template variables: " + ", ".join(sorted(found - VARIABLES)))
    return found


def render_template(subject: str, body: str, variables: dict[str, str]) -> tuple[str, str, str]:
    required = template_variables(subject, body)
    missing = sorted(key for key in required if not variables.get(key, "").strip())
    if missing:
        raise ValueError("Missing template variables: " + ", ".join(missing))
    rendered_subject = TOKEN.sub(lambda match: variables[match[1]], subject)
    if len(rendered_subject) > 998 or any(c in rendered_subject for c in "\n\r\x00"):
        raise ValueError("Subject must be a single line of at most 998 characters")
    rendered_body = TOKEN.sub(lambda match: variables[match[1]], body)
    html = "<p>" + escape(rendered_body).replace("\n", "<br>\n") + "</p>"
    return rendered_subject, rendered_body, html
