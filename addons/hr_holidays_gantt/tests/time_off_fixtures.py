# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Records of slice 002e's acceptance scenarios, as plain functions of ``env``.

Everything works with and without the Community demo data: leave types, schedules and
employees are found by name and created when absent. The prepared records are named
"Toff ..." and ``drop_time_off_records`` removes them (and the role users) by name.

The requests are created and approved as the administrator (``base.user_admin``), who holds
the Time Off administrator group here (made so when the database lacks it).
"""

from datetime import date, datetime, timedelta
from unittest import mock

from odoo import fields

TZ = "Europe/Brussels"
PREFIX = "Toff "
CONTRACT_START = "2026-01-01"
ALLOCATION_YEAR = 2026
DEMO_SCHEDULE = "40 hours/week"
SCHEDULE_NAME = "Toff 40 hours/week"
PEER_NAME = "Toff Peer"
HOURS_TYPE = "Toff Hours"
DAYS_TYPE = "Toff Days"
ACT_NAME = "Toff Act"
AWAY_NAME = "Toff Away"
SICK_NAME = "Guaranteed monthly wage illness"
UNPAID_NAME = "Leave without pay"

# login -> (name, Time Off group xml id or None)
ROLES = {
    "toff_none": ("Toff Role None", None),
    "toff_emp": ("Toff Role Emp", "hr_holidays.group_hr_holidays_employee"),
    "toff_approver": ("Toff Role Approver", "hr_holidays.group_hr_holidays_employee"),
    "toff_manager": ("Toff Role Manager", "hr_holidays.group_hr_holidays_employee"),
    "toff_officer": ("Toff Role Officer", "hr_holidays.group_hr_holidays_user"),
    "toff_admin": ("Toff Role Admin", "hr_holidays.group_hr_holidays_manager"),
}

# the roles that hold the Community's export group "Export / Allowed" (R19; A90 takes it away)
EXPORTERS = ("toff_officer", "toff_admin")

# generic leave types the demo leaves carry: key -> (name, code, display code, colour, extra)
_GENERIC = {
    "PTO": ("Legal leave employee", "016.00", "PTO", 11),
    "CTO": ("Compensatory Time Off", "LEAVE105", "CTO", 4),
    "STO": (SICK_NAME, "013.00", "STO", 3),
    "UN": (UNPAID_NAME, "158.00", "UN", 5),
}

# the demo leaves of acceptance.md: employee -> [(type key, first day, last day)], November 2026
DEMO_LEAVES = {
    "Anita Oliver": [
        ("PTO", date(2026, 11, 2), date(2026, 11, 5)),
        ("PTO", date(2026, 11, 18), date(2026, 11, 18)),
        ("PTO", date(2026, 11, 23), date(2026, 11, 30)),
    ],
    "Mitchell Admin": [
        ("CTO", date(2026, 11, 2), date(2026, 11, 4)),
        ("STO", date(2026, 11, 16), date(2026, 11, 18)),
    ],
    "Marc Demo": [
        ("STO", date(2026, 11, 3), date(2026, 11, 3)),
        ("STO", date(2026, 11, 4), date(2026, 11, 5)),
    ],
    "Ronnie Hart": [
        ("STO", date(2026, 11, 6), date(2026, 11, 6)),
        ("PTO", date(2026, 11, 18), date(2026, 11, 20)),
    ],
    "Sharlene Rhodes": [
        ("PTO", date(2026, 10, 26), date(2026, 10, 31)),
        ("STO", date(2026, 11, 2), date(2026, 11, 2)),
    ],
    "Paul Williams": [
        ("STO", date(2026, 11, 23), date(2026, 11, 23)),
        ("STO", date(2026, 11, 25), date(2026, 11, 25)),
    ],
}


# the 22 employees of the Community demo data (Mitchell Admin is the administrator's own)
DEMO_EMPLOYEES = (
    "Abigail Peterson", "Anita Oliver", "Audrey Peterson", "Barty McBly", "Beth Evans",
    "Doris Cole", "Eli Lambert", "Ernest Reed", "Jeffrey Kelly", "Jennie Fletcher",
    "Keith Byrd", "Marc Demo", "Mitchell Admin", "Monica Light", "Paul Williams",
    "Rachel Perry", "Randall Lewis", "Ronnie Hart", "Sharlene Rhodes", "Tina Williamson",
    "Toni Jimenez", "Walter Horton",
)


# Keith Byrd's contract ends before the day of the scenarios; these have none over November
KEITH_CONTRACT_END = "2026-11-11"
NO_CONTRACT = (
    "Audrey Peterson", "Beth Evans", "Doris Cole", "Eli Lambert", "Ernest Reed",
    "Rachel Perry", "Tina Williamson",
)


def find_admin(env):
    """The administrator (Mitchell Admin, login admin), a Time Off administrator."""
    admin = env.ref("base.user_admin")
    group = env.ref("hr_holidays.group_hr_holidays_manager")
    if group not in admin.group_ids:
        admin.sudo().write({"group_ids": [(4, group.id)]})
    return admin


def find_schedule(env):
    """The "40 hours/week" schedule: the demo's when it exists, else one made here."""
    found = env["resource.calendar"].search([("name", "=", DEMO_SCHEDULE)], limit=1)
    found = found or env["resource.calendar"].search([("name", "=", SCHEDULE_NAME)], limit=1)
    return found or env["resource.calendar"].create(
        {"name": SCHEDULE_NAME, "full_time_required_hours": 40})


