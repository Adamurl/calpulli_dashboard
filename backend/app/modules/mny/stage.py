from enum import StrEnum

from sqlalchemy import case, cast, func, or_
from sqlalchemy.dialects.postgresql import JSONPATH

from app.modules.mny.models import VendorApplication


class VendorStage(StrEnum):
    APPLIED = "applied"
    ACCEPTED = "accepted"
    PAID = "paid"
    SPOT_ASSIGNED = "spot_assigned"
    UNKNOWN = "unknown"


def vendor_stage():
    application = VendorApplication
    legacy = application.responses["legacy_vendor"]
    labeled_spot = (
        r'? (@.type() == "number" || (@.type() == "string" && @ like_regex "[^[:space:]]"))'
    )
    assigned = or_(
        func.jsonb_path_exists(
            application.responses, cast(f"$.legacy_vendor.spot_numbers[*] {labeled_spot}", JSONPATH)
        ),
        func.jsonb_path_exists(
            application.responses, cast(f"$.linked_spots[*].spot.label {labeled_spot}", JSONPATH)
        ),
    )
    return case(
        (assigned, VendorStage.SPOT_ASSIGNED.value),
        (func.lower(func.btrim(legacy["payment_status"].astext)) == "paid", VendorStage.PAID.value),
        (
            or_(
                legacy["acceptance_email_sent"].astext == "true",
                func.nullif(func.btrim(legacy["acceptance_email_sent_at"].astext), "").is_not(None),
            ),
            VendorStage.ACCEPTED.value,
        ),
        (application.source == "form_csv", VendorStage.APPLIED.value),
        else_=VendorStage.UNKNOWN.value,
    )
