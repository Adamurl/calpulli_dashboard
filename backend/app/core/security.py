from secrets import compare_digest
from typing import Annotated

from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

bearer = HTTPBearer(auto_error=False)


def require_internal_access(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> None:
    configured = request.app.state.settings.internal_api_token
    if configured is None:
        raise HTTPException(status_code=503, detail="Internal access is not configured")
    if credentials is None or not compare_digest(
        credentials.credentials.encode(), configured.get_secret_value().encode()
    ):
        raise HTTPException(
            status_code=401,
            detail="Authentication required",
            headers={"WWW-Authenticate": "Bearer"},
        )
