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
# A68, M85 to M87: 8:00:00 to 16:00:10 and 8:00:00 to 15:59:50 local on Monday 9 November
DIFFERENCES = {
    "Gantt Above": ("demo", False, [("2026-11-09 07:00:00", "2026-11-09 15:00:10")]),
    "Gantt Under": ("demo", False, [("2026-11-09 07:00:00", "2026-11-09 14:59:50")]),
}


def _dt(text):
    if not text:
        return False
    pattern = "%Y-%m-%d %H:%M:%S" if text.count(":") == 2 else "%Y-%m-%d %H:%M"
    return datetime.strptime(text, pattern)


def make_whole_day_schedule(env, name=DEMO_SCHEDULE):
    """A schedule of the demo's shape: whole working days Monday to Friday, 8 hours each."""
    return env["resource.calendar"].create({"name": name, "full_time_required_hours": 40})


def move_others_away(env, keep_prefix=None):
    """Keep every employee that a test did not create, with its attendances, out of the views.

    The employees that exist now (the demo's, when loaded; all but those named ``keep_prefix...``)
    move to a company that is not one of the test users' companies, so the multi-company rules
    hide them from the rows and from the attendance search. They stay active (the Archived
    Employees filter must show none) and are not deleted (demo users link to them).
    """
    domain = [("name", "not like", keep_prefix + "%")] if keep_prefix else []
    others = env["hr.employee"].with_context(active_test=False).search(domain)
    if not others:
        return
    away = env["res.company"].search([("name", "=", "HRA Elsewhere")], limit=1)
    away = away or env["res.company"].create({"name": "HRA Elsewhere"})
    others.write({"company_id": away.id})
    env.flush_all()


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


