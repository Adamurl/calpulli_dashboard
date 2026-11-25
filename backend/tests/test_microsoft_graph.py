import base64
import json
from collections.abc import Callable
from datetime import datetime
from urllib.parse import parse_qs

import httpx
import pytest

from app.integrations.gmail import ProviderError
from app.integrations.microsoft_graph import MAX_DOWNLOAD_BYTES, MicrosoftGraph

GRAPH = "https://graph.microsoft.com/v1.0/users/mailbox%40example.org"
MAILBOX_PATH = "/v1.0/users/mailbox@example.org"
TOKEN_URL = "https://login.microsoftonline.com/test-tenant/oauth2/v2.0/token"
FILE_KIND = "#microsoft.graph.fileAttachment"
FORMATTED = "<p>First <strong>line</strong><br>Second line</p><ul><li>Item</li></ul>"
FILE_BYTES = b"%PDF-1.0 test bytes"
FILE = {
    "name": "Contract.pdf",
    "content_type": "application/pdf",
    "content_base64": base64.b64encode(FILE_BYTES).decode("ascii"),
}


@pytest.fixture
def graph():
    clients: list[httpx.Client] = []

    def create(
        handler: Callable[[httpx.Request], httpx.Response],
    ) -> tuple[MicrosoftGraph, list[httpx.Request]]:
        requests: list[httpx.Request] = []

        def dispatch(request: httpx.Request) -> httpx.Response:
            requests.append(request)
            if str(request.url) == TOKEN_URL:
                assert request.method == "POST"
                assert parse_qs(request.content.decode("ascii")) == {
                    "client_id": ["test-client"],
                    "client_secret": ["test-secret"],
                    "grant_type": ["client_credentials"],
                    "scope": ["https://graph.microsoft.com/.default"],
                }
                return httpx.Response(
                    200, json={"access_token": "simulated-token", "expires_in": 3600}
                )
            assert request.url.host == "graph.microsoft.com"
            assert request.headers["Authorization"] == "Bearer simulated-token"
            assert 'IdType="ImmutableId"' in request.headers["Prefer"]
            return handler(request)

        client = httpx.Client(transport=httpx.MockTransport(dispatch))
        clients.append(client)
        return MicrosoftGraph(
            client,
            tenant_id="test-tenant",
            client_id="test-client",
            client_secret="test-secret",
            mailbox="mailbox@example.org",
        ), requests

    yield create
    for client in clients:
        client.close()


def test_send_preserves_html_and_links_uploaded_file_to_immutable_draft(graph):
    def handler(request):
        route = request.url.path.removeprefix(MAILBOX_PATH)
        if route == "/messages":
            assert json.loads(request.content) == {
                "subject": "Booking packet",
                "body": {"contentType": "HTML", "content": FORMATTED},
                "toRecipients": [{"emailAddress": {"address": "client@example.net"}}],
            }
            return httpx.Response(201, json={"id": "draft/1=", "conversationId": "thread-1"})
        if route == "/messages/draft/1=/attachments":
            assert b"draft%2F1%3D" in request.url.raw_path
            assert json.loads(request.content) == {
                "@odata.type": FILE_KIND,
                "name": "Contract.pdf",
                "contentType": "application/pdf",
                "contentBytes": FILE["content_base64"],
            }
            return httpx.Response(201)
        assert route == "/messages/draft/1=/send"
        assert request.content == b""
        return httpx.Response(202)

    adapter, requests = graph(handler)
    result = adapter.send(
        recipient="client@example.net", subject="Booking packet", html=FORMATTED, attachments=[FILE]
    )

    assert (result.message_id, result.thread_id) == ("draft/1=", "thread-1")
    assert [request.method for request in requests] == ["POST", "POST", "POST", "POST"]


