from typing import Annotated

from fastapi import APIRouter, Depends, Response

from app.core.security import require_staff_access
from app.integrations.supabase_auth import AuthenticatedUser

router = APIRouter(prefix="/auth", tags=["auth"])


@router.get("/me", response_model=AuthenticatedUser)
def current_user(
    user: Annotated[AuthenticatedUser, Depends(require_staff_access)], response: Response
) -> AuthenticatedUser:
    response.headers["Cache-Control"] = "no-store"
    return user
