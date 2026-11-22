from html import escape

from app.core.config import Settings
from app.core.email_address import valid_recipient
from app.integrations.gmail import OutgoingEmail, ProviderError, SendResult
from app.integrations.microsoft_graph import MicrosoftGraph


class OutlookDelivery:
    provider_name = "microsoft"

    def __init__(self, config: Settings, graph: MicrosoftGraph | None) -> None:
        self.config = config
        self.graph = graph

    def available_graph(self) -> MicrosoftGraph:
        if self.graph is None:
            raise ProviderError("configuration", "Outlook email is unavailable", False)
        return self.graph

    def address(self, recipient: str, reply_to: str | None) -> tuple[str, str | None]:
        if not self.config.email_test_mode:
            return recipient, reply_to
        test_recipient = self.config.email_test_recipient
        if not valid_recipient(test_recipient):
            raise ProviderError("configuration", "Configure an Outlook test recipient", False)
        return test_recipient, None

    def send_email(self, message: OutgoingEmail) -> SendResult:
        return self._send(message, None)

    def send_reply(self, message: OutgoingEmail) -> SendResult:
        if not message.provider_reply_id:
            raise ProviderError("invalid_reply", "Select an Outlook message to reply to", False)
        return self._send(message, message.provider_reply_id)

    def _send(self, message: OutgoingEmail, reply_to: str | None) -> SendResult:
        recipient, reply_to = self.address(message.recipient_email, reply_to)
        return self.available_graph().send(
            recipient=recipient,
            subject=message.subject,
            html=message.body_html or escape(message.body_text).replace("\n", "<br>"),
            attachments=[],
            reply_to=reply_to,
        )
