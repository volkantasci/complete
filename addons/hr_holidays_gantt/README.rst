=================
Time Off Timeline
=================

The bridge between the Time Off application and the Gantt view: the time off of
the employees on a timeline, one row per employee, one pill per request.

User documentation: ``docs/modules/time_off_gantt.md``. The employee rows come
from ``hr_gantt`` (``docs/modules/employee_gantt.md``).

Installation
============

The module installs by itself once Time Off, Import and the Employees timeline
bridge are installed. It is not an application and adds no menu, group,
access right, record rule or setting.

What the module adds
====================

- **Two Gantt views.** The leave view shows time off requests; the report view
  shows the Community's time-off report. The Overview menu opens the leave view
  for Officers and Administrators, and the report view for every other user with
  a Time Off group. Management > Time Off gets the leave view as its last view.
- **Pills.** An Officer reads the type's code and the duration; others read the
  duration. A request of one day or less reads its duration alone on the Month
  and Quarter ranges, whatever the search holds.
- **Rows.** A search on employees lists every matching employee, also one without
  a leave; a search on the requests lists only the employees who have matching
  requests.
- **Unavailable days.** Approved leaves grey their days, also for flexible
  schedules, by the request's unit (half day, hours, days). The attendance views
  take the same leaves into account and subtract them from the hours expected of
  fixed schedules.
- **The hours label.** For a fixed schedule the hours to work in the period,
  less leave; for a flexible schedule the hours of approved leave.
- **The employee card** with a leave band: the schedule button for everyone, the
  leave lines and the pencil for Employees officers.
- **Import and Export** in the gear of the leave view.

- **The leave popover.** A click or a tap on a pill opens a popover with the
  request's type, dates, number of days, allocation warning and description. Its
  buttons follow the state and what the Community allows: Edit, Save, Approve,
  Refuse, Discard and Delete. The report view's popover offers Delete alone.
  Expand opens the request's form; a double click opens its dialog.
- **Moves, resizes and copies** in the leave view, through the Community's own
  checks, with Undo. Second Approval and Approved pills are locked; a copy is
  refused except for a Refused or Cancelled request.
- **The split tool.** Officers and Administrators split a request at a day border
  with a click and join the parts again with Undo; each Approved part keeps its own
  leave.
- **The phone.** A tap opens the popover as the Gantt view's bottom sheet, with no
  split tool.

Creating leaves from the cells follows in a later release: until then a click, a
double click or a drag on an empty cell does nothing.

For developers
==============

The client variants are ``hr_holidays_gantt_manager_hr_leave`` (leave view) and
``hr_holidays_report_gantt`` (report view). The renderer's ``hhgInputs`` getter
switches the pill inputs on and the cell inputs off for the next release. The popover
is built on the form ``hr_holidays_gantt.hr_leave_gantt_multi_create_view``. The
server side is in ``models/``: ``get_gantt_data``, ``_gantt_unavailability`` and
``_gantt_progress_bar`` are overridden on ``hr.leave``, and ``get_gantt_data`` on
``hr.leave.report.calendar``; ``hhg_cut_request`` and ``hhg_rejoin_request`` split a
request and undo the split.

Reads with system rights
========================

Two values are read with the rights of the system, because the user may lack a
right on the record behind them:

- the request unit of a flexible leave, in ``resource_calendar.py``: the
  schedule's intervals are computed for every employee in a batch, and the
  request behind a leave may not be readable by the user who looks at it;
- the hours per week of the schedule on the employee card, in
  ``hr_employee_public.py``: the card reads the public record of the employee,
  and the schedule button is for everyone, so the number comes from the
  employee's schedule, which the public record does not hold.

Nothing else is returned from them: a number, or a unit that decides an
interval.

Uninstall
=========

The uninstall hook gives the Overview menu the Community dashboard action, and
the dashboard and management actions their Community view modes.
