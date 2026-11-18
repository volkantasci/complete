# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Run Odoo with the server's clock started at a given instant and running on.

Why: the Community demo data are placed relative to the day of installation, so
the verifier's demo database must be created while the clock reads the
instant of slice 002d2's acceptance setup (Wednesday 11 November 2026, 10:00 UTC).
Inside the Odoo image (bind-mount ``./tools`` to ``/mnt/instant``)::

    python3 /mnt/instant/odoo_at_instant.py --at 2026-11-11T10:00:00 -- \
        -d DB -i MODS --with-demo --stop-after-init
    python3 /mnt/instant/odoo_at_instant.py check-demo -d DB
    python3 /mnt/instant/odoo_at_instant.py prepare -d DB [--night] [--holiday]
    python3 /mnt/instant/odoo_at_instant.py unprepare -d DB

The image's entrypoint runs any command that is not ``odoo`` as is, so this
script adds the database connection arguments from HOST, PORT, USER, PASSWORD
itself, as ``docker/entrypoint.sh`` does.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import UTC, datetime

SUBCOMMANDS = ("check-demo", "prepare", "unprepare")


def parse_instant(text: str) -> datetime:
    """Parse an ISO 8601 instant; a missing or ``Z`` zone means UTC. Returns naive UTC."""
    value = datetime.fromisoformat(text.replace("Z", "+00:00"))
    if value.tzinfo is not None:
        value = value.astimezone(tz=UTC).replace(tzinfo=None)
    return value


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="odoo_at_instant.py",
        description="Run odoo with its clock started at --at (use '--' before the odoo arguments), "
        "or one of: " + ", ".join(SUBCOMMANDS),
    )
    parser.add_argument(
        "--at",
        required=True,
        type=parse_instant,
        help="ISO instant (UTC unless it carries a zone), e.g. 2026-11-11T10:00:00",
    )
    parser.add_argument("odoo_args", nargs=argparse.REMAINDER, help="'--' then the odoo arguments")
    return parser


def build_sub_parser(command: str) -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog=f"odoo_at_instant.py {command}")
    parser.add_argument("-d", "--database", required=True)
    if command == "prepare":
        parser.add_argument("--night", action="store_true", help="also create Gantt Night (A64)")
        parser.add_argument(
            "--holiday", action="store_true", help="also create Gantt Holiday (A62)"
        )
    return parser


def parse_args(argv: list[str]) -> argparse.Namespace:
    """Return a namespace with ``command`` ('run' or a sub-command) and its options."""
    if argv and argv[0] in SUBCOMMANDS:
        ns = build_sub_parser(argv[0]).parse_args(argv[1:])
        ns.command = argv[0]
        return ns
    ns = build_parser().parse_args(argv)
    rest = ns.odoo_args
    if rest and rest[0] == "--":
        rest = rest[1:]
    ns.odoo_args = rest
    ns.command = "run"
    return ns


def db_args(odoo_args: list[str], environ=os.environ, config_text: str = "") -> list[str]:
    """Connection arguments from HOST/PORT/USER/PASSWORD, as docker/entrypoint.sh builds them."""
    values = [
        ("db_host", environ.get("HOST", "db")),
        ("db_port", environ.get("PORT", "5432")),
        ("db_user", environ.get("USER", "odoo")),
        ("db_password", environ.get("PASSWORD", "odoo")),
    ]
    out: list[str] = []
    for name, value in values:
        given = any(a == f"--{name}" or a.startswith(f"--{name}=") for a in odoo_args)
        in_config = re.search(rf"^\s*{name}\s*=", config_text, re.M) is not None
        if not given and not in_config:
            out += [f"--{name}", value]
    return out


def _config_text() -> str:
    path = os.environ.get("ODOO_RC", "")
    try:
        with open(path, encoding="utf-8") as handle:
            return handle.read()
    except OSError:
        return ""