def test_reply_uses_existing_conversation_and_pins_only_chosen_contact(graph):
    def handler(request):
        route = request.url.path.removeprefix(MAILBOX_PATH)
        if route == "/messages/original":
            return httpx.Response(
                200,
                json={
                    "id": "original",
                    "conversationId": "thread-1",
                    "from": {"emailAddress": {"address": "client@example.net"}},
                    "ccRecipients": [{"emailAddress": {"address": "onlooker@example.com"}}],
                },
            )
        if route == "/messages/original/createReply":
            assert request.method == "POST"
            return httpx.Response(201, json={"id": "reply-draft", "conversationId": "thread-1"})
        if route == "/messages/reply-draft":
            assert request.method == "PATCH"
            assert json.loads(request.content) == {
                "body": {"contentType": "HTML", "content": FORMATTED},
                "toRecipients": [{"emailAddress": {"address": "CLIENT@example.net"}}],
                "ccRecipients": [],
                "bccRecipients": [],
            }
            return httpx.Response(200)
        if route == "/messages/reply-draft/attachments":
            assert json.loads(request.content)["contentBytes"] == FILE["content_base64"]
            return httpx.Response(201)
        assert route == "/messages/reply-draft/send"
        return httpx.Response(202)

    adapter, requests = graph(handler)
    result = adapter.send(
        recipient="CLIENT@example.net",
        subject="Already on thread",
        html=FORMATTED,
        attachments=[FILE],
        reply_to="original",
    )
    assert result.thread_id == "thread-1"
    assert [request.method for request in requests] == [
        "POST",
        "GET",
        "POST",
        "PATCH",
        "POST",
        "POST",
    ]


@pytest.mark.parametrize(
    ("recipient", "is_draft"),
    [("unrelated@example.net", False), ("client@example.net", True)],
)
def test_reply_refuses_unrelated_contact_or_draft(graph, recipient, is_draft):
    def handler(request):
        assert request.method == "GET"
        return httpx.Response(
            200,
            json={
                "id": "original",
                "conversationId": "thread-1",
                "isDraft": is_draft,
                "from": {"emailAddress": {"address": "client@example.net"}},
            },
        )

    adapter, requests = graph(handler)
    with pytest.raises(ProviderError, match="does not belong"):
        adapter.send(
            recipient=recipient,
            subject="Reply",
            html=FORMATTED,
            attachments=[],
            reply_to="original",
        )
    assert [request.method for request in requests] == ["POST", "GET"]


@pytest.mark.parametrize(
    ("status", "retryable", "unknown"),
    [(429, True, False), (503, False, True), (408, False, True), (None, False, True)],
)
def test_final_submission_classifies_ambiguous_outcomes(graph, status, retryable, unknown):
    def handler(request):
        if request.url.path.endswith("/messages"):
            return httpx.Response(201, json={"id": "draft", "conversationId": "thread"})
        if status is None:
            raise httpx.ReadTimeout("private diagnostics", request=request)
        return httpx.Response(status, text="private diagnostics")

    adapter, _ = graph(handler)
    with pytest.raises(ProviderError) as error:
        adapter.send(recipient="qa@example.net", subject="QA", html=FORMATTED, attachments=[])
    assert error.value.retryable is retryable
    assert error.value.delivery_unknown is unknown
    assert "private diagnostics" not in str(error.value)


def test_rejected_attachment_never_submits_an_incomplete_message(graph):
    def handler(request):
        if request.url.path.endswith("/messages"):
            return httpx.Response(201, json={"id": "draft", "conversationId": "thread"})
        assert request.url.path.endswith("/attachments")
        return httpx.Response(429)

    adapter, requests = graph(handler)
    with pytest.raises(ProviderError) as error:
        adapter.send(recipient="qa@example.net", subject="QA", html=FORMATTED, attachments=[FILE])
    assert error.value.retryable is True
    assert error.value.delivery_unknown is False
    assert len(requests) == 3