def find_type(env, key):
    """A generic leave type (no country) of the demo leaves, found by its code, else made.

    The Community's data carry the four of them with the display code and colour of the
    spec; a database without them gets types made with the same properties.
    """
    name, code, display_code, color = _GENERIC[key]
    types = env["hr.work.entry.type"].with_context(active_test=False)
    found = types.search([("code", "=", code), ("country_id", "=", False)], limit=1)
    if found:
        return found
    values = {
        "name": name, "code": code, "display_code": display_code, "color": color,
        "count_as": "absence", "country_id": False, "request_unit": "day",
        "unit_of_measure": "day", "requires_allocation": key in ("PTO", "CTO"),
        "leave_validation_type": "both" if key in ("PTO", "UN") else "hr",
    }
    return env["hr.work.entry.type"].create(values)


def make_hours_type(env):
    """"Toff Hours": hours, no allocation, validated by the officer, code "TH", colour 7."""
    found = env["hr.work.entry.type"].search([("name", "=", HOURS_TYPE)], limit=1)
    return found or env["hr.work.entry.type"].create({
        "name": HOURS_TYPE, "code": "TOFF.H", "display_code": "TH", "color": 7,
        "count_as": "absence", "country_id": False, "request_unit": "hour",
        "unit_of_measure": "hour", "requires_allocation": False,
        "leave_validation_type": "hr",
    })


def make_days_type(env):
    """"Toff Days": day unit, unit of measure day, no allocation, validated by the officer,
    no code, colour 2."""
    found = env["hr.work.entry.type"].search([("name", "=", DAYS_TYPE)], limit=1)
    return found or env["hr.work.entry.type"].create({
        "name": DAYS_TYPE, "code": "TOFF.D", "display_code": False, "color": 2,
        "count_as": "absence", "country_id": False, "request_unit": "day",
        "unit_of_measure": "day", "requires_allocation": False,
        "leave_validation_type": "hr",
    })


def _employee(env, name, schedule, tz=TZ, user=None, **extra):
    values = {
        "name": name,
        "tz": tz,
        "resource_calendar_id": schedule.id,
        "contract_date_start": CONTRACT_START,
        # the version is dated at the contract's start, never on the day the test runs
        "date_version": CONTRACT_START,
    }
    if user:
        values["user_id"] = user.id
    values.update(extra)
    return env["hr.employee"].create(values)


def make_leave(
    env, employee, leave_type, first, last=None, *, duration="full", hours=None,
    approve=True, state=None, periods=None,
):
    """A request of ``employee`` from ``first`` to ``last`` (dates), made by the administrator.

    ``duration`` is ``full``, ``am`` or ``pm`` (a half day: both periods) or ``specific`` with
    ``hours=(from, to)`` as clock hours. A request of a type validated twice is approved
    twice; ``approve=False`` leaves it To Approve. ``periods=(from, to)`` names the halves of
    the first and last day of a request of several days. Returns the request.
    """
    admin = find_admin(env)
    values = {
        "employee_id": employee.id,
        "work_entry_type_id": leave_type.id,
        "request_date_from": first,
        "request_date_to": last or first,
        "request_duration": duration,
    }
    if duration in ("am", "pm"):
        values["request_date_from_period"] = duration
        values["request_date_to_period"] = duration
    if periods:
        values["request_date_from_period"], values["request_date_to_period"] = periods
    if duration == "specific":
        values["request_hour_from"], values["request_hour_to"] = hours
    leave = env["hr.leave"].with_user(admin).create(values)
    if approve:
        approve_leave(env, leave)
    return leave


