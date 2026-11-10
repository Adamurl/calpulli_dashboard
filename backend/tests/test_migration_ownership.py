from app.db.migrations import include_owned_name
from app.modules.presentations import models


def test_owned_tables_are_checked_but_unrelated_tables_are_not() -> None:
    for model in [
        models.PresentationRequest,
        models.PresentationImportBatch,
        models.PresentationActivity,
    ]:
        name = model.__tablename__
        assert include_owned_name(name, "table", {"schema_qualified_table_name": name})
    for name in ["vendors", "spots", "vendor_spots", "user_roles"]:
        assert not include_owned_name(name, "table", {"schema_qualified_table_name": name})


def test_ownership_filter_preserves_column_and_constraint_drift_detection() -> None:
    assert include_owned_name("extra_column", "column", {"table_name": "presentation_requests"})
    assert include_owned_name("changed_constraint", "unique_constraint", {})
