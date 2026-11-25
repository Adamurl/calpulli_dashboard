import json
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.config import Settings
from app.main import create_app
from tests.conftest import UNAVAILABLE_URL

WEBHOOK = "/api/v1/integrations/wix/contact"
MESSAGES = "/api/v1/contact-messages"
CONTACT_TOKEN = "fictional-contact-token-for-tests"
PRESENTATION_TOKEN = "fictional-presentation-token-for-tests"
STAFF_TOKEN = "fictional-staff-token"
AUTH = {"Authorization": f"Bearer {STAFF_TOKEN}"}
ANSWERS = {
    "first_name": "Avery",
    "last_name": "Example",
    "email": "avery@example.com",
    "phone": "+1 408 555 0100",
    "message": "Hello,\nI have a question about your organization.",
}


@pytest.fixture
def contact_setup(staff_auth):
    form_id = str(uuid4())
    settings = {
        **staff_auth(STAFF_TOKEN),
        "wix_contact_webhook_token": CONTACT_TOKEN,
        "wix_contact_form_id": form_id,
        "wix_webhook_token": PRESENTATION_TOKEN,
        "wix_form_id": "other-form",
    }
    data = {
        "webhook_token": CONTACT_TOKEN,
        "form_id": form_id,
        "submission_id": str(uuid4()),
        **ANSWERS,
    }
    return settings, data


def test_contact_webhook_is_disabled_without_configuration(client):
    assert client.post(WEBHOOK, json={"data": {}}).status_code == 503


def test_contact_ingress_and_read_route_reject_invalid_requests(contact_setup):
    settings, data = contact_setup
    app = create_app(
        Settings(_env_file=None, app_env="test", database_url=UNAVAILABLE_URL, **settings)
    )
    with TestClient(app) as client:
        for changes, expected in [
            ({"webhook_token": PRESENTATION_TOKEN}, 401),
            ({"form_id": "other-form"}, 403),
            ({"submission_id": ""}, 422),
            ({"email": "invalid"}, 422),
            ({"message": "  "}, 422),
            ({"message": "invalid\x00text"}, 422),
            ({"message": "\ud800"}, 422),
            ({"event_date": "2026-11-23"}, 422),
        ]:
            response = client.post(WEBHOOK, content=json.dumps({"data": {**data, **changes}}))
            assert response.status_code == expected
            assert ANSWERS["email"] not in response.text
            assert CONTACT_TOKEN not in response.text
        assert client.post(WEBHOOK, content=b" " * 65537).status_code == 413
        assert client.get(MESSAGES).status_code == 401
        bad_token = {"Authorization": "Bearer bad-token"}
        assert client.get(MESSAGES, headers=bad_token).status_code == 401
        assert client.get(f"{MESSAGES}?offset=-1", headers=AUTH).status_code == 422


@pytest.mark.integration
def test_wix_contact_retries_are_idempotent_and_staff_can_read(contact_setup, database_url):
    settings, data = contact_setup
    app = create_app(
        Settings(_env_file=None, app_env="test", database_url=database_url, **settings)
    )
    with TestClient(app) as client:
        with ThreadPoolExecutor(max_workers=2) as executor:
            responses = list(
                executor.map(lambda _: client.post(WEBHOOK, json={"data": data}), range(2))
            )
        assert sorted(response.status_code for response in responses) == [200, 201]
        message_id = responses[0].json()["id"]
        assert {response.json()["id"] for response in responses} == {message_id}
        assert {response.json()["status"] for response in responses} == {"created", "duplicate"}

        changed = client.post(WEBHOOK, json={"data": {**data, "message": "Different message"}})
        assert changed.status_code == 409
        first_page = client.get(MESSAGES, headers=AUTH)
        assert first_page.status_code == 200
        assert first_page.headers["Cache-Control"] == "private, no-store"
        saved = next(
            message for message in first_page.json()["messages"] if message["id"] == message_id
        )
        assert saved == {**ANSWERS, "id": message_id, "received_at": saved["received_at"]}

        blanks = dict.fromkeys(("first_name", "last_name", "email", "phone"), " ")
        for _ in range(20):
            response = client.post(
                WEBHOOK,
                json={"data": {**data, **blanks, "submission_id": str(uuid4())}},
            )
            assert response.status_code == 201

        first = client.get(MESSAGES, headers=AUTH).json()
        assert len(first["messages"]) == 20
        assert first["previous_offset"] is None
        assert all(message[field] is None for message in first["messages"] for field in blanks)
        second = client.get(MESSAGES, headers=AUTH, params={"offset": first["next_offset"]}).json()
        assert second["previous_offset"] == 0
        assert second["messages"][0]["id"] == message_id

        with app.state.engine.connect() as connection:
            assert connection.scalar(
                text("SELECT relrowsecurity FROM pg_class WHERE oid = 'contact_messages'::regclass")
            )
            privileges = connection.execute(
                text("""
                SELECT rolname, has_table_privilege(rolname, 'contact_messages', 'SELECT')
                FROM pg_roles WHERE rolname IN ('anon', 'authenticated')
            """)
            )
            assert all(not can_select for _, can_select in privileges)
