from fastapi import APIRouter

from app.api.auth import router as auth_router
from app.integrations.wix import router as wix_router
from app.modules.health.router import router as health_router
from app.modules.presentations.router import router as presentations_router

router = APIRouter(prefix="/api/v1")
router.include_router(auth_router)
router.include_router(health_router)
router.include_router(presentations_router)
router.include_router(wix_router)
