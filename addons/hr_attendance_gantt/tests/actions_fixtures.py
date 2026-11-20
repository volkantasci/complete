# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Records of slice 002d3's acceptance scenarios, as plain functions of ``env``.

``make_role_users`` builds the five role users of acceptance.md "Users" and their employees;
the tasks of the slice that test roles, filters by role or the warning link reuse it.
``make_gantt_moved`` builds the prepared employee "Gantt Moved" (A54 to A56).
``make_gantt_cards`` builds the prepared employee "Gantt Cards" of twelve overview cards (A95).
``make_team_officer`` builds a created team officer of four employees (A62's stand-in for the
demo's Marc Demo) and ``make_page_employees`` the twenty employees of a full page of the
management view (A60, A61). ``drop_actions_records`` removes everything these made, by name.
``action_in_november`` fixes the clock of the employee's monthly action (R4).
``demo_time_rule_state`` builds the time rule state of the demo database as created (R12, A33),
``rule_counts_work`` sets the time rule to count the company's Work type too (A87) and
``server_day`` moves the "today" of the time rule pipeline.
"""

from contextlib import contextmanager
from datetime import date, datetime
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
CARDS_NAME = "Gantt Cards"
# A95: the days (1 to 9 and 12 to 14 November 2026) and the work entry types of the twelve cards
CARD_DAYS = (1, 2, 3, 4, 5, 6, 7, 8, 9, 12, 13, 14)
CARD_TYPES = (
    "Overtime hours non recoverable - 150%",
    "Out Of Contract",
    "Overtime (1.5x)",
    "Double Time (2x)",
    "Jury Duty",
    "Bereavement",
    "FMLA Leave",
    "Parental Leaves",
    "Training Time Off",
    "Generic Time Off",
    "Compensatory Time Off",
    "Extra Hours",
)
OFFICER_NAME = "Gantt Officer"
MANAGED_NAMES = [f"Gantt Managed {number}" for number in range(1, 5)]
PAGE_PREFIX = "Gantt Page "
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


def demo_time_rule_state(env):
    """The state of the demo database as created (R12, A33), for a database without demo data:
    the Community's one time rule (the employee schedule rule, as its data create it) counts
    the generic attendance type, and the attendances are of another work entry type, the one
    the company's country gives its "Work", so the rule counts none of them and nothing is split.
    Call it before the attendances are created (they take the company's type). Returns the
    function that puts the company back."""
    rule = env.ref("hr_work_entry.hr_time_rule_employee_schedule")
    company = env.company
    previous = company.attendance_work_entry_type_id
    if previous in rule.condition_work_entry_type_ids:
        # a "Work" type of its own that no country owns, drawn like the generic one ("A")
        company.attendance_work_entry_type_id = env["hr.work.entry.type"].create(
            {
                "name": "Work",
                "display_code": "A",
                "code": "HRA.WORK",
                "count_as": "working_time",
                "color": 0,
            }
        )
    assert company.attendance_work_entry_type_id not in rule.condition_work_entry_type_ids
    env.flush_all()

    def put_back():
        company.attendance_work_entry_type_id = previous
        env.flush_all()

    return put_back


def rule_counts_work(env):
    """A87: the time rule counts the company's own "Work" type too. Returns the function that
    puts the rule's conditions back."""
    rule = env.ref("hr_work_entry.hr_time_rule_employee_schedule")
    previous = rule.condition_work_entry_type_ids
    rule.condition_work_entry_type_ids = previous | env.company.attendance_work_entry_type_id
    env.flush_all()

    def put_back():
        rule.condition_work_entry_type_ids = previous
        env.flush_all()

    return put_back


@contextmanager
def server_day(day):
    """The time rule pipeline reads "today" from the server's date (``date.today()`` of its
    mixin): while this is open it reads ``day``, whatever the server's clock reads. Nothing else
    moves (the tour's timers keep running)."""
    from odoo.addons.hr_work_entry.models import hr_time_rule_source_mixin as mixin

    class FixedDate(date):
        @classmethod
        def today(cls):
            return day

    with patch.object(mixin, "date", FixedDate):
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


def make_gantt_cards(env, schedule=None, name=CARDS_NAME):
    """The prepared "Gantt Cards" (A95): twelve attendances of two hours (08:00 to 10:00 UTC), one
    on each of 1 to 9 and 12 to 14 November 2026, each of another work entry type (created here).

    Schedule "40 hours/week", contract from 1 January 2026, time zone Europe/Brussels.
    Returns the employee. The types and the employee are removed by the rollback of the test.
    """
    schedule = schedule or _schedule(env)
    employee = env["hr.employee"].create(
        {
            "name": name,
            "tz": TZ,
            "resource_calendar_id": schedule.id,
            "contract_date_start": CONTRACT_START,
            "date_version": CONTRACT_START,
        }
    )
    for day, type_name in zip(CARD_DAYS, CARD_TYPES, strict=True):
        kind = env["hr.work.entry.type"].create(
            {"name": type_name, "code": f"HRA.{type_name}", "count_as": "working_time"}
        )
        env["hr.attendance"].with_context(skip_time_rules=True).create(
            {
                "employee_id": employee.id,
                "work_entry_type_id": kind.id,
                "check_in": datetime(2026, 11, day, 8, 0),
                "check_out": datetime(2026, 11, day, 10, 0),
            }
        )
    env.flush_all()
    return employee


def make_team_officer(env, schedule=None):
    """A team officer who manages four employees, standing in for the demo's Marc Demo (A62).

    The user "Gantt Officer" (login and password ``gantt_officer``) holds the internal user and
    "Officer: Manage attendances" groups and has an employee of the same name; the four employees
    "Gantt Managed 1" to "4" have him as attendance manager. Each of the first three has an
    attendance on 11 November 2026 (07:00 to 09:00 UTC), the fourth none; the officer's own
    employee has one too. Returns the user. Removed by ``drop_actions_records``.
    """
    schedule = schedule or _schedule(env)
    groups = env.ref("base.group_user") | env.ref("hr_attendance.group_hr_attendance_officer")
    user = (
        env["res.users"]
        .with_context(no_reset_password=True)
        .create(
            {
                "name": OFFICER_NAME,
                "login": "gantt_officer",
                "password": "gantt_officer",
                "tz": TZ,
                "lang": "en_US",
                "email": "gantt_officer@example.com",
                "group_ids": [(6, 0, groups.ids)],
            }
        )
    )
    _employee(env, OFFICER_NAME, schedule, user=user)
    for index, name in enumerate(MANAGED_NAMES):
        employee = _employee(env, name, schedule, manager=user)
        if index == 3:
            env["hr.attendance"].search([("employee_id", "=", employee.id)]).unlink()
    env.flush_all()
    return user


def make_page_employees(env, schedule=None):
    """Twenty employees "Gantt Page 01" to "Gantt Page 20" that fill a page of the management
    view before the role users' employees (names sort so): the first four have an attendance on
    11 November 2026 (07:00 to 09:00 UTC), the fifth has no contract. Returns them in order."""
    schedule = schedule or _schedule(env)
    employees = []
    for number in range(1, 21):
        name = f"{PAGE_PREFIX}{number:02d}"
        if number <= 4:
            employee = _employee(env, name, schedule)
        else:
            employee = env["hr.employee"].create(
                {
                    "name": name,
                    "tz": TZ,
                    "resource_calendar_id": schedule.id,
                    "contract_date_start": False if number == 5 else CONTRACT_START,
                    "date_version": CONTRACT_START,
                }
            )
        employees.append(employee)
    env.flush_all()
    return employees


def drop_actions_records(env):
    """Remove, by name, the role users, their employees (the peer, "Gantt Moved") and their
    attendances; archived ones too. The schedules are left (they may be the demo's)."""
    names = [name for name, _groups in ROLES.values()] + [
        PEER_NAME,
        MOVED_NAME,
        OFFICER_NAME,
        *MANAGED_NAMES,
    ]
    employees = env["hr.employee"].with_context(active_test=False).search(
        ["|", ("name", "in", names), ("name", "=like", PAGE_PREFIX + "%")]
    )
    env["hr.attendance"].search([("employee_id", "in", employees.ids)]).unlink()
    employees.unlink()
    env["res.users"].with_context(active_test=False).search(
        [("login", "=like", LOGIN_PREFIX + "%")]
    ).unlink()
    env.flush_all()