def run_odoo(at: datetime, odoo_args: list[str]) -> None:
    import freezegun

    extra = db_args(odoo_args, os.environ, _config_text())
    if odoo_args and not odoo_args[0].startswith("-"):
        # an odoo sub-command (db, shell...) takes the connection options right after its name
        sys.argv = ["odoo", odoo_args[0], *extra, *odoo_args[1:]]
    else:
        sys.argv = ["odoo", *odoo_args, *extra]
    from odoo.cli.command import main

    with freezegun.freeze_time(at, tick=True):
        refresh_wrapped_clock()
        main()


def refresh_wrapped_clock() -> None:
    """Point the data evaluator's wrapped ``time`` and ``datetime`` at the frozen clock.

    The XML data of the demo evaluates ``time.strftime(...)`` and ``DateTime.today()``
    through wrappers that copied the real functions when Odoo was imported, before
    the clock was frozen: freezegun cannot reach those copies, and the demo
    contracts that end "today" (Keith Byrd's) would get the real day.
    """
    import datetime
    import time

    from odoo.tools.safe_eval import evaluation

    for wrapper, module in ((evaluation.time, time), (evaluation.datetime, datetime)):
        for name in [n for n in vars(wrapper) if not n.startswith("_") and hasattr(module, n)]:
            setattr(wrapper, name, getattr(module, name))


def _env(database: str):
    import odoo
    from odoo import api
    from odoo.modules.registry import Registry

    odoo.tools.config.parse_config(["-d", database, *db_args([], os.environ, _config_text())])
    registry = Registry(database)
    cr = registry.cursor()
    env = api.Environment(cr, 2, {})  # the administrator
    return cr, env


def _fixtures():
    """The Attendances bridge's test fixtures (the prepared-record builders and their names)."""
    from odoo.addons.hr_attendance_gantt.tests import hr_rows_fixtures

    return hr_rows_fixtures


def counts(env) -> dict:
    """Records of each prepared kind: by name for the Gantt ones, plus totals."""
    fixtures = _fixtures()
    like = [("name", "=like", fixtures.PREFIX + "%")]
    employees = env["hr.employee"].with_context(active_test=False).search(like)
    return {
        "gantt attendances": env["hr.attendance"].search_count(
            [("employee_id", "in", employees.ids)]
        ),
        "gantt employees": len(employees),
        "gantt schedules": env["resource.calendar"]
        .with_context(active_test=False)
        .search_count(like),
        "gantt holidays": env["resource.calendar.leaves"].search_count(
            [("name", "=", fixtures.HOLIDAY_NAME)]
        ),
        "all attendances": env["hr.attendance"].search_count([]),
        "all employees": env["hr.employee"].with_context(active_test=False).search_count([]),
        "all schedules": env["resource.calendar"].with_context(active_test=False).search_count([]),
    }


def print_counts(label: str, values: dict) -> None:
    print(f"{label}: " + ", ".join(f"{k}={v}" for k, v in values.items()))


# Acceptance.md "Setup": attendances (UTC) and contract (start, end) of the named demo employees.
EXPECTED = {
    "Abigail Peterson": (
        [("2026-11-11 06:00:00", "2026-11-11 09:30:00")],
        ("2026-10-01", "2027-01-11"),
    ),
    "Anita Oliver": (
        [
            ("2026-11-10 03:00:00", "2026-11-11 03:00:00"),
            ("2026-11-11 03:00:10", "2026-11-11 08:00:00"),
        ],
        ("2026-01-01", None),
    ),
    "Jennie Fletcher": (
        [("2026-11-10 19:00:00", "2026-11-11 07:00:00")],
        ("2024-11-01", "2026-12-01"),
    ),
    "Keith Byrd": ([], ("2015-01-01", "2026-11-11")),
    "Marc Demo": ([(f"2026-10-{d:02d}", None) for d in range(1, 11)], ("2025-01-01", None)),
    "Mitchell Admin": ([("2026-10-10", None)] * 2, ("2020-01-01", None)),
    "Beth Evans": ([], None),
    "Doris Cole": ([], None),
    "Eli Lambert": ([], None),
    "Ernest Reed": ([], None),
    "Rachel Perry": ([], None),
}
ENDED_BEFORE_2026 = ("Audrey Peterson", "Tina Williamson")