def _approve_unchecked(leave):
    """One approval step, without the check of the state the request is in."""
    options = {"check_state": False}
    leave.action_approve(**options)


def approve_leave(env, leave, once=False):
    """Approve ``leave`` as the administrator until it is Approved (or once)."""
    leave = leave.with_user(find_admin(env))
    if once:
        # the first approval of a type validated twice, whoever the approver is
        _approve_unchecked(leave)
        return leave
    for _step in range(2):
        if leave.state in ("validate", "refuse", "cancel"):
            break
        leave.action_approve()
    return leave


def drop_leaves(env):
    """Delete every request and allocation of the employees named "Toff ..." (as the
    administrator); returns those employees (archived too)."""
    admin = find_admin(env)
    employees = env["hr.employee"].with_context(active_test=False).search(
        [("name", "=like", PREFIX + "%")])
    env["hr.leave"].with_context(active_test=False).with_user(admin).search(
        [("employee_id", "in", employees.ids)]).unlink()
    env["hr.leave.allocation"].with_context(
        active_test=False, allocation_skip_state_check=True).with_user(admin).search(
        [("employee_id", "in", employees.ids)]).unlink()
    return employees


def drop_time_off_records(env):
    """Delete the prepared records by name (acceptance.md, "Prepared records").

    Every request and allocation of an employee named "Toff ...", those employees (archived
    too), the users whose login begins with "toff_", the schedules and leave types named
    "Toff ...".
    """
    employees = drop_leaves(env)
    users = env["res.users"].with_context(active_test=False).search(
        [("login", "=like", "toff\\_%")])
    employees.unlink()
    users.unlink()
    env["resource.calendar"].with_context(active_test=False).search(
        [("name", "=like", PREFIX + "%")]).unlink()
    env["hr.work.entry.type"].with_context(active_test=False).search(
        [("name", "=like", PREFIX + "%")]).unlink()
    env.flush_all()


def make_role_users(env, schedule=None):
    """The six role users with their employees, and "Toff Peer"; ``{login: user}``.

    Groups are replaced: the internal user group and the role's one Time Off group, so a role
    never holds a group a new user gets by default; toff_officer and toff_admin also hold the
    Community's export group (``EXPORTERS``), which no Time Off group implies. Each user has
    the time zone Europe/Brussels and an employee of the same name (schedule "40 hours/week",
    contract from 1 January 2026); "Toff Peer" has the same values and no user. toff_approver
    is named time off approver of Toff Peer (the Community adds "Time Off Responsible"),
    toff_manager its manager, with the approver left to toff_approver, so toff_manager does not
    hold that group. The password of a user is its login. Earlier records are removed first.
    """
    drop_time_off_records(env)
    schedule = schedule or find_schedule(env)
    internal = env.ref("base.group_user")
    users = {}
    for login, (name, xmlid) in ROLES.items():
        groups = internal | (env.ref(xmlid) if xmlid else env["res.groups"])
        if login in EXPORTERS:
            groups |= env.ref("base.group_allow_export")
        users[login] = env["res.users"].with_context(no_reset_password=True).create({
            "name": name,
            "login": login,
            "password": login,
            "tz": TZ,
            "lang": "en_US",
            "email": f"{login}@example.com",
            "group_ids": [(6, 0, groups.ids)],
        })
    for user in users.values():
        _employee(env, user.name, schedule, user=user)
    manager = users["toff_manager"].employee_id
    # the manager becomes the approver by default (and holds the group), then the approver is
    # named: the Community takes the group back from the manager, who approves nobody
    peer = _employee(env, PEER_NAME, schedule, parent_id=manager.id)
    peer.leave_manager_id = users["toff_approver"]
    env.flush_all()
    check_role_groups(env, users)
    return users


# login -> the Time Off groups the user holds (acceptance "Users", A67)
TIME_OFF_GROUPS = {
    "employee": "hr_holidays.group_hr_holidays_employee",
    "responsible": "hr_holidays.group_hr_holidays_responsible",
    "officer": "hr_holidays.group_hr_holidays_user",
    "admin": "hr_holidays.group_hr_holidays_manager",
}
ROLE_GROUPS = {
    "toff_none": (),
    "toff_emp": ("employee",),
    "toff_approver": ("employee", "responsible"),
    "toff_manager": ("employee",),
    "toff_officer": ("employee", "responsible", "officer"),
    "toff_admin": ("employee", "responsible", "officer", "admin"),
}


