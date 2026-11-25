from enum import StrEnum

from sqlalchemy import case, func, or_

from app.modules.mny.models import VendorApplication


class VendorStage(StrEnum):
    APPLIED = "applied"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    UNKNOWN = "unknown"


def vendor_stage():
    application = VendorApplication
    legacy = application.responses["legacy_vendor"]
    return case(
        (
            application.responses["decision"]["status"].astext == "applied",
            VendorStage.APPLIED.value,
        ),
        (
            application.responses["decision"]["status"].astext == "declined",
            VendorStage.DECLINED.value,
        ),
        (
            or_(
                application.responses["decision"]["status"].astext == "accepted",
                legacy["acceptance_email_sent"].astext == "true",
                func.nullif(func.btrim(legacy["acceptance_email_sent_at"].astext), "").is_not(None),
            ),
            VendorStage.ACCEPTED.value,
        ),
        (application.source == "form_csv", VendorStage.APPLIED.value),
        else_=VendorStage.UNKNOWN.value,
    )
