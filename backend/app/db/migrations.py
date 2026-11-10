"""Keep schema autogeneration within the application's table ownership."""

from app.db.base import Base


def include_owned_name(name: str | None, type_: str, parent_names: dict[str, str | None]) -> bool:
    if type_ == "table":
        return parent_names.get("schema_qualified_table_name", name) in Base.metadata.tables
    return True