def check_role_groups(env, users):
    """Raise ``AssertionError`` when a role user's Time Off groups, internal group or export
    group differ from the table of the acceptance's "Users"."""
    problems = []
    for login, expected in ROLE_GROUPS.items():
        user = users[login]
        held = {
            key for key, xmlid in TIME_OFF_GROUPS.items() if user.has_group(xmlid)}
        if held != set(expected):
            problems.append(f"{login}: Time Off groups {sorted(held)}, expected {sorted(expected)}")
        if not user.has_group("base.group_user"):
            problems.append(f"{login}: not an internal user")
        if user.has_group("base.group_allow_export") != (login in EXPORTERS):
            problems.append(f"{login}: export group differs")
    if problems:
        raise AssertionError("role users' groups differ: " + "; ".join(problems))


def make_peer_band_records(env):
    """A88's records of "Toff Peer": 10 days of Legal leave employee allocated, an Approved
    request of 16 and 17 November and a request To Approve on 19 November."""
    peer = env["hr.employee"].search([("name", "=", PEER_NAME)], limit=1)
    legal = find_type(env, "PTO")
    _allocate(env, peer, legal, 10)
    make_leave(env, peer, legal, date(2026, 11, 16), date(2026, 11, 17))
    waiting = make_leave(env, peer, legal, date(2026, 11, 19))
    # set back by hand: the Community refuses to reset a request whose day has passed
    waiting.sudo().write({"state": "confirm"})
    env.flush_all()
    return peer


def make_flexible(env, schedule=None):
    """The *flexible* records: "Toff Flex", "Toff Hours", "Toff Flexible" and "Toff Fixed".

    Per employee: the sick type on Monday 16 November (a whole day), on Tuesday 17 November
    (morning only), and Toff Hours on Wednesday 18 November, 9:00 to 13:00; all Approved.
    Returns the records by name.
    """
    schedule = schedule or find_schedule(env)
    flex = env["resource.calendar"].search([("name", "=", "Toff Flex")], limit=1)
    flex = flex or env["resource.calendar"].create({
        "name": "Toff Flex", "calendar_type": "undefined",
        "hours_per_week": 40, "hours_per_day": 8,
    })
    hours = make_hours_type(env)
    sick = find_type(env, "STO")
    made = {"Toff Flex": flex, HOURS_TYPE: hours}
    for name, calendar in (("Toff Flexible", flex), ("Toff Fixed", schedule)):
        employee = _employee(env, name, calendar)
        made[name] = employee
        make_leave(env, employee, sick, date(2026, 11, 16))
        make_leave(env, employee, sick, date(2026, 11, 17), duration="am")
        make_leave(env, employee, hours, date(2026, 11, 18), duration="specific", hours=(9, 13))
    env.flush_all()
    return made


def set_waiting(env, leave):
    """Put ``leave`` To Approve by hand (the Community refuses to reset a request whose day
    has passed), without its resource leave."""
    leave.sudo().write({"state": "confirm"})
    env["resource.calendar.leaves"].sudo().search([("holiday_id", "=", leave.id)]).unlink()
    env.flush_all()
    return leave


def make_split_state(env, schedule=None):
    """The *split* records: "Toff Act" with STO Approved from Monday 16 to Wednesday 18
    November; returns the request."""
    schedule = schedule or find_schedule(env)
    employee = env["hr.employee"].search([("name", "=", ACT_NAME)], limit=1)
    employee = employee or _employee(env, ACT_NAME, schedule)
    leave = make_leave(env, employee, find_type(env, "STO"), date(2026, 11, 16), date(2026, 11, 18))
    env.flush_all()
    return leave


def make_units_state(env, schedule=None, with_hours=True):
    """The *units* records: type "Toff Hours"; "Toff Act" with STO To Approve from Monday 16
    afternoon to Wednesday 18 morning and Toff Hours To Approve on Thursday 19, 9:00 to 13:00.
    Returns ``(half-day request, hours request)``. ``with_hours=False`` prepares the half-day
    request alone (A71: the move onto Thursday 19 would overlap the hours request): the second
    item is then None."""
    schedule = schedule or find_schedule(env)
    employee = env["hr.employee"].search([("name", "=", ACT_NAME)], limit=1)
    employee = employee or _employee(env, ACT_NAME, schedule)
    half = make_leave(
        env, employee, find_type(env, "STO"), date(2026, 11, 16), date(2026, 11, 18),
        periods=("pm", "am"), approve=False)
    set_waiting(env, half)
    hours = None
    if with_hours:
        hours = make_leave(
            env, employee, make_hours_type(env), date(2026, 11, 19), duration="specific",
            hours=(9, 13), approve=False)
        set_waiting(env, hours)
    env.flush_all()
    return half, hours


