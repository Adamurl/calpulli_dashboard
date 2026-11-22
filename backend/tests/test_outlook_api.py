from base64 import b64encode
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.integrations.gmail import ProviderError, SendResult
from app.integrations.outlook_delivery import OutlookDelivery
from app.main import create_app
from app.modules.outlook.router import MAX_SEND_REQUEST_BYTES
from app.modules.outlook.schemas import MAX_ATTACHMENT_BYTES

API = "/api/v1/outlook"
TOKEN = "outlook-test-token"
HEADERS = {"Authorization": f"Bearer {TOKEN}"}
OUTSIDE = "client@example.org"
MAILBOX = "presentations@example.org"
TEST_RECIPIENT = "test-inbox@example.net"
MESSAGE = {
    "id": "id/123",
    "conversation_id": "thread/123",
    "subject": "Availability",
    "sender": OUTSIDE,
    "recipients": [MAILBOX],
    "at": "2026-11-20T18:00:00Z",
    "body_text": "Can you confirm?\nThank you",
    "has_attachments": True,
}


class FakeGraph:
    def __init__(self):
        self.sends = []
        self.error = None

    def messages(self, folder, *, skip):
        assert folder == "inbox" and skip == 11
        return {
            "messages": [MESSAGE, {**MESSAGE, "id": "other", "sender": "other@example.net"}],
            "next_skip": 20,
        }

    def conversation(self, conversation_id):
        assert conversation_id == MESSAGE["conversation_id"]
        return [MESSAGE, {**MESSAGE, "id": "sent", "sender": MAILBOX, "recipients": [OUTSIDE]}]

    def attachments(self, message_id):
        assert message_id == MESSAGE["id"]
        return [
            {"id": "file/123", "name": "details.pdf", "size": 6, "content_type": "application/pdf"}
        ]

    def download(self, message_id, attachment_id):
        assert message_id == MESSAGE["id"] and attachment_id == "file/123"
        return "details.pdf", b"%PDF-1"

    def send(self, **payload):
        self.sends.append(payload)
        if self.error:
            raise self.error
        return SendResult("new-message", MESSAGE["conversation_id"])


def open_app(staff_auth, *, database_url, test_mode):
    config = Settings(
        _env_file=None,
        database_url=database_url,
        app_env="test",
        email_provider="microsoft",
        email_test_mode=test_mode,
        email_test_recipient=TEST_RECIPIENT,
        microsoft_mailbox=MAILBOX,
        **staff_auth(TOKEN),
    )
    return create_app(config), config


def payload():
    return {
        "request_id": str(uuid4()),
        "recipient": OUTSIDE,
        "subject": "Re: Availability",
        "body_text": "Hello **there**\nSecond line\n\n<script>never run</script>",
        "format": "markdown",
        "attachments": [
            {
                "name": "details.pdf",
                "content_type": "application/octet-stream",
                "content_base64": "JVBERi0x",
            }
        ],
        "reply_to": MESSAGE["id"],
    }


def test_mailbox_is_staff_only_and_supports_contact_threads_and_downloads(staff_auth):
    app, config = open_app(
        staff_auth,
        database_url="postgresql+psycopg://test@127.0.0.1:1/calpulli_test",
        test_mode=False,
    )
    with TestClient(app) as client:
        assert client.get(f"{API}/capabilities").status_code == 401
        assert (
            client.get(f"{API}/capabilities", headers=HEADERS).json()["mailbox_available"] is False
        )
        app.state.outlook_delivery = OutlookDelivery(config, FakeGraph())
        response = client.get(
            f"{API}/messages", params={"skip": 11, "contact": OUTSIDE.upper()}, headers=HEADERS
        )
        assert response.status_code == 200
        assert [item["id"] for item in response.json()["messages"]] == [MESSAGE["id"]]
        assert response.json()["next_skip"] == 20
        invalid = client.get(f"{API}/messages", params={"contact": "@"}, headers=HEADERS)
        assert invalid.status_code == 422
        thread = client.get(f"{API}/conversations/thread%2F123", headers=HEADERS)
        assert [item["id"] for item in thread.json()] == [MESSAGE["id"], "sent"]
        file_path = f"{API}/messages/id%2F123/attachments"
        assert client.get(file_path, headers=HEADERS).json()[0]["name"] == "details.pdf"
        download = client.get(f"{file_path}/file%2F123", headers=HEADERS)
        assert download.content == b"%PDF-1"
        assert download.headers["content-type"] == "application/octet-stream"
        assert download.headers["content-disposition"].endswith("details.pdf")
        assert client.get(f"{file_path}/file%2F123").status_code == 401


def test_configured_microsoft_provider_is_ready_without_contacting_graph(staff_auth):
    app = create_app(
        Settings(
            _env_file=None,
            database_url="postgresql+psycopg://test@127.0.0.1:1/calpulli_test",
            email_provider="microsoft",
            microsoft_tenant_id=uuid4(),
            microsoft_client_id=uuid4(),
            microsoft_client_secret="fictional-secret",
            microsoft_mailbox=MAILBOX,
            **staff_auth(TOKEN),
        )
    )
    with TestClient(app) as client:
        response = client.get(f"{API}/capabilities", headers=HEADERS)
        assert response.json() == {
            "mailbox_address": MAILBOX,
            "mailbox_available": True,
            "test_mode": True,
        }
        assert app.state.email_provider is app.state.outlook_delivery


