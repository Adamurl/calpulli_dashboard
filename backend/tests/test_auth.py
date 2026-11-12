from collections.abc import Iterator
from contextlib import contextmanager
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.main import create_app
from app.modules.presentations import services
from tests.conftest import STAFF_ID, UNAVAILABLE_URL

TOKEN = "fictional.user.jwt"
KEY = "fictional-publishable-key"


def user_data(**overrides) -> dict[str, object]:
    return {
        "id": str(STAFF_ID),
        "aud": "authenticated",
        "role": "authenticated",
        "is_anonymous": False,
        **overrides,
    }


@contextmanager
def authenticated_client(handler, **settings) -> Iterator[TestClient]:
    app = create_app(
        Settings(
            _env_file=None,
            database_url=UNAVAILABLE_URL,
            app_env="test",
            supabase_url="https://auth.example.org",
            supabase_publishable_key=KEY,
            staff_user_ids=settings.pop("staff_user_ids", [STAFF_ID]),
            **settings,
        )
    )
    with (
        TestClient(app) as client,
        httpx.Client(transport=httpx.MockTransport(handler), follow_redirects=False) as auth_client,
    ):
        app.state.auth_client = auth_client
        yield client


def bearer(token: str = TOKEN) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_staff_jwt_reaches_business_routes_and_identity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = []

    def auth(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://auth.example.org/auth/v1/user"
        assert request.headers["authorization"] == f"Bearer {TOKEN}"
        assert request.headers["apikey"] == KEY
        calls.append(request)
        return httpx.Response(200, json=user_data())

    monkeypatch.setattr(services, "list_presentations", lambda *args, **kwargs: [])
    with authenticated_client(auth) as client:
        response = client.get("/api/v1/presentations", headers=bearer())
        assert response.status_code == 200
        assert response.json()["items"] == []
        assert response.headers["cache-control"] == "private, no-store"
        me = client.get("/api/v1/auth/me", headers=bearer())
        assert me.status_code == 200
        assert me.json()["id"] == str(STAFF_ID)
        assert "no-store" in me.headers["cache-control"]
    assert len(calls) == 2


@pytest.mark.parametrize(
    "authorization", [None, "Basic credentials", "Bearer", "Bearer " + "a" * 8193]
)
def test_missing_or_malformed_credentials_never_call_supabase(authorization) -> None:
    def unexpected(request):
        pytest.fail("No token should be sent to Supabase")

    with authenticated_client(unexpected) as client:
        response = client.get(
            "/api/v1/auth/me", headers={"Authorization": authorization} if authorization else {}
        )
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"


@pytest.mark.parametrize(
    "token",
    ["expired.jwt.token", "tampered.jwt.token", "other.project.token", "old-internal-token"],
)
@pytest.mark.parametrize("status", [400, 401, 403, 422])
def test_auth_server_rejections_fail_closed_without_leaking_details(token, status) -> None:
    def rejected(request):
        assert request.headers["authorization"] == f"Bearer {token}"
        return httpx.Response(status, json={"error": "sensitive-provider-error"})

    with authenticated_client(rejected) as client:
        response = client.get("/api/v1/auth/me", headers=bearer(token))
        assert response.status_code == 401
        assert response.headers["www-authenticate"] == "Bearer"
        assert token not in response.text
        assert "sensitive-provider-error" not in response.text


@pytest.mark.parametrize(
    "overrides",
    [
        {"is_anonymous": True},
        {"aud": "anon"},
        {"role": "service_role"},
        {"id": "not-a-user-id"},
        {"is_anonymous": "false"},
        {"is_anonymous": 0},
    ],
)
def test_anonymous_or_invalid_identities_are_rejected(overrides) -> None:
    with authenticated_client(
        lambda request: httpx.Response(200, json=user_data(**overrides))
    ) as c:
        assert c.get("/api/v1/auth/me", headers=bearer()).status_code == 401


@pytest.mark.parametrize("approved_ids", [[], [uuid4()]])
def test_valid_login_without_staff_approval_is_forbidden(approved_ids) -> None:
    with authenticated_client(
        lambda request: httpx.Response(200, json=user_data()), staff_user_ids=approved_ids
    ) as client:
        assert client.get("/api/v1/auth/me", headers=bearer()).status_code == 403
        assert client.get("/api/v1/presentations", headers=bearer()).status_code == 403


@pytest.mark.parametrize("status", [301, 302, 429, 500, 503])
def test_auth_service_failure_never_grants_access(status) -> None:
    with authenticated_client(
        lambda request: httpx.Response(status, headers={"Location": "https://other.example.org"})
    ) as client:
        assert client.get("/api/v1/auth/me", headers=bearer()).status_code == 503


def test_auth_timeout_returns_safe_unavailable_response() -> None:
    def timeout(request):
        raise httpx.ReadTimeout("private connection details", request=request)

    with authenticated_client(timeout) as client:
        response = client.get("/api/v1/auth/me", headers=bearer())
        assert response.status_code == 503
        assert "private connection details" not in response.text


@pytest.mark.parametrize("content", [b"invalid-json", b"{}", b"null"])
def test_malformed_auth_response_denies_access(content) -> None:
    with authenticated_client(lambda request: httpx.Response(200, content=content)) as client:
        assert client.get("/api/v1/auth/me", headers=bearer()).status_code == 401


def test_all_business_and_email_routes_reject_unauthenticated_calls() -> None:
    def unexpected(request):
        pytest.fail("No unauthenticated request should reach Supabase")

    with authenticated_client(unexpected) as client:
        checked = 0
        for template, operations in client.app.openapi()["paths"].items():
            if not template.startswith("/api/v1/presentations"):
                continue
            path = template.replace("{request_id}", str(UUID(int=1)))
            path = path.replace("{inquiry_id}", str(UUID(int=1)))
            path = path.replace("{message_id}", str(UUID(int=2))).replace("{key}", "example")
            for method in operations:
                response = client.request(method, path, json={})
                assert response.status_code == 401, (method, path, response.status_code)
                checked += 1
        assert checked > 0


def test_health_is_public_and_wix_keeps_its_independent_secret() -> None:
    def unexpected(request):
        pytest.fail("Health and Wix must not call Supabase Auth")

    with authenticated_client(
        unexpected, wix_webhook_token="fictional-wix-webhook-secret-32-chars", wix_form_id="example"
    ) as client:
        assert client.get("/api/v1/health").status_code == 200
        assert (
            client.post("/api/v1/integrations/wix/presentations", json={"data": {}}).status_code
            == 401
        )


def test_cors_allows_authorization_only_for_explicit_origins() -> None:
    with authenticated_client(
        lambda request: httpx.Response(200, json=user_data()),
        cors_origins=["https://workspace.example.org"],
    ) as client:
        headers = {
            "Origin": "https://workspace.example.org",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "authorization,content-type",
        }
        response = client.options("/api/v1/presentations/example", headers=headers)
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == "https://workspace.example.org"
        headers["Origin"] = "https://untrusted.example.org"
        assert client.options("/api/v1/presentations/example", headers=headers).status_code == 400


def test_legacy_shared_token_alone_does_not_enable_api_access(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("INTERNAL_API_TOKEN", "old-shared-token-32-characters-long")
    app = create_app(Settings(_env_file=None, app_env="test", database_url=UNAVAILABLE_URL))
    with TestClient(app) as client:
        response = client.get(
            "/api/v1/presentations", headers=bearer("old-shared-token-32-characters-long")
        )
        assert response.status_code == 503