def test_inbox_exposes_safe_text_and_graph_supplied_offset(graph):
    def handler(request):
        assert request.url.path == f"{MAILBOX_PATH}/mailFolders/inbox/messages"
        assert request.url.params["$orderby"] == "receivedDateTime desc"
        assert request.url.params["$skip"] == "3"
        assert "bodyPreview" in request.url.params["$select"].split(",")
        assert "body" not in request.url.params["$select"].split(",")
        assert 'outlook.body-content-type="text"' in request.headers["Prefer"]
        return httpx.Response(
            200,
            json={
                "value": [
                    {
                        "id": "inbound-a",
                        "conversationId": "thread",
                        "subject": "Question",
                        "from": {"emailAddress": {"address": "client@example.net"}},
                        "toRecipients": [{"emailAddress": {"address": "mailbox@example.org"}}],
                        "body": {
                            "contentType": "html",
                            "content": "<style>hidden</style><p>Line 1<br>Line 2</p>"
                            '<script>hidden</script><img src="https://tracker.example.net/1">',
                        },
                        "receivedDateTime": "2026-11-21T03:00:00Z",
                        "hasAttachments": True,
                    }
                ],
                "@odata.nextLink": f"{GRAPH}/mailFolders/inbox/messages?$skip=44&$top=30",
            },
        )

    adapter, _ = graph(handler)
    assert adapter.messages("inbox", skip=3) == {
        "messages": [
            {
                "id": "inbound-a",
                "conversation_id": "thread",
                "subject": "Question",
                "sender": "client@example.net",
                "recipients": ["mailbox@example.org"],
                "reply_to": [],
                "at": "2026-11-21T03:00:00Z",
                "body_text": "Line 1\nLine 2",
                "has_attachments": True,
                "is_draft": False,
            }
        ],
        "next_skip": 44,
    }


def test_conversation_loads_next_page_and_excludes_drafts_and_other_conversations(graph):
    def item(message_id, date, **extra):
        return {
            "id": message_id,
            "conversationId": "t'hread",
            "sentDateTime": f"2026-11-21T0{date}:00:00Z",
            **extra,
        }

    def handler(request):
        if "$skiptoken" in request.url.params:
            assert request.url.params["$skiptoken"] == "a+2"
            return httpx.Response(200, json={"value": [item("before", 1), item("later", 4)]})
        assert request.url.params["$filter"] == "conversationId eq 't''hread'"
        return httpx.Response(
            200,
            json={
                "value": [
                    item("later", 4),
                    item("unsent", 3, isDraft=True),
                    {**item("other", 2), "conversationId": "other"},
                ],
                "@odata.nextLink": f"{GRAPH}/messages?%24skiptoken=a%2B2",
            },
        )

    adapter, requests = graph(handler)
    assert [item["id"] for item in adapter.conversation("t'hread")] == ["before", "later"]
    assert len(requests) == 3


@pytest.mark.parametrize(
    "url",
    [
        "https://graph.microsoft.com.example.net/v1.0/users/mailbox@example.org/messages?$skip=30",
        "https://graph.microsoft.com/v1.0/users/other@example.org/messages?$skip=30",
        "http://graph.microsoft.com/v1.0/users/mailbox@example.org/messages?$skip=30",
    ],
)
def test_conversation_never_follows_unexpected_next_link(graph, url):
    adapter, requests = graph(
        lambda _: httpx.Response(200, json={"value": [], "@odata.nextLink": url})
    )
    with pytest.raises(ProviderError) as error:
        adapter.conversation("thread")
    assert error.value.code == "graph_invalid_response"
    assert len(requests) == 2


def test_download_reads_only_a_file_attachment_and_returns_correct_bytes(graph):
    metadata = {
        "@odata.type": FILE_KIND,
        "id": "file",
        "name": "Contract.pdf",
        "contentType": "application/pdf",
        "size": len(FILE_BYTES),
    }

    def handler(request):
        route = request.url.path.removeprefix(MAILBOX_PATH)
        if route.endswith("/attachments"):
            other = {**metadata, "@odata.type": "#microsoft.graph.referenceAttachment"}
            return httpx.Response(200, json={"value": [metadata, other]})
        if route.endswith("/file/$value"):
            return httpx.Response(200, content=FILE_BYTES)
        assert route.endswith("/file")
        return httpx.Response(200, json=metadata)

    adapter, _ = graph(handler)
    assert adapter.attachments("message") == [
        {
            "id": "file",
            "name": "Contract.pdf",
            "size": len(FILE_BYTES),
            "content_type": "application/pdf",
        }
    ]
    assert adapter.download("message", "file") == ("Contract.pdf", FILE_BYTES)