def test_over_limit_or_invalid_files_are_rejected_before_delivery(staff_auth):
    app, config = open_app(
        staff_auth,
        database_url="postgresql+psycopg://test@127.0.0.1:1/calpulli_test",
        test_mode=True,
    )
    draft = payload()
    with TestClient(app) as client:
        graph = FakeGraph()
        app.state.outlook_delivery = OutlookDelivery(config, graph)
        file = draft["attachments"][0]
        file["content_base64"] = b64encode(b"a" * (MAX_ATTACHMENT_BYTES + 1)).decode()
        assert client.post(f"{API}/send", headers=HEADERS, json=draft).status_code == 422
        file["content_base64"] = "%%%A"
        assert client.post(f"{API}/send", headers=HEADERS, json=draft).status_code == 422
        assert (
            client.post(
                f"{API}/send", headers=HEADERS, json={**payload(), "recipient": "@"}
            ).status_code
            == 422
        )
        new_without_subject = {**payload(), "subject": "", "reply_to": None}
        assert (
            client.post(f"{API}/send", headers=HEADERS, json=new_without_subject).status_code == 422
        )
        oversized = b"x" * (MAX_SEND_REQUEST_BYTES + 1)
        assert client.post(f"{API}/send", headers=HEADERS, content=oversized).status_code == 413
        assert client.post(f"{API}/send", content=oversized).status_code == 401
        assert graph.sends == []


def test_preview_returns_safe_html_and_preserves_plain_text(staff_auth):
    app, _ = open_app(
        staff_auth,
        database_url="postgresql+psycopg://test@127.0.0.1:1/calpulli_test",
        test_mode=True,
    )
    with TestClient(app) as client:
        content = {"body_text": "  Hello\n\nWorld & welcome", "format": "plain"}
        assert client.post(f"{API}/preview", json=content).status_code == 401
        plain = client.post(f"{API}/preview", headers=HEADERS, json=content)
        assert plain.json()["html"] == (
            '<div style="white-space: pre-wrap">  Hello<br><br>World &amp; welcome</div>'
        )
        markdown = client.post(
            f"{API}/preview",
            headers=HEADERS,
            json={
                "body_text": "**Bold**\n![Pixels](https://example.org/pixel)\n[x](javascript:alert(1))",
                "format": "markdown",
            },
        ).json()["html"]
        assert "<strong>Bold</strong>" in markdown
        assert "<img" not in markdown and 'href="javascript:' not in markdown


@pytest.mark.integration
@pytest.mark.parametrize("test_mode", [False, True])
def test_send_preserves_copy_files_and_reply_and_deduplicates(staff_auth, database_url, test_mode):
    app, config = open_app(staff_auth, database_url=database_url, test_mode=test_mode)
    draft = payload()
    if not test_mode:
        draft["subject"] = ""
    with TestClient(app) as client:
        graph = FakeGraph()
        app.state.outlook_delivery = OutlookDelivery(config, graph)
        initial = client.post(f"{API}/send", headers=HEADERS, json=draft)
        repeat = client.post(f"{API}/send", headers=HEADERS, json=draft)
        changed = client.post(f"{API}/send", headers=HEADERS, json={**draft, "subject": "Changed"})
        assert initial.status_code == repeat.status_code == 202
        assert (
            initial.json()
            == repeat.json()
            == {
                "message_id": "new-message",
                "conversation_id": MESSAGE["conversation_id"],
                "status": "accepted",
            }
        )
        assert changed.status_code == 409
        (outbound,) = graph.sends
        assert outbound["recipient"] == (TEST_RECIPIENT if test_mode else OUTSIDE)
        assert outbound["reply_to"] == (None if test_mode else MESSAGE["id"])
        assert "Hello <strong>there</strong><br" in outbound["html"]
        assert "&lt;script&gt;" in outbound["html"]
        assert outbound["attachments"] == [
            {**draft["attachments"][0], "content_type": "application/pdf"}
        ]


@pytest.mark.integration
def test_unknown_send_is_not_resubmitted(staff_auth, database_url):
    app, config = open_app(staff_auth, database_url=database_url, test_mode=False)
    draft = payload()
    with TestClient(app) as client:
        graph = FakeGraph()
        graph.error = ProviderError(
            "graph_timeout", "Unknown delivery", False, delivery_unknown=True
        )
        app.state.outlook_delivery = OutlookDelivery(config, graph)
        assert client.post(f"{API}/send", headers=HEADERS, json=draft).status_code == 409
        graph.error = None
        assert client.post(f"{API}/send", headers=HEADERS, json=draft).status_code == 409
        assert len(graph.sends) == 1
