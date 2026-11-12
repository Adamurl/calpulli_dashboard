from typing import Literal
from uuid import UUID

import httpx
from pydantic import BaseModel, Field


class AuthenticatedUser(BaseModel):
    id: UUID


class _SupabaseUser(AuthenticatedUser):
    aud: Literal["authenticated"]
    role: Literal["authenticated"]
    is_anonymous: bool = Field(default=False, strict=True)


class InvalidAccessToken(Exception):
    pass


class AuthenticationUnavailable(Exception):
    pass


def verify_user(
    client: httpx.Client, *, url: str, publishable_key: str, access_token: str
) -> AuthenticatedUser:
    try:
        response = client.get(
            f"{url.rstrip('/')}/auth/v1/user",
            headers={"apikey": publishable_key, "Authorization": f"Bearer {access_token}"},
        )
    except httpx.RequestError:
        raise AuthenticationUnavailable from None
    if response.status_code in {400, 401, 403, 422}:
        raise InvalidAccessToken
    if response.status_code != 200:
        raise AuthenticationUnavailable
    try:
        user = _SupabaseUser.model_validate(response.json())
    except ValueError:
        raise InvalidAccessToken from None
    if user.is_anonymous:
        raise InvalidAccessToken
    return AuthenticatedUser(id=user.id)
