# API schemas and maintenance

[Documentation index](../README.md). Feature-specific API references live in their feature folders; this folder holds shared schema artifacts.

[Backend API overview](../API.md) indexes all feature references. These documents describe implemented behavior; [verification](../VERIFICATION.md) records checks and environment limits.

## Schema artifacts

| File | Source | Coverage |
| --- | --- | --- |
| [openapi.json](openapi.json) | FastAPI `app.openapi()` | Declared JSON operations, parameters, security dependencies, and response models |
| [schema-catalog.json](schema-catalog.json) | Pydantic `models_json_schema` | Request validation and response serialization models under `$defs` |

The catalog is a JSON Schema definitions document. It does not select one default root payload. A specific contract is referenced as `schema-catalog.json#/$defs/NewPresentation`, for example. Output models are generated in serialization mode so the activity response includes both `request_id` and `inquiry_id`.

The snapshots use explicit synthetic settings with environment-file loading disabled. Generation does not start the application lifespan, create database tables, contact Gmail, or read private CSV files. They contain no credentials or client examples from source data.

## Declared-schema limitations

The current OpenAPI document does not declare the streaming Wix request body, typed email panel/capability output, or every runtime HTTP error. Some response schemas are consequently empty objects in the declaration. `TaskRead` and `WixFields` are supplied separately in the schema catalog. Workflow action eligibility and custom validators are specified in the feature documents.

The staff HTML shell is explicitly excluded from OpenAPI. Historical import and Gmail provider functions are internal interfaces rather than missing public routes. A schema snapshot does not establish that migrations, production access controls, OAuth, or live delivery have been verified.

## Regeneration

From `backend/`, after installing the repository dependencies, both artifacts are regenerated with this command. The existing project convention is `uv run python`; an installed Python environment with matching dependencies also works.

```bash
uv run python - <<'PY'
import json
from pathlib import Path

from pydantic.json_schema import models_json_schema

from app.core.config import Settings
from app.core.errors import ErrorResponse
from app.integrations.supabase_auth import AuthenticatedUser
from app.integrations.wix import WixFields
from app.main import create_app
from app.modules.health.router import HealthResponse
from app.modules.presentations.email_schemas import (
    DraftEdit, EmailRead, EventInput, TaskRead, TemplateEdit, TemplateRead,
)
from app.modules.presentations.index_schemas import (
    PresentationIndex, PresentationStatistics, StatisticSeries,
)
from app.modules.presentations.operations_schemas import OperationsRead
from app.modules.presentations.schemas import (
    ActivityList, ActivityRead, NewPresentation, PresentationList,
    PresentationPatch, PresentationRead, PresentationSummary,
)

settings = Settings(
    _env_file=None,
    database_url="postgresql+psycopg://test@127.0.0.1:1/calpulli_test",
    app_env="test",
)
app = create_app(settings)
inputs = [
    NewPresentation, PresentationPatch, EventInput, DraftEdit,
    TemplateEdit, WixFields,
]
outputs = [
    AuthenticatedUser, HealthResponse, PresentationSummary, PresentationRead, PresentationList,
    ActivityRead, ActivityList, EmailRead, TaskRead, TemplateRead, ErrorResponse, OperationsRead,
    PresentationIndex, PresentationStatistics, StatisticSeries,
]
_, catalog = models_json_schema(
    [(model, "validation") for model in inputs]
    + [(model, "serialization") for model in outputs],
    title="Calpulli backend request and response schemas",
)
destination = Path("../docs/api")
for name, payload in [("openapi.json", app.openapi()), ("schema-catalog.json", catalog)]:
    (destination / name).write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n")
PY
```

Field tables in the feature references mirror these model properties. Runtime validators, route branches, and service rules still require source inspection when they change. Operation count is the number of HTTP method entries under `openapi.json` → `paths`; it excludes the HTML shell.

## Reference ownership

| Reference | Primary implementation |
| --- | --- |
| [Health](../health/README.md) | `app/modules/health/router.py` |
| [Presentations](../presentations/api.md) | Presentation `router.py`, `schemas.py`, `services.py` |
| [Activity](../presentations/activity.md) | Presentation activity schema, model, and list service |
| [Email workflow](../email/api.md) | `email_router.py`, `email_schemas.py`, `email_registry.py`, `email_service.py` |
| [Templates](../email/templates.md) | Template models, validators, and update service |
| [Gmail provider](../email/gmail-provider.md) | `app/integrations/gmail.py` |
| [Wix receiver](../presentations/wix-webhook.md) | `app/integrations/wix.py` |
| [Historical import](../presentations/legacy-import.md) | `app/imports/legacy_presentations.py` |

Paths in this table are relative to `backend/`. Public API behavior belongs in the feature reference. Setup procedures remain in the existing operational guides, linked from each feature page.
