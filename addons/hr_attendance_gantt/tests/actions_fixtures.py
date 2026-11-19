# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Records of slice 002d3's acceptance scenarios, as plain functions of ``env``.

``make_role_users`` builds the five role users of acceptance.md "Users" and their employees;
the tasks of the slice that test roles, filters by role or the warning link reuse it.
``make_gantt_moved`` builds the prepared employee "Gantt Moved" (A54 to A56).
``drop_actions_records`` removes everything these two made, by name.
``action_in_november`` fixes the clock of the employee's monthly action (R4).
"""

from contextlib import contextmanager
from datetime import datetime
from unittest.mock import patch

from freezegun import freeze_time

from .hr_rows_fixtures import (
    CONTRACT_START,
    DEMO_SCHEDULE,
    TZ,
    make_whole_day_schedule,
)

PEER_NAME = "Gantt Role Peer"
MOVED_NAME = "Gantt Moved"
LOGIN_PREFIX = "gantt_"

# login -> (name, groups xmlids; the internal user group is always set, and nothing else is)
ROLES = {
    "gantt_none": ("Gantt Role None", []),
    "gantt_self": ("Gantt Role Self", ["hr_attendance.group_hr_attendance_own"]),
    "gantt_team": ("Gantt Role Team", ["hr_attendance.group_hr_attendance_officer"]),
    "gantt_all": ("Gantt Role All", ["hr_attendance.group_hr_attendance_user"]),
    "gantt_allhr": (
        "Gantt Role Allhr",
        ["hr_attendance.group_hr_attendance_user", "hr.group_hr_user"],
    ),
}
ATTENDANCE = (datetime(2026, 11, 11, 7, 0), datetime(2026, 11, 11, 9, 0))


@contextmanager
def action_in_november():
    """The server's own today is the month of the employee's monthly action (its domain reads
    the server's clock), and the scenarios of the monthly view draw November 2026: while this is
    open, the action is made as if the server's clock read Wednesday 11 November 2026, 10:00 UTC,
    whatever it reads. Only the Python method that returns the action runs on that clock."""
    from odoo.addons.hr_attendance_gantt.models.hr_employee import HrEmployee

    original = HrEmployee.action_open_last_month_attendances

    def in_november(self):
        with freeze_time("2026-11-11 10:00:00"):
            return original(self)

    with patch.object(HrEmployee, "action_open_last_month_attendances", in_november):
        yield


def _schedule(env):
    """The "40 hours/week" schedule: the demo's when it exists, else one of the demo's shape."""
    found = env["resource.calendar"].search([("name", "=", DEMO_SCHEDULE)], limit=1)
    return found or make_whole_day_schedule(env)


def _employee(env, name, schedule, user=None, manager=None):
    values = {
        "name": name,
        "tz": TZ,
        "resource_calendar_id": schedule.id,
        "contract_date_start": CONTRACT_START,
        # the version is dated at the contract's start, never on the day the test runs
        "date_version": CONTRACT_START,
    }
    if user:
        values["user_id"] = user.id
    if manager:
        values["attendance_manager_id"] = manager.id
    employee = env["hr.employee"].create(values)
    env["hr.attendance"].with_context(skip_time_rules=True).create(
        {"employee_id": employee.id, "check_in": ATTENDANCE[0], "check_out": ATTENDANCE[1]}
    )
    return employee


def make_role_users(env, schedule=None):
    """Create the five role users, each with an employee of the same name, and the peer.

    Returns ``{login: user}`` for ``gantt_none``, ``gantt_self``, ``gantt_team``,
    ``gantt_all`` and ``gantt_allhr``; the password of each is its login. The employee of a
    user is ``user.employee_id``; the second employee, "Gantt Role Peer" (no user), is found by
    ``PEER_NAME`` (``env["hr.employee"].search([("name", "=", PEER_NAME)])``).

    Groups are replaced, never added to: the internal user group and the role's own groups, so
    a role never holds a group a new user gets by default. For ``gantt_team`` both employees
    get the user as attendance manager (the Community then also gives the officer group, which
    is the role's own). Each of the six employees has one attendance on 11 November 2026,
    07:00 to 09:00 UTC, the schedule "40 hours/week" (``schedule`` or the demo's, else made),
    a contract from 1 January 2026 without an end, and the time zone Europe/Brussels. Any
    earlier run's records are removed first.
    """
    drop_actions_records(env)
    schedule = schedule or _schedule(env)
    internal = env.ref("base.group_user")
    users = {}
    for login, (name, xmlids) in ROLES.items():
        groups = internal | sum((env.ref(xmlid) for xmlid in xmlids), env["res.groups"])
        users[login] = (
            env["res.users"]
            .with_context(no_reset_password=True)
            .create(
                {
                    "name": name,
                    "login": login,
                    "password": login,
                    "tz": TZ,
                    "lang": "en_US",
                    "email": f"{login}@example.com",
                    "group_ids": [(6, 0, groups.ids)],
                }
            )
        )
    team = users["gantt_team"]
    for user in users.values():
        _employee(env, user.name, schedule, user=user, manager=team if user == team else None)
    _employee(env, PEER_NAME, schedule, manager=team)
    env.flush_all()
    return users


def make_gantt_moved(env, schedule=None):
    """The prepared "Gantt Moved": one attendance open since 11 November 2026, 07:00 UTC.

    Schedule "40 hours/week", contract from 1 January 2026, time zone Europe/Brussels.
    Returns the employee. Removed by ``drop_actions_records``.
    """
    schedule = schedule or _schedule(env)
    employee = env["hr.employee"].create(
        {
            "name": MOVED_NAME,
            "tz": TZ,
            "resource_calendar_id": schedule.id,
            "contract_date_start": CONTRACT_START,
            "date_version": CONTRACT_START,
        }
    )
    env["hr.attendance"].with_context(skip_time_rules=True).create(
        {"employee_id": employee.id, "check_in": datetime(2026, 11, 11, 7, 0), "check_out": False}
    )
    env.flush_all()
    return employee


def drop_actions_records(env):
    """Remove, by name, the role users, their employees (the peer, "Gantt Moved") and their
    attendances; archived ones too. The schedules are left (they may be the demo's)."""
    names = [name for name, _groups in ROLES.values()] + [PEER_NAME, MOVED_NAME]
    employees = (
        env["hr.employee"].with_context(active_test=False).search([("name", "in", names)])
    )
    env["hr.attendance"].search([("employee_id", "in", employees.ids)]).unlink()
    employees.unlink()
    env["res.users"].with_context(active_test=False).search(
        [("login", "=like", LOGIN_PREFIX + "%")]
    ).unlink()
    env.flush_all()
