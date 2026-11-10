import logging
from uuid import UUID, uuid4

from starlette.datastructures import Headers, MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.core.errors import error_response

logger = logging.getLogger("calpulli.requests")


class RequestContextMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        raw_id = Headers(scope=scope).get("x-request-id", "")
        try:
            request_id = str(UUID(raw_id))
        except ValueError:
            request_id = str(uuid4())
        scope.setdefault("state", {})["request_id"] = request_id
        started = False

        async def send_with_id(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
                logger.info(
                    "request_completed",
                    extra={"request_id": request_id, "status_code": message["status"]},
                )
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception:
            logger.error("request_failed", extra={"request_id": request_id})
            if started:
                raise
            response = error_response(500, "internal_error", "Internal server error", request_id)
            await response(scope, receive, send_with_id)
