"""Migrate only an explicitly named Supabase project from an ignored local env file."""

import argparse
import os
import subprocess
import sys
from pathlib import Path

from app.imports.operational_presentations import reviewed_database_url


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--project-ref", required=True)
    parser.add_argument(
        "--env-file", type=Path, default=Path(__file__).resolve().parents[2] / ".env"
    )
    parser.add_argument("--check", action="store_true", help="Check schema drift without migrating")
    args = parser.parse_args()
    try:
        url = reviewed_database_url(args.env_file, args.project_ref)
        environment = os.environ.copy()
        environment.update(
            DATABASE_URL=url.render_as_string(hide_password=False),
            APP_ENV="production",
            EMAIL_PROVIDER="mock",
            EMAIL_TEST_MODE="true",
        )
        command = ["check"] if args.check else ["upgrade", "head"]
        result = subprocess.run(
            [sys.executable, "-m", "alembic", *command],
            cwd=Path(__file__).resolve().parents[2],
            env=environment,
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode:
            print(
                "Migration check failed. Check the reviewed target, credentials and schema.",
                file=sys.stderr,
            )
            return 1
        print(
            "Schema check passed." if args.check else "Migrations applied to the reviewed project."
        )
        return 0
    except Exception:
        print("Migration failed. Check the local env file and reviewed project.", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