def _act_employee(env, schedule=None):
    found = env["hr.employee"].search([("name", "=", ACT_NAME)], limit=1)
    return found or _employee(env, ACT_NAME, schedule or find_schedule(env))


def _named(env, name):
    found = env["hr.employee"].search([("name", "=", name)], limit=1)
    if not found:
        raise AssertionError(f"employee {name!r} missing: call make_role_users first")
    return found


def make_waiting(env, employee, leave_type, first, last=None, **kwargs):
    """A request To Approve of ``employee``."""
    return set_waiting(env, make_leave(env, employee, leave_type, first, last, **kwargs))


def make_second_approval(env, employee, first, last=None):
    """A request of "Leave without pay" (validated twice) at Second Approval."""
    leave = make_waiting(env, employee, find_type(env, "UN"), first, last)
    approve_leave(env, leave, once=True)
    return leave


def make_refused(env, employee, leave_type, first, last=None):
    """A request of ``employee`` refused by the administrator while To Approve."""
    leave = make_waiting(env, employee, leave_type, first, last)
    leave.with_user(find_admin(env)).action_refuse()
    return leave


def make_four_states(env, employee, first):
    """STO To Approve on ``first``, UN at Second Approval the day after, STO Approved the day
    after that and STO Refused on the fourth day; ``{state: request}``."""
    day = [first + timedelta(days=n) for n in range(4)]
    sick = find_type(env, "STO")
    return {
        "confirm": make_waiting(env, employee, sick, day[0]),
        "validate1": make_second_approval(env, employee, day[1]),
        "validate": make_leave(env, employee, sick, day[2]),
        "refuse": make_refused(env, employee, sick, day[3]),
    }


def make_act_state(env, schedule=None):
    """*act*: "Toff Act" with STO To Approve on Wednesday 18 November, UN at Second Approval
    on Thursday 19 and STO Approved on Friday 20; ``{"employee", "confirm", "validate1",
    "validate"}``."""
    employee = _act_employee(env, schedule)
    made = {
        "employee": employee,
        "confirm": make_waiting(env, employee, find_type(env, "STO"), date(2026, 11, 18)),
        "validate1": make_second_approval(env, employee, date(2026, 11, 19)),
        "validate": make_leave(env, employee, find_type(env, "STO"), date(2026, 11, 20)),
    }
    env.flush_all()
    return made


def make_move_state(env, schedule=None):
    """*move*: "Toff Act" with STO To Approve on Monday 16 and STO Approved on Wednesday 18
    November; ``{"employee", "confirm", "validate"}``."""
    employee = _act_employee(env, schedule)
    sick = find_type(env, "STO")
    made = {
        "employee": employee,
        "confirm": make_waiting(env, employee, sick, date(2026, 11, 16)),
        "validate": make_leave(env, employee, sick, date(2026, 11, 18)),
    }
    env.flush_all()
    return made


def make_emp_state(env):
    """*emp* (roles made): Toff Role Emp with STO To Approve on Wednesday 18 and STO Approved
    on Thursday 19, Toff Peer with STO To Approve on Friday 20 November; ``{"emp_confirm",
    "emp_validate", "peer_confirm"}``."""
    emp, peer = _named(env, ROLES["toff_emp"][0]), _named(env, PEER_NAME)
    sick = find_type(env, "STO")
    made = {
        "emp_confirm": make_waiting(env, emp, sick, date(2026, 11, 18)),
        "emp_validate": make_leave(env, emp, sick, date(2026, 11, 19)),
        "peer_confirm": make_waiting(env, peer, sick, date(2026, 11, 20)),
    }
    env.flush_all()
    return made


def make_types_state(env):
    """*types* (roles made): 10 days of CTO allocated to Toff Peer, approved; Toff Peer with
    CTO To Approve on Monday 16, UN To Approve on Tuesday 17 and STO To Approve on Wednesday
    18 November; ``{"allocation", "cto", "un", "sto"}``."""
    peer = _named(env, PEER_NAME)
    cto = find_type(env, "CTO")
    _allocate(env, peer, cto, 10)
    made = {
        "allocation": env["hr.leave.allocation"].search([
            ("employee_id", "=", peer.id), ("work_entry_type_id", "=", cto.id)], limit=1),
        "cto": make_waiting(env, peer, cto, date(2026, 11, 16)),
        "un": make_waiting(env, peer, find_type(env, "UN"), date(2026, 11, 17)),
        "sto": make_waiting(env, peer, find_type(env, "STO"), date(2026, 11, 18)),
    }
    env.flush_all()
    return made