@pytest.mark.parametrize("kind", ["#microsoft.graph.referenceAttachment", FILE_KIND])
def test_download_refuses_reference_or_oversized_attachment_before_reading_bytes(graph, kind):
    def handler(request):
        assert not request.url.path.endswith("/$value")
        return httpx.Response(
            200,
            json={
                "@odata.type": kind,
                "id": "file",
                "name": "large.txt",
                "size": MAX_DOWNLOAD_BYTES + 1,
            },
        )

    adapter, _ = graph(handler)
    with pytest.raises(ProviderError) as error:
        adapter.download("message", "file")
    assert error.value.code in {"graph_attachment_too_large", "graph_attachment_unsupported"}


def test_download_bounds_stream_even_with_false_metadata(graph):
    def handler(request):
        if request.url.path.endswith("/$value"):
            return httpx.Response(200, content=b"x" * (MAX_DOWNLOAD_BYTES + 1))
        return httpx.Response(
            200,
            json={"@odata.type": FILE_KIND, "id": "file", "name": "file", "size": 1},
        )

    adapter, _ = graph(handler)
    with pytest.raises(ProviderError) as error:
        adapter.download("message", "file")
    assert error.value.code == "graph_attachment_too_large"


@pytest.mark.parametrize(
    ("days", "earliest", "previous", "active_days"),
    [
        (30, "2026-09-24T07:00:00+00:00", 2, {0, 21, 22, 27}),
        (7, "2026-10-24T07:00:00+00:00", 2, {4}),
    ],
)
def test_mailbox_statistics_count_messages_and_unanswered_threads_across_pages(
    graph, days, earliest, previous, active_days
):
    def incoming(message_id, thread, at):
        return {"id": message_id, "conversationId": thread, "receivedDateTime": at}

    def sent(message_id, thread, at):
        return {"id": message_id, "conversationId": thread, "sentDateTime": at}

    def handler(request):
        params = request.url.params
        if request.url.path.endswith("/inbox/messages"):
            if params.get("$skiptoken") == "page-2":
                return httpx.Response(
                    200,
                    json={
                        "value": [
                            incoming("1", "reopened", "2026-11-14T12:00:00Z"),
                            incoming("2", "answered", "2026-11-15T12:00:00Z"),
                            incoming("3", "reopened", "2026-11-20T12:00:00Z"),
                            incoming("4", "previous", "2026-10-24T06:59:59Z"),
                            incoming("5", "previous", "2026-09-24T07:00:00Z"),
                        ]
                    },
                )
            assert params["$select"] == "id,conversationId,receivedDateTime"
            assert params["$filter"] == f"receivedDateTime ge {earliest}"
            return httpx.Response(
                200,
                json={
                    "value": [
                        incoming("1", "reopened", "2026-11-14T12:00:00Z"),
                        incoming("6", "new", "2026-10-24T07:00:00Z"),
                    ],
                    "@odata.nextLink": f"{GRAPH}/mailFolders/inbox/messages?$skiptoken=page-2",
                },
            )
        assert request.url.path.endswith("/sentitems/messages")
        assert params["$select"] == "id,conversationId,sentDateTime"
        assert params["$filter"] == "sentDateTime ge 2026-10-24T07:00:00+00:00"
        return httpx.Response(
            200,
            json={
                "value": [
                    sent("7", "reopened", "2026-11-16T12:00:00Z"),
                    sent("8", "answered", "2026-11-16T12:00:00Z"),
                ]
            },
        )

    adapter, _ = graph(handler)
    assert adapter.statistics(now=datetime.fromisoformat("2026-11-22T18:00:00Z"), days=days) == {
        "received": len(active_days),
        "previously_received": previous,
        "awaiting_reply": 2,
        "daily_received": [int(day in active_days) for day in range(days)],
    }
