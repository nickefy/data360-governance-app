"""Point the app at one bundle target's catalog / schema prefix / auth mode before `databricks bundle deploy`.

The app's SQL files (app/config/queries/*.sql) must name the registry explicitly (AppKit type-generates from them),
and app/app.yaml carries the same settings as environment variables. This script rewrites both from the target's
bundle variables, so one repo deploys to any workspace.

Usage:
  python3 scripts/configure_app.py -t dev [-p <cli-profile>] [--var catalog=x ...]   # read variables from databricks.yml
  python3 scripts/configure_app.py --catalog d360 --prefix d360 --auth-mode users   # explicit values, no CLI call
"""
import argparse
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
APP = ROOT / "app"
IDENT = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def bundle_vars(target, profile, overrides):
    cmd = ["databricks", "bundle", "validate", "-t", target, "-o", "json"] + (["-p", profile] if profile else [])
    for kv in overrides:  # same --var overrides you pass to `bundle deploy` (e.g. in CI)
        cmd += ["--var", kv]
    out = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True)
    if out.returncode != 0:
        sys.exit(f"bundle validate failed:\n{out.stderr or out.stdout}")
    v = json.loads(out.stdout)["variables"]
    return v["catalog"]["value"], v["schema_prefix"]["value"], v["auth_mode"]["value"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("-t", "--target")
    ap.add_argument("-p", "--profile", default="")
    ap.add_argument("--var", action="append", default=[], help="bundle variable override k=v, as for bundle deploy")
    ap.add_argument("--catalog")
    ap.add_argument("--prefix", default="d360")
    ap.add_argument("--auth-mode", default="users", choices=["demo", "users"])
    a = ap.parse_args()
    if a.target:
        cat, prefix, auth = bundle_vars(a.target, a.profile, a.var)
    elif a.catalog:
        cat, prefix, auth = a.catalog, a.prefix, a.auth_mode
    else:
        sys.exit("give -t <target> or --catalog")
    if not IDENT.match(cat) or not re.match(r"^[a-z][a-z0-9_]*$", prefix):
        sys.exit(f"catalog '{cat}' / prefix '{prefix}' must be plain identifiers (letters, digits, underscore)")
    if auth not in ("demo", "users"):
        sys.exit(f"auth_mode must be demo or users, got {auth}")

    gov = f"{cat}.{prefix}_governance"
    pat = re.compile(r"\b[A-Za-z_][A-Za-z0-9_]*\.[a-z][a-z0-9_]*_governance\b")
    changed = 0
    for f in sorted((APP / "config" / "queries").glob("*.sql")):
        s = f.read_text()
        n = pat.sub(gov, s)
        if n != s:
            f.write_text(n)
            changed += 1

    y = APP / "app.yaml"
    env = {"D360_CATALOG": cat, "D360_SCHEMA_PREFIX": prefix, "D360_AUTH_MODE": auth}
    lines = ["command: ['npm', 'run', 'start']", "env:",
             "  - name: DATABRICKS_WAREHOUSE_ID", "    valueFrom: sql-warehouse",
             "  - name: DATABRICKS_JOB_ID", "    valueFrom: dq-job"]
    for k, v in env.items():
        lines += [f"  - name: {k}", f"    value: {v}"]
    y.write_text("# Written by scripts/configure_app.py; edit databricks.yml target variables instead.\n" + "\n".join(lines) + "\n")

    dotenv = APP / ".env"  # local `npm run dev` only (gitignored)
    if dotenv.exists():
        s = dotenv.read_text()
        for k, v in env.items():
            s = re.sub(rf"^{k}=.*$", f"{k}={v}", s, flags=re.M) if re.search(rf"^{k}=", s, flags=re.M) else s.rstrip("\n") + f"\n{k}={v}\n"
        dotenv.write_text(s)
    print(f"app configured: registry {gov}, auth_mode {auth} ({changed} query files updated, app.yaml written)")


if __name__ == "__main__":
    main()
