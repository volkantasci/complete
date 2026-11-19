# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Argument parsing of the launcher that starts Odoo at a fixed instant."""

from datetime import datetime

import pytest

from tools.odoo_at_instant import db_args, parse_args, parse_instant


def test_at_is_required():
    with pytest.raises(SystemExit):
        parse_args(["--", "-d", "x"])


def test_instant_parses_iso_as_utc():
    assert parse_instant("2026-11-11T10:00:00") == datetime(2026, 11, 11, 10, 0)
    assert parse_instant("2026-11-11T10:00:00Z") == datetime(2026, 11, 11, 10, 0)
    assert parse_instant("2026-11-11T11:00:00+01:00") == datetime(2026, 11, 11, 10, 0)


def test_odoo_args_follow_the_separator():
    ns = parse_args(["--at", "2026-11-11T10:00:00", "--", "-d", "demo", "-i", "a,b", "--with-demo"])
    assert ns.command == "run"
    assert ns.at == datetime(2026, 11, 11, 10, 0)
    assert ns.odoo_args == ["-d", "demo", "-i", "a,b", "--with-demo"]


def test_subcommands_take_a_database_and_flags():
    ns = parse_args(["prepare", "-d", "db", "--night", "--holiday"])
    assert (ns.command, ns.database, ns.night, ns.holiday) == ("prepare", "db", True, True)
    assert ns.differences is False
    ns = parse_args(["prepare", "-d", "db", "--differences"])
    assert (ns.night, ns.holiday, ns.differences) == (False, False, True)
    ns = parse_args(["unprepare", "-d", "db"])
    assert (ns.command, ns.database) == ("unprepare", "db")
    assert parse_args(["check-demo", "-d", "db"]).command == "check-demo"
    with pytest.raises(SystemExit):
        parse_args(["prepare"])


def test_db_args_come_from_the_environment_unless_given():
    env = {"HOST": "h", "USER": "u", "PASSWORD": "p"}
    assert db_args([], env) == [
        "--db_host",
        "h",
        "--db_port",
        "5432",
        "--db_user",
        "u",
        "--db_password",
        "p",
    ]
    assert "--db_host" not in db_args(["--db_host", "x"], env)
    assert "--db_user" not in db_args([], env, "db_user = odoo\n")
