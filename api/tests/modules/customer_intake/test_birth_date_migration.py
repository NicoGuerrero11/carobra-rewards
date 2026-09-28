from importlib.util import module_from_spec, spec_from_file_location
from io import StringIO
from pathlib import Path

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations


def migration():
    path = (
        Path(__file__).resolve().parents[3] / "alembic/versions/20260928_add_customer_birth_date.py"
    )
    spec = spec_from_file_location("birth_date_migration", path)
    assert spec is not None and spec.loader is not None
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_emits_only_one_nullable_date_column_without_default_or_backfill():
    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql",
        opts={
            "as_sql": True,
            "output_buffer": output,
        },
    )
    change = migration()
    assert change.down_revision == "20260910_numeric_rewards_ids"
    with Operations.context(context):
        change.upgrade()
    assert output.getvalue().strip() == "ALTER TABLE customers ADD COLUMN birth_date DATE;"


def test_additive_migration_preserves_existing_rows():
    engine = sa.create_engine("sqlite://")
    with engine.begin() as connection:
        connection.execute(sa.text("CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT)"))
        connection.execute(sa.text("INSERT INTO customers VALUES (1, 'Existing customer')"))
        with Operations.context(MigrationContext.configure(connection)):
            migration().upgrade()
        assert connection.execute(sa.text("SELECT * FROM customers")).one() == (
            1,
            "Existing customer",
            None,
        )
        column = next(
            c for c in sa.inspect(connection).get_columns("customers") if c["name"] == "birth_date"
        )
        assert column["nullable"] is True
        assert isinstance(column["type"], sa.Date)
        with Operations.context(MigrationContext.configure(connection)):
            migration().downgrade()
        assert connection.execute(sa.text("SELECT * FROM customers")).one() == (
            1,
            "Existing customer",
        )
    engine.dispose()
