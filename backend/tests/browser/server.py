import json
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
from uuid import UUID

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))
from sqlalchemy import create_engine, event
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Session

from app.core.config import Settings
from app.db.base import Base
from app.db.session import get_session
from app.main import create_app
from app.modules.presentations.email_models import EmailTemplate
from app.modules.presentations.models import PresentationRequest


@compiles(JSONB, "sqlite")
def jsonb(type_, compiler, **kw):
    return "JSON"


temporary_database = TemporaryDirectory(prefix="calpulli-email-browser-")
engine = create_engine(
    "sqlite:///" + temporary_database.name + "/email_test.sqlite",
    connect_args={"check_same_thread": False},
)


@event.listens_for(engine, "connect")
def funcs(conn, rec):
    conn.execute("PRAGMA foreign_keys=ON")
    conn.create_function(
        "jsonb_typeof", 1, lambda v: "array" if isinstance(json.loads(v), list) else "object"
    )


Base.metadata.create_all(engine)
with Session(engine) as session:
    if not session.get(EmailTemplate, "inquiry_received"):
        rows = json.loads(
            (
                Path(__file__).resolve().parents[2] / "alembic/data/email_templates_v1.json"
            ).read_text()
        )
        session.add_all(EmailTemplate(**r) for r in rows)
        p = PresentationRequest(
            id=UUID("11111111-1111-4111-8111-111111111111"),
            source="manual",
            form_version="presentation_v2",
            status="new",
            contact_first_name="Alex",
            contact_full_name="Alex Example",
            contact_email="client@example.org",
        )
        session.add(p)
        session.commit()
app = create_app(
    Settings(
        _env_file=None,
        database_url="postgresql+psycopg://test@127.0.0.1:1/calpulli_test",
        app_env="test",
        internal_api_token="fictional-browser-staff-token-32-characters",
        email_send_again_token="fictional-browser-resend-token-32-characters",
        email_test_recipient="qa@example.org",
    )
)


def db():
    with Session(engine, expire_on_commit=False) as session:
        yield session


app.dependency_overrides[get_session] = db
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="127.0.0.1", port=8768, access_log=False)
