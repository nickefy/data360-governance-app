"""Run one or more .sql files against a SQL warehouse, statement by statement.

Local alternative to the d360_setup job (handy for ad-hoc SQL from a laptop):
  uv run --no-project --with databricks-sdk python scripts/run_sql.py <profile> <warehouse_id> <catalog> file1.sql [file2.sql ...]
`${catalog}` is replaced with <catalog> and `${prefix}` with $D360_PREFIX (default d360). Statements end with a line ending in ';'.
"""
import os
import sys
import time

from databricks.sdk import WorkspaceClient
from databricks.sdk.service.sql import StatementState


def statements(text: str):
    buf = []
    for line in text.splitlines():
        if line.strip().startswith("--") and not buf:
            continue
        buf.append(line)
        if line.rstrip().endswith(";"):
            stmt = "\n".join(buf).strip().rstrip(";").strip()
            buf = []
            if stmt:
                yield stmt
    tail = "\n".join(buf).strip()
    if tail:
        yield tail


def main():
    profile, wh, catalog, *files = sys.argv[1:]
    w = WorkspaceClient(profile=profile)
    for f in files:
        sql = open(f).read().replace("${catalog}", catalog).replace("${prefix}", os.environ.get("D360_PREFIX", "d360"))
        for i, stmt in enumerate(statements(sql), 1):
            first = " ".join(stmt.split())[:110]
            t0 = time.time()
            r = w.statement_execution.execute_statement(warehouse_id=wh, statement=stmt, wait_timeout="50s")
            while r.status.state in (StatementState.PENDING, StatementState.RUNNING):
                time.sleep(2)
                r = w.statement_execution.get_statement(r.statement_id)
            if r.status.state != StatementState.SUCCEEDED:
                print(f"FAIL {f}#{i}: {first}\n  {r.status.error.message if r.status.error else r.status.state}")
                sys.exit(1)
            print(f"ok   {f}#{i} ({time.time()-t0:.1f}s): {first}")


if __name__ == "__main__":
    main()