def _employee(env, name, schedule, tracked, attendances):
    employee = env["hr.employee"].create(
        {
            "name": name,
            "tz": TZ,
            "resource_calendar_id": schedule.id,
            "contract_date_start": CONTRACT_START,
            # the version is dated at the contract's start, never on the day the test runs
            "date_version": CONTRACT_START,
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


def make_prepared(env, night=False, holiday=False, demo_schedule=None, differences=False):
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
    if differences:
        for name, (key, tracked, attendances) in DIFFERENCES.items():
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


# What the demo database holds (acceptance.md, "Setup"), in shape, under names that cannot
# clash with the demo employees: name -> (attendances (UTC), contract (start, end) or None).
DEMO_LIKE_PREFIX = "HRA "
DEMO_LIKE = {
    # 11 Nov 06:00 to 09:30; a contract that goes on past the day
    "HRA Abigail": ([("2026-11-11 06:00:00", "2026-11-11 09:30:00")], ("2026-10-01", "2027-01-11")),
    # a 24-hour attendance that crosses the day, then one just after it
    "HRA Anita": (
        [
            ("2026-11-10 03:00:00", "2026-11-11 03:00:00"),
            ("2026-11-11 03:00:10", "2026-11-11 08:00:00"),
        ],
        ("2026-01-01", None),
    ),
    # a night shift
    "HRA Jennie": ([("2026-11-10 19:00:00", "2026-11-11 07:00:00")], ("2024-11-01", "2026-12-01")),
    # a contract that ends on 11 Nov 2026
    "HRA Keith": ([], ("2015-01-01", "2026-11-11")),
    # a contract that ended before 2026
    "HRA Audrey": ([], ("2020-01-01", "2025-12-31")),
    # no contract at all
    "HRA Beth": ([], None),
}


def _datetime(text):
    return datetime.strptime(text, "%Y-%m-%d %H:%M:%S") if text else False


def make_demo_like(env, schedule=None):
    """Employees, contracts and attendances shaped like the demo table of acceptance.md.

    Every name begins with "HRA ", so the records never clash with demo employees, and
    nothing here relies on demo data. ``schedule`` is the working schedule of every
    employee (a schedule of ``make_whole_day_schedule`` by default). Returns the
    employees by name.
    """
    schedule = schedule or make_whole_day_schedule(env, DEMO_LIKE_PREFIX + "Std")
    made = {}
    for name, (attendances, contract) in DEMO_LIKE.items():
        values = {"name": name, "tz": TZ, "resource_calendar_id": schedule.id}
        values["date_version"] = CONTRACT_START
        if contract:
            values["contract_date_start"], values["contract_date_end"] = contract
            values["date_version"] = contract[0]
        employee = env["hr.employee"].create(values)
        for check_in, check_out in attendances:
            # skip_time_rules keeps the Community's time rules from adding overtime attendances;
            # it also skips the overlap constraint, and create() still runs its tolerance step
            env["hr.attendance"].with_context(skip_time_rules=True).create(
                {
                    "employee_id": employee.id,
                    "check_in": _datetime(check_in),
                    "check_out": _datetime(check_out),
                }
            )
        made[name] = employee
    env.flush_all()
    return made


def _text(moment):
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def R13_domain(start_utc, stop_utc, now_utc):  # noqa: N802 (named after the rule)
    """The domain of R13 for a period (naive UTC datetimes), as the browser builds it.

    Shape shared with the attendance view's JavaScript (its test checks the same list):
    point 1, closed attendances overlapping the period or lying at its start; point 2,
    open attendances that began before the period's end and before now, only when now is
    at or after the period's start.
    """
    start, stop, now = _text(start_utc), _text(stop_utc), _text(now_utc)
    closed = [
        "&", "&", ("check_out", "!=", False), ("check_in", "<", stop),
        "|", ("check_out", ">", start), ("check_in", ">=", start),
    ]
    if now_utc < start_utc:
        return closed
    opened = ["&", "&", ("check_out", "=", False), ("check_in", "<", stop), ("check_in", "<", now)]
    return ["|", *closed, *opened]


SPEC = {
    "employee_id": {"fields": {"display_name": {}}},
    "check_in": {},
    "check_out": {},
}
NAMES = [
    "|",
    ("employee_id.name", "=like", DEMO_LIKE_PREFIX + "%"),
    ("employee_id.name", "=like", PREFIX + "%"),
]


def utc(text):
    """A naive UTC datetime from ``YYYY-MM-DD HH:MM``."""
    return datetime.strptime(text, "%Y-%m-%d %H:%M")


class HrRowsCase:
    """Mixin for test cases: the demo-like and prepared records, and a way to call the view."""

    @classmethod
    def make_world(cls):
        cls.schedule = make_whole_day_schedule(cls.env, DEMO_LIKE_PREFIX + "40 hours/week")
        cls.like = make_demo_like(cls.env, cls.schedule)
        cls.prepared = make_prepared(cls.env, night=True, demo_schedule=cls.schedule)
        cls.Attendance = cls.env["hr.attendance"]

    def get_data(self, start, stop, now, extra=None, user_domain=None, groupby=("employee_id",),
                 model=None, **kwargs):
        """Call the view's data as the browser does: R13 period, the user's search in the context.

        ``extra`` is added to the domain (the user's search is added by itself).
        """
        user_domain = NAMES if user_domain is None else user_domain
        model = (self.Attendance if model is None else model).with_context(user_domain=user_domain)
        if not model.env.context.get("tz"):
            model = model.with_context(tz=TZ)
        domain = R13_domain(utc(start), utc(stop), utc(now)) + list(user_domain) + list(extra or [])
        kwargs.setdefault("limit", 20)
        kwargs.setdefault("start_date", start + ":00")
        kwargs.setdefault("stop_date", stop + ":00")
        kwargs.setdefault("scale", "day")
        return model.get_gantt_data(domain, list(groupby), SPEC, **kwargs)

    @staticmethod
    def row_names(result):
        return [group["employee_id"][1] for group in result["groups"]]

    def shown(self, result):
        """Employee name -> set of check-in texts, of the records returned."""
        found = {}
        for record in result["records"]:
            attendance = self.env["hr.attendance"].browse(record["id"])
            found.setdefault(attendance.employee_id.name, set()).add(
                _text(attendance.check_in)[:16])
        return found
