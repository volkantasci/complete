# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Records of slice 002d2's acceptance scenarios, as plain functions of ``env``.

``make_prepared`` and ``remove_prepared`` build and delete the "prepared records"
of acceptance.md; the launcher ``tools/odoo_at_instant.py`` calls them on a demo
database too. They need the schedule "40 hours/week": the demo data have it, a
test without demo data passes one made by ``make_whole_day_schedule``.
"""

from datetime import datetime

PREFIX = "Gantt "
HOLIDAY_NAME = "Gantt Holiday"
NIGHT_NAME = "Gantt Night"
TZ = "Europe/Brussels"
CONTRACT_START = "2026-01-01"
DEMO_SCHEDULE = "40 hours/week"

# name -> (schedule key, tracked by attendances, [(check-in, check-out or None)], UTC)
EMPLOYEES = {
    "Gantt Hourly": ("split", False, []),
    "Gantt Flexible": ("flex", False, []),
    "Gantt Free": ("free", False, []),
    "Gantt Tracked": ("demo", True, []),
    "Gantt Over": ("demo", False, [("2026-11-09 07:00", "2026-11-09 17:00")]),
    "Gantt Double": ("demo", False, [("2026-11-09 02:00", "2026-11-09 20:00")]),
    "Gantt Exact": ("demo", False, [("2026-11-09 07:00", "2026-11-09 15:00")]),
    "Gantt Open": ("demo", False, [("2026-11-11 07:00", None)]),
    "Gantt Lunch": (
        "demo",
        False,
        [
            ("2026-11-02 08:00", "2026-11-02 12:00"),
            ("2026-11-03 11:30", "2026-11-03 16:00"),
            ("2026-11-04 10:00", "2026-11-04 14:00"),
            ("2026-11-05 09:00", "2026-11-05 14:00"),
            ("2026-11-06 10:30", "2026-11-06 11:15"),
        ],
    ),
    "Gantt Quarter": (
        "demo",
        False,
        [
            ("2026-11-02 04:00", "2026-11-02 10:00"),
            ("2026-11-03 12:00", "2026-11-03 18:00"),
            ("2026-11-04 07:00", "2026-11-04 12:00"),
        ],
    ),
}
NIGHT = (NIGHT_NAME, "demo", False, [("2026-11-30 19:00", "2026-12-01 03:00")])


def _dt(text):
    return datetime.strptime(text, "%Y-%m-%d %H:%M") if text else False


def make_whole_day_schedule(env, name=DEMO_SCHEDULE):
    """A schedule of the demo's shape: whole working days Monday to Friday, 8 hours each."""
    return env["resource.calendar"].create({"name": name, "full_time_required_hours": 40})


def find_demo_schedule(env):
    """The demo's "40 hours/week" schedule, or a clear error when the database lacks it."""
    schedule = env["resource.calendar"].search([("name", "=", DEMO_SCHEDULE)], limit=1)
    if not schedule:
        raise LookupError(
            f'The working schedule "{DEMO_SCHEDULE}" does not exist (a database without demo '
            "data has none): pass one, for instance from make_whole_day_schedule(env)."
        )
    return schedule


def _schedules(env, demo):
    lines = []
    for dow in range(4):  # Monday to Thursday, 8:00-12:00 and 13:00-17:00
        for hour_from, hour_to in ((8, 12), (13, 17)):
            lines.append(
                (0, 0, {"dayofweek": str(dow), "hour_from": hour_from, "hour_to": hour_to})
            )
    lines.append((0, 0, {"dayofweek": "4", "hour_from": 8, "hour_to": 12}))  # Friday morning
    Calendar = env["resource.calendar"]
    split = Calendar.create(
        {
            "name": "Gantt Split",
            "calendar_type": "fixed",
            "attendance_ids": [(5, 0, 0)] + lines,
        }
    )
    flex = Calendar.create(
        {
            "name": "Gantt Flex",
            "calendar_type": "undefined",
            "hours_per_week": 40,
            "hours_per_day": 8,
        }
    )
    free = Calendar.create(
        {
            "name": "Gantt Free",
            "calendar_type": "undefined",
            "hours_per_week": 0,
            "hours_per_day": 0,
        }
    )
    return {"split": split, "flex": flex, "free": free, "demo": demo}


def _employee(env, name, calendar, tracked, attendances):
    employee = env["hr.employee"].create(
        {
            "name": name,
            "tz": TZ,
            "resource_calendar_id": calendar.id,
            "contract_date_start": CONTRACT_START,
            "attendance_based": tracked,
        }
    )
    for check_in, check_out in attendances:
        env["hr.attendance"].create(
            {
                "employee_id": employee.id,
                "check_in": _dt(check_in),
                "check_out": _dt(check_out),
            }
        )
    return employee


def make_prepared(env, night=False, holiday=False, demo_schedule=None):
    """Create the prepared records (after removing any left by an earlier run).

    ``demo_schedule`` is the "40 hours/week" schedule to use; by default the demo's,
    which must exist (``LookupError`` otherwise). Returns the records by name.
    """
    demo_schedule = demo_schedule or find_demo_schedule(env)
    remove_prepared(env)
    calendars = _schedules(env, demo_schedule)
    made = {}
    for name, (key, tracked, attendances) in EMPLOYEES.items():
        made[name] = _employee(env, name, calendars[key], tracked, attendances)
    if night:
        name, key, tracked, attendances = NIGHT
        made[name] = _employee(env, name, calendars[key], tracked, attendances)
    if holiday:
        made[HOLIDAY_NAME] = env["resource.calendar.leaves"].create(
            {
                "name": HOLIDAY_NAME,
                "calendar_id": calendars["demo"].id,
                "date_from": _dt("2026-11-11 23:00"),
                "date_to": _dt("2026-11-12 23:00"),
            }
        )
    env.flush_all()
    return made


def remove_prepared(env):
    """Delete by name: attendances, employees (archived too), the holiday, then schedules."""
    like = PREFIX + "%"
    employees = env["hr.employee"].with_context(active_test=False).search([("name", "=like", like)])
    env["hr.attendance"].search([("employee_id", "in", employees.ids)]).unlink()
    employees.unlink()
    env["resource.calendar.leaves"].search([("name", "=", HOLIDAY_NAME)]).unlink()
    env["resource.calendar"].with_context(active_test=False).search(
        [("name", "=like", like)]
    ).unlink()
    env.flush_all()