def make_matrix_state(env, login, first=date(2026, 11, 16), peer_first=None):
    """*matrix* (roles made): for the role user's own employee (``login``) and Toff Peer, the
    four states of ``make_four_states`` from Monday 16 November (``first``; Toff Peer from
    ``peer_first`` when given), and for the own employee also STO on Friday 20 (``first`` + 4),
    Approved then cancelled by the role user.

    Returns ``{"own": {state: request}, "peer": {state: request}}`` with the cancelled request
    as ``own["cancel"]``.
    """
    own = _named(env, ROLES[login][0])
    peer = _named(env, PEER_NAME)
    made = {
        "own": make_four_states(env, own, first),
        "peer": make_four_states(env, peer, peer_first or first),
    }
    cancelled = make_leave(env, own, find_type(env, "STO"), first + timedelta(days=4))
    # the Community's cancellation as the role user, without its check of the day (the request
    # lies in the past when the server's day is after 20 November)
    cancelled.with_user(users_of(env)[login])._force_cancel("Toff cancelled", 'mail.mt_note')
    made["own"]["cancel"] = cancelled
    env.flush_all()
    return made


def users_of(env):
    """The role users by login."""
    found = env["res.users"].with_context(active_test=False).search(
        [("login", "in", list(ROLES))])
    return {user.login: user for user in found}


def make_away_state(env, schedule=None):
    """*away* (A94, N1): "Toff Away" with an STO request, Approved, that covers the server's
    present instant at every hour of the day: from the last working day before the server's day
    (its UTC date) to the first working day two days after it. The card's "back on" line reads
    the server's real clock, so the tours that use this state do not pin it
    (``pin_leave_status_clock``). Returns the request."""
    employee = env["hr.employee"].search([("name", "=", AWAY_NAME)], limit=1)
    employee = employee or _employee(env, AWAY_NAME, schedule or find_schedule(env))
    today = fields.Datetime.now().date()
    first = today - timedelta(days=1)
    while first.weekday() >= 5:
        first -= timedelta(days=1)
    last = today + timedelta(days=2)
    while last.weekday() >= 5:
        last += timedelta(days=1)
    leave = make_leave(env, employee, find_type(env, "STO"), first, last)
    env.flush_all()
    return leave


def make_alloc_state(env, schedule=None):
    """*alloc*: "Toff Act" with 2 days of CTO allocated from 1 January 2026, approved; CTO To
    Approve on Monday 16 and Tuesday 17 November (one request of 2 days, the whole balance) and
    STO Approved on Thursday 19; ``{"employee", "allocation", "cto", "sto"}``."""
    employee = _act_employee(env, schedule)
    cto = find_type(env, "CTO")
    _allocate(env, employee, cto, 2)
    made = {
        "employee": employee,
        "allocation": env["hr.leave.allocation"].search([
            ("employee_id", "=", employee.id), ("work_entry_type_id", "=", cto.id)], limit=1),
        "cto": make_waiting(env, employee, cto, date(2026, 11, 16), date(2026, 11, 17)),
        "sto": make_leave(env, employee, find_type(env, "STO"), date(2026, 11, 19)),
    }
    env.flush_all()
    return made


def past_day(env):
    """The last working day (Monday to Friday of the 40 hours schedule) before the server's
    day: the UTC date the Community's deletion check reads (``fields.Datetime.now().date()``),
    so the request starts before it at every hour of the day."""
    day = fields.Datetime.now().date() - timedelta(days=1)
    while day.weekday() >= 5:
        day -= timedelta(days=1)
    return day


def make_past_state(env):
    """*past* (roles made): Toff Role Emp with STO To Approve on the server's day minus one
    working day; ``{"emp_past": request}``."""
    emp = _named(env, ROLES["toff_emp"][0])
    made = {"emp_past": make_waiting(env, emp, find_type(env, "STO"), past_day(env))}
    env.flush_all()
    return made


