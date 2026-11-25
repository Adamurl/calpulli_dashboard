import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation


def _labels(values: object) -> list[str] | None:
    if not isinstance(values, list):
        return None
    return list(
        dict.fromkeys(
            str(value).strip()
            for value in values
            if type(value) in (str, int) and str(value).strip()
        )
    )


def _linked_labels(links: object) -> list[str] | None:
    if not isinstance(links, list):
        return None
    return _labels(
        [
            link["spot"].get("label")
            for link in links
            if isinstance(link, dict) and isinstance(link.get("spot"), dict)
        ]
    )


def _amount(value: object) -> Decimal | None:
    if type(value) not in (int, float, str):
        return None
    try:
        amount = Decimal(str(value))
    except InvalidOperation:
        return None
    return amount if amount.is_finite() else None


@dataclass(frozen=True)
class LegacyVendorFacts:
    requested_spot_count: int | None = None
    assigned_spot_labels: list[str] | None = None
    paid_before_deadline: bool | None = None
    amount_paid: Decimal | None = None

    @classmethod
    def from_snapshot(cls, vendor: object, links: object) -> "LegacyVendorFacts":
        if not isinstance(vendor, dict):
            return cls()
        recorded = _labels(vendor.get("spot_numbers"))
        linked = _linked_labels(links)
        requested = vendor.get("requested_spot_count")
        deadline = vendor.get("paid_before_deadline")
        return cls(
            requested_spot_count=requested if type(requested) is int and requested >= 0 else None,
            assigned_spot_labels=recorded or (linked if linked is not None else recorded),
            paid_before_deadline=deadline if isinstance(deadline, bool) else None,
            amount_paid=_amount(vendor.get("amount_paid")),
        )

    @property
    def assigned_count(self) -> int | None:
        return None if self.assigned_spot_labels is None else len(self.assigned_spot_labels)

    @property
    def requested_count(self) -> int | None:
        if self.requested_spot_count is not None:
            return self.requested_spot_count
        return self.assigned_count


def requested_spot_count(responses: dict, recorded: int | None) -> int | None:
    staff = responses.get("staff_details")
    legacy = responses.get("legacy_vendor")
    staff = staff if isinstance(staff, dict) else {}
    legacy = legacy if isinstance(legacy, dict) else {}
    space = (
        staff.get("requested_space")
        if "requested_space" in staff
        else (responses.get("booth_size_requested") or legacy.get("requested_space"))
    )
    if isinstance(space, str):
        match = re.fullmatch(
            r"\s*(\d+)\s*(?:ft|['′])?\s*[x×]\s*(\d+)\s*(?:ft|['′])?\s*", space, re.I
        )
        if match:
            width, depth = map(int, match.groups())
            if 0 < width <= 10000 and 0 < depth <= 10000 and width % 10 == depth % 10 == 0:
                return (width // 10) * (depth // 10)
    return recorded
