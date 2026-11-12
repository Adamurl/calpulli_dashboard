from typing import Annotated

from fastapi import Depends, HTTPException, Request, Response
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.integrations.supabase_auth import (
    AuthenticatedUser,
    AuthenticationUnavailable,
    InvalidAccessToken,
    verify_user,
)

bearer = HTTPBearer(auto_error=False)


def require_staff_access(
    request: Request,
    response: Response,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> AuthenticatedUser:
    config = request.app.state.settings
    response.headers["Cache-Control"] = "private, no-store"
    if config.supabase_url is None or config.supabase_publishable_key is None:
        raise HTTPException(status_code=503, detail="Authentication is not configured")
    if credentials is None or (
        not credentials.credentials.isascii() or len(credentials.credentials) > 8192
    ):
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
    try:
        user = verify_user(
            request.app.state.auth_client,
            url=str(config.supabase_url),
            publishable_key=config.supabase_publishable_key.get_secret_value(),
            access_token=credentials.credentials,
        )
    except InvalidAccessToken:
        raise HTTPException(
            401, "Authentication required", headers={"WWW-Authenticate": "Bearer"}
        ) from None
    except AuthenticationUnavailable:
        raise HTTPException(503, "Authentication unavailable") from None
    if user.id not in config.staff_user_ids:
        raise HTTPException(403, "Staff access required")
    request.state.user_id = user.id
    return user