def make_states(env, schedule=None):
    """The *states* records: Toff States with one request per state; returns the employee.

    16 November: the sick type set back To Approve; 17 November: Leave without pay (validated
    twice) set back to approval then approved once (Second Approval); 18 November: the sick
    type Approved; 19 November: the sick type Refused.
    """
    schedule = schedule or find_schedule(env)
    employee = _employee(env, "Toff States", schedule)
    admin = find_admin(env)
    sick, unpaid = find_type(env, "STO"), find_type(env, "UN")
    waiting = make_leave(env, employee, sick, date(2026, 11, 16))
    waiting.with_user(admin).action_back_to_approval()
    second = make_leave(env, employee, unpaid, date(2026, 11, 17))
    second.with_user(admin).action_back_to_approval()
    approve_leave(env, second, once=True)
    make_leave(env, employee, sick, date(2026, 11, 18))
    refused = make_leave(env, employee, sick, date(2026, 11, 19))
    refused.with_user(admin).action_refuse()
    env.flush_all()
    return employee


def make_bulk(env, schedule=None):
    """The *bulk* records: 30 employees "Toff Bulk 00" to "Toff Bulk 29"."""
    schedule = schedule or find_schedule(env)
    made = env["hr.employee"]
    for number in range(30):
        made |= _employee(env, f"Toff Bulk {number:02d}", schedule)
    env.flush_all()
    return made


def make_tokyo(env):
    """The *tokyo* records: "Toff Split" (Monday to Friday 8:00-12:00 and 13:00-17:00) and
    "Toff Tokyo" (that schedule, Asia/Tokyo); returns the employee."""
    lines = [
        (0, 0, {"dayofweek": str(day), "hour_from": start, "hour_to": stop})
        for day in range(5) for start, stop in ((8, 12), (13, 17))
    ]
    split = env["resource.calendar"].create({
        "name": "Toff Split", "calendar_type": "fixed",
        "attendance_ids": [(5, 0, 0)] + lines,
    })
    employee = _employee(env, "Toff Tokyo", split, tz="Asia/Tokyo")
    env.flush_all()
    return employee


def make_demo_like(env, schedule=None):
    """The demo employees with their leaves of acceptance.md, each only when absent.

    Types: the generic "Legal leave employee" (PTO, 11), "Compensatory Time Off" (CTO, 4) and
    "Guaranteed monthly wage illness" (STO, 3), found or made. An employee that does not
    exist is created on the demo schedule; one that exists (the demo's) and already holds the
    table's leaves keeps them, else its requests are replaced by the table's (8:00 to 16:00
    Brussels, Approved), with an allocation for the types that need one when it has none.
    Mitchell Admin is the administrator's own employee. Returns them by name.
    """
    schedule = schedule or find_schedule(env)
    admin = find_admin(env)
    made = {}
    for name, entries in DEMO_LEAVES.items():
        if name == "Mitchell Admin":
            employee = env["hr.employee"].search([("user_id", "=", admin.id)], limit=1)
        else:
            employee = env["hr.employee"].search([("name", "=", name)], limit=1)
        employee = employee or _employee(
            env, name, schedule, user=admin if name == "Mitchell Admin" else None)
        made[name] = employee
        Leave = env["hr.leave"].with_context(active_test=False)
        if all(_has_leave(env, employee, key, first) for key, first, _last in entries):
            continue
        # the demo's leaves lie around the day the database was made, not on the days of the
        # table: the employee's own requests go, so the table's do not overlap them (the
        # allocations stay)
        Leave.with_user(admin).search([("employee_id", "=", employee.id)]).unlink()
        for key, first, last in entries:
            leave_type = find_type(env, key)
            if leave_type.requires_allocation:
                _allocate(env, employee, leave_type, 20 if key == "PTO" else 10)
            make_leave(env, employee, leave_type, first, last)
    env.flush_all()
    return made


def make_demo_world(env, schedule=None):
    """The 22 demo employees, each only when absent, the six of them with their leaves.

    ``make_demo_like`` gives the leaves; an employee of the Community demo that this database
    lacks (no demo data) is created on the demo schedule. Returns the employees by name.
    """
    schedule = schedule or find_schedule(env)
    made = make_demo_like(env, schedule)
    for name in DEMO_EMPLOYEES:
        if name in made:
            continue
        found = env["hr.employee"].search([("name", "=", name)], limit=1)
        made[name] = found or _employee(env, name, schedule)
    for name in NO_CONTRACT:
        _set_contract(made[name], False, False)
    _set_contract(made["Keith Byrd"], CONTRACT_START, KEITH_CONTRACT_END)
    env.flush_all()
    return made


def _set_contract(employee, start, end):
    """The contract dates of all versions of ``employee`` (False: none); the cells of the
    days outside the contract are grey in the view."""
    employee.with_context(active_test=False, sync_contract_dates=True).version_ids.write({
        "contract_date_start": start, "contract_date_end": end})


