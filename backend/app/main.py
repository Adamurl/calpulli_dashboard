from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from http import HTTPStatus

import httpx
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from sqlalchemy.orm import sessionmaker
from starlette.exceptions import HTTPException
from starlette.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse

from app.api.router import router
from app.core.config import Settings
from app.core.errors import ErrorResponse, error_response
from app.core.logging import configure_logging
from app.core.middleware import RequestContextMiddleware
from app.db.session import build_engine
from app.integrations.gmail import make_provider
from app.integrations.microsoft_graph import MicrosoftGraph
from app.integrations.outlook_delivery import OutlookDelivery
from app.modules.presentations.email_ui import router as email_ui_router


def create_app(settings: Settings | None = None) -> FastAPI:
    config = settings if settings is not None else Settings()
    configure_logging(config.log_level)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        engine = build_engine(config)
        app.state.engine = engine
        app.state.session_factory = sessionmaker(bind=engine, expire_on_commit=False)
        try:
            with (
                httpx.Client(timeout=5, follow_redirects=False, trust_env=False) as auth_client,
                httpx.Client(timeout=12, follow_redirects=False, trust_env=False) as graph_client,
            ):
                app.state.auth_client = auth_client
                graph = None
                if (
                    config.app_env != "test"
                    and config.email_provider == "microsoft"
                    and config.microsoft_tenant_id
                    and config.microsoft_client_id
                    and config.microsoft_client_secret
                    and config.microsoft_mailbox
                ):
                    graph = MicrosoftGraph(
                        graph_client,
                        tenant_id=str(config.microsoft_tenant_id),
                        client_id=str(config.microsoft_client_id),
                        client_secret=config.microsoft_client_secret.get_secret_value(),
                        mailbox=config.microsoft_mailbox,
                    )
                app.state.outlook_delivery = OutlookDelivery(config, graph)
                if config.app_env != "test" and config.email_provider == "microsoft":
                    app.state.email_provider = app.state.outlook_delivery
                else:
                    app.state.email_provider = make_provider(config)
                yield
        finally:
            engine.dispose()

    app = FastAPI(
        title="Calpulli Platform",
        version="0.1.0",
        debug=False,
        lifespan=lifespan,
        docs_url="/docs" if config.expose_docs else None,
        redoc_url=None,
        openapi_url="/openapi.json" if config.expose_docs else None,
        responses={422: {"model": ErrorResponse}},
    )
    app.state.settings = config

    @app.exception_handler(HTTPException)
    async def http_error(request: Request, exc: HTTPException) -> JSONResponse:
        code = (
            "database_unavailable"
            if exc.status_code == 503 and exc.detail == "Database unavailable"
            else f"http_{exc.status_code}"
        )
        message = (
            "Database unavailable"
            if code == "database_unavailable"
            else HTTPStatus(exc.status_code).phrase
        )
        response = error_response(exc.status_code, code, message, request.state.request_id)
        if exc.headers:
            response.headers.update(exc.headers)
        return response

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return error_response(422, "validation_error", "Invalid request", request.state.request_id)

    app.include_router(router)
    app.include_router(email_ui_router)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=config.cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PATCH", "PUT"],
        allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Email-Resend-Token"],
        expose_headers=["X-Request-ID"],
    )
    app.add_middleware(RequestContextMiddleware)
    return app
