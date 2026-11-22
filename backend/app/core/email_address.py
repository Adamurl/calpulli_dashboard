from email.errors import HeaderParseError
from email.headerregistry import Address
from typing import TypeGuard


def valid_recipient(value: str | None) -> TypeGuard[str]:
    if not value or any(c in value for c in "\r\n\x00"):
        return False
    try:
        address = Address(addr_spec=value)
        return bool(address.username and "." in address.domain and address.addr_spec == value)
    except (ValueError, IndexError, HeaderParseError):
        return False