def _contracts(employee) -> list:
    spans = {
        (v.contract_date_start, v.contract_date_end)
        for v in employee.version_ids
        if v.contract_date_start
    }
    return sorted(spans, key=lambda s: (str(s[0]), str(s[1])))


def check_demo(env) -> int:
    """Print every employee's attendances and contracts, then every difference from the table."""
    employees = env["hr.employee"].with_context(active_test=False).search([], order="name")
    archived = employees.filtered(lambda e: not e.active)
    print(f"employees: {len(employees)}, archived: {len(archived)}")
    differences: list[str] = []
    demo = employees.filtered(lambda e: not e.name.startswith(_fixtures().PREFIX))
    if len(demo) != 22:
        differences.append(f"demo employee count {len(demo)} != 22")
    if archived:
        differences.append("archived: " + ", ".join(archived.mapped("name")))
    for employee in employees:
        attendances = env["hr.attendance"].search(
            [("employee_id", "=", employee.id)], order="check_in"
        )
        shown = [
            (
                a.check_in.strftime("%Y-%m-%d %H:%M:%S"),
                a.check_out.strftime("%Y-%m-%d %H:%M:%S") if a.check_out else None,
            )
            for a in attendances
        ]
        contracts = [
            (str(s) if s else None, str(e) if e else None) for s, e in _contracts(employee)
        ]
        schedule = employee.resource_calendar_id
        tracked = employee.version_id.attendance_based
        calendar = (
            f"{schedule.name} ({schedule.calendar_type}, {schedule.hours_per_week}h/w, "
            f"tracked {tracked})"
        )
        print(
            f"{employee.name} | {calendar} | tz {employee.tz} | "
            f"contracts {contracts} | attendances {shown}"
        )
        name = employee.name
        if name.startswith(_fixtures().PREFIX):
            continue  # prepared records (shown above), not part of the demo table
        if name in EXPECTED:
            want_att, want_con = EXPECTED[name]
            if name == "Marc Demo":
                days = [s[0][:10] for s in shown]
                ok = days == [w[0] for w in want_att]
            elif name == "Mitchell Admin":
                ok = len(shown) == 2 and all(s[0][:10] == "2026-10-10" for s in shown)
            else:
                ok = shown == want_att
            if not ok:
                differences.append(f"{name}: attendances {shown} != {want_att}")
            if want_con is None:
                if contracts:
                    differences.append(f"{name}: contracts {contracts}, expected none")
            elif want_con not in contracts:
                differences.append(f"{name}: contracts {contracts}, expected {want_con}")
        elif name in ENDED_BEFORE_2026:
            if shown or not contracts or any((e or "9") >= "2026" for _s, e in contracts):
                differences.append(
                    f"{name}: expected no attendance and a contract ended before 2026"
                )
        else:
            covering = any(
                s <= "2026-11-11" and (e is None or e >= "2026-11-30") for s, e in contracts
            )
            if shown or not covering:
                differences.append(
                    f"{name}: expected no attendance and a contract covering November 2026"
                )
    for line in differences:
        print("DIFF " + line)
    print(f"differences: {len(differences)}")
    return 1 if differences else 0


def main(argv: list[str] | None = None) -> int:
    ns = parse_args(list(sys.argv[1:] if argv is None else argv))
    if ns.command == "run":
        run_odoo(ns.at, ns.odoo_args)
        return 0
    cr, env = _env(ns.database)
    try:
        status = 0
        if ns.command == "check-demo":
            status = check_demo(env)
        else:
            print_counts("before", counts(env))
            fixtures = _fixtures()
            if ns.command == "prepare":
                fixtures.make_prepared(env, night=ns.night, holiday=ns.holiday)
            else:
                fixtures.remove_prepared(env)
            cr.commit()
            print_counts("after", counts(env))
        return status
    finally:
        cr.close()


if __name__ == "__main__":
    sys.exit(main())
