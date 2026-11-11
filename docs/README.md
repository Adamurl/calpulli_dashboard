# Calpulli documentation

Feature documentation lives in a folder named for the feature. Each folder groups its overview, API contracts, operational notes, and related design documents.

## Features

| Feature | Overview | Technical references |
| --- | --- | --- |
| Presentations | [Request data and domain](presentations/README.md) | [API](presentations/api.md), [activity](presentations/activity.md), [historical import](presentations/legacy-import.md), [Wix webhook](presentations/wix-webhook.md) |
| Email | [Workflow and setup](email/README.md) | [API](email/api.md), [templates](email/templates.md), [Gmail provider](email/gmail-provider.md) |
| Health | [Liveness and readiness API](health/README.md) | Public health responses and database readiness |
| Dashboard | [UX and style guide](dashboard/README.md) | [UX plan](DASHBOARD_UX.md), [style guide](DASHBOARD_STYLE_GUIDE.md) |

## Shared documentation

| Topic | Reference |
| --- | --- |
| Backend API conventions and endpoint index | [API overview](API.md) |
| Generated OpenAPI and JSON Schema | [Schema artifacts and maintenance](api/README.md) |
| Architecture and module boundaries | [Architecture](ARCHITECTURE.md) |
| Database conventions | [Database](DATABASE.md) |
| Access controls and secrets | [Security](SECURITY.md) |
| Provider configuration and activation | [Integrations](INTEGRATIONS.md) |
| Product scope | [Product requirements](PRD.md) |
| Planned work | [Roadmap](ROADMAP.md) |
| Observed checks and environment limits | [Verification](VERIFICATION.md) |

## New features

Add documentation for a new feature under `docs/<feature>/`, with a `README.md` linking its overview and references. Keep input/output contracts beside the feature's other documents. Add the feature to this index and its HTTP operations to the shared API overview when implemented.

The `docs/api/` folder contains shared schema artifacts and their regeneration instructions. Feature-specific API documents belong in their respective feature folders. Planned features remain in the roadmap until they have documentation to organize.