def _has_leave(env, employee, key, first):
    """Whether ``employee`` holds an Approved request of the type ``key`` starting on ``first``."""
    return env["hr.leave"].with_context(active_test=False).search_count([
        ("employee_id", "=", employee.id), ("request_date_from", "=", first),
        ("work_entry_type_id", "=", find_type(env, key).id), ("state", "=", "validate")])


def _allocate(env, employee, leave_type, days):
    """An approved allocation of ``days`` for 2026, unless the employee has one of the type."""
    allocations = env["hr.leave.allocation"].with_context(active_test=False)
    if allocations.search_count([
            ("employee_id", "=", employee.id), ("work_entry_type_id", "=", leave_type.id)]):
        return
    allocation = env["hr.leave.allocation"].with_user(find_admin(env)).create({
        "name": f"{leave_type.name} for {employee.name}",
        "employee_id": employee.id,
        "work_entry_type_id": leave_type.id,
        "number_of_days": days,
        "date_from": date(ALLOCATION_YEAR, 1, 1),
        "date_to": date(ALLOCATION_YEAR, 12, 31),
    })
    allocation.action_approve()


def utc(text):
    """A naive UTC datetime from ``YYYY-MM-DD HH:MM``."""
    return datetime.strptime(text, "%Y-%m-%d %H:%M")


SPEC = {
    "display_name": {},
    "employee_id": {"fields": {"display_name": {}}},
    "state": {},
}
LEAVE_SPEC = {**SPEC, "color": {}}
# 2026-11-11 is a Wednesday; the periods are the browser's, in Europe/Brussels (UTC+1)
MONTH = ("2026-10-31 23:00:00", "2026-11-30 23:00:00")
WEEK = ("2026-11-14 23:00:00", "2026-11-21 23:00:00")  # Sunday 15 to Saturday 21 November
QUARTER = ("2026-09-30 22:00:00", "2026-12-31 23:00:00")


class TimeOffGanttMixin:
    """A way to make the data call of a view as the browser does."""

    def call_gantt(
        self, model="hr.leave", *, user=None, period=MONTH, scale="month",
        user_domain=(), extra=(), groupby=("employee_id",), hide_name=True, specification=None,
        **kwargs,
    ):
        """The view's data call: the period's two conditions, the action's domain and the
        user's search in ``domain``, the search again in ``context.user_domain``."""
        user_domain = list(user_domain)
        env = self.env(user=user) if user else self.env
        env.invalidate_all()
        records = env[model].with_context(
            tz=TZ, user_domain=user_domain, group_by=list(groupby),
            **({"hide_employee_name": 1} if hide_name else {}))
        start_field, stop_field = (
            ("date_from", "date_to") if model == "hr.leave"
            else ("request_date_hour_from", "request_date_hour_to"))
        domain = [
            (start_field, "<", period[1]), (stop_field, ">", period[0]),
            *user_domain, *extra,
        ]
        kwargs.setdefault("limit", 20)
        kwargs.setdefault("start_date", period[0])
        kwargs.setdefault("stop_date", period[1])
        default_spec = LEAVE_SPEC if model == "hr.leave" else SPEC
        return records.get_gantt_data(
            domain, list(groupby), specification or default_spec, scale=scale, **kwargs)

    @staticmethod
    def row_names(result):
        return [group["employee_id"][1] for group in result["groups"] if group.get("employee_id")]

    @staticmethod
    def texts(result):
        """The display names of the returned records, by sorted text."""
        return sorted(record["display_name"] for record in result["records"])


def pin_leave_status_clock(case, instant=datetime(2026, 11, 11, 10, 0, 5)):
    """Make the Community's leave status (``leave_date_to``, the card's "back on" line) read
    ``instant`` (a naive UTC datetime) as the server's now, for the test ``case``.

    The pin moves every field of that compute (``leave_date_to``, ``leave_date_from``,
    ``current_leave_state``, ``is_absent``), not only the card's line.

    The compute method of ``hr.employee`` runs the original with ``fields.Datetime.now``
    returning ``instant`` for the duration of that call only; the public employee reads the
    same compute, so the card is covered whoever reads it.
    """
    original = type(case.env['hr.employee'])._compute_leave_status

    def pinned(self):
        with mock.patch.object(fields.Datetime, 'now', return_value=instant):
            return original(self)

    case.patch(type(case.env['hr.employee']), '_compute_leave_status', pinned)
