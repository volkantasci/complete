====================
Attendances Timeline
====================

The bridge between the Attendances application and the Gantt view: the
attendances of the employees on a timeline, in one row per employee.

User documentation: ``docs/modules/attendance_gantt.md``. The employee rows come
from ``hr_gantt`` (``docs/modules/employee_gantt.md``).

What this version adds for users
================================

The part of the module that lets a user *do* something in the views:

- **My Attendances** has the Gantt view as its second view (Calendar stays the first and the
  default), with one row for the user's own employee.
- **The monthly view**: the worked-hours button of an employee opens a Gantt view on the Month
  range, with the Community's attendance overview above the grid, as the third view of
  "Attendances This Month". A creation there proposes the employee of the form.
- **Opening, creating, moving**: a click or tap on a pill opens its record dialog at once; a
  click on an empty cell, a drag over cells and the New button open the creation dialog, which
  proposes the check-out as the check-in plus the employee's hours per day on every scale but
  the day scale; pills and their ends move and resize, an open attendance stays open when it is
  moved; the Community's rules decide every write.
- **The contract warning** in every attendance form, with the link "Correct employee" for
  Employees officers.
- **The contract filters** Ongoing Contract and No Active Contract for officers, and the
  Date groupings hidden in the Gantt views of the two actions.
- What each role may do is the Community's own; the module adds no group, access right or rule
  (``docs/modules/attendance_gantt.md``, "What each role may do").

Features
========

The action
----------

The Community management action (Attendances > Management > Dashboard,
``hr_attendance.hr_attendance_action``) gets the Gantt view mode first: Gantt,
List, Form, with Gantt as the default. Its context becomes the grouping by
employee as the search default, which shows as the "Employee" facet; the
Community's grouping by month is dropped. Name, search view and help are kept.
The Community **My Attendances** action (``hr_attendance.hr_attendance_my_action``) gets
the Gantt view mode as its second one: Calendar (still first and the default), Gantt, List,
Pivot, Graph. Its condition, context and calendar view are kept; the Gantt mode uses the
model's default Gantt view.

The module's uninstall hook, ``restore_attendance_action`` in ``hooks.py``, writes
the Community's view modes (``list,form`` and ``calendar,list,pivot,graph``) and the
management action's context back.

The view
--------

``hr_attendance_gantt_view`` is a Gantt view of ``hr.attendance`` (version 20.0.1.1.0
renamed it from ``hr_attendance_view_gantt``; the migration renames the identifier, and
the record keeps its database id) with
``js_class="attendance_gantt"``: the title "Days" over the row headers, check-in
and check-out as start and stop, the work entry type's colour, grouping by
employee, 20 groups per page, the Day range as default, precision of quarter
hours on the day scale, quarter days on the week scale and half days on the month
scale, unavailable periods on, and progress bars for the employee field. The
two-week precision entry names a scale the view does not know, and is ignored.
The form of its dialogs is the Community creation form
(``hr_attendance.hr_attendance_create_view_form``, the ``form_view_id`` option) and the
plan option is off (``plan="0"``), so a click on an empty cell creates. Every other option
keeps its default, so there is no multi-selection, side panel or dependency.

``hr_attendance_gantt_view_default_scale_month`` is a primary copy of it that opens on the
Month range. It has a later priority, so the model's default Gantt view stays the original.

``hr_attendance_gantt_view_employee_monthly_hours`` is a primary copy of that Month view with
``js_class="monthly_attendance_gantt"``. The employee's worked-hours button opens the
Community action "Attendances This Month" (List, Form), and this module adds that view as its
third one (``hr.employee.action_open_last_month_attendances``). The monthly variant lays the
Community attendance overview above the grid (a 96 px band, one card per work entry type of
the displayed period, read again at every load) and proposes the employee of the form that
opened the action, the ``active_id`` of its context, in every creation dialog. Its grid has no
grouping, so it shows one unnamed row.

Attendances also offer ``action_open_details()``: on one attendance it returns the window
action that opens it in the Community form view; no screen of this module uses it.

The variant ``attendance_gantt``
--------------------------------

It extends the employee variant of ``hr_gantt``:

- **One period per range.** A named range shows one period, not three; previous,
  next, Today, the range menu and the first display all build that one period.
  Choosing a range while today is inside the period builds it around today.
- **Records shown.** Closed attendances that overlap the period (or lie at its
  start with zero length) and, when now is at or after the period's start, open
  attendances that began before the period's end and before now. The browser reads
  "now" once for each load. An open attendance is drawn from its check-in to now,
  and its end snaps to its column's part.
- **Employee rows.** When the view is grouped by employee alone and every condition
  of the user's search concerns the employee (the employee field, a field reached
  through it, or an attendance field that only repeats one of the employee: the
  department, the manager, the attendance manager, the working schedule), the data
  call uses ``_get_gantt_data_with_empty`` of ``hr_gantt``: every active employee
  that matches gets a row, by name, 20 to a page, and the pager counts employees.
  Otherwise the rows are those of the Gantt view.
- **Unavailable periods.** The Community's unavailable intervals of each employee
  of the page, read with the rights of the system and placed at the same clock
  time in the user's time zone: no contract, the schedule's hours, whole-day
  schedules, flexible schedules and the company-wide leaves.
- **Hours worked and expected.** Per employee of the page: the hours of the closed
  attendances that the user may read, the part inside the period for one that
  crosses its bounds (the break shared in proportion), against the hours expected
  on the period's own days. The label and bar follow the status rules (warning
  above 100 %, danger from 200 %, warning at 0 % for an employee tracked by
  attendances); the long form of the label shows from a window width of 1400 px and
  follows the window live (``RESIZE_DELAY``). A fully flexible employee has the
  hours only, no bar and no tooltip. Only internal users get progress values.
- **Names.** In the data call's answer, ``hag_without_contract`` lists the
  employees of the page with no contract version in the period; their names are in
  the danger colour (grouping by employee alone).
- **Folding.** A click on a folded header opens it, with Ctrl too; with Shift it
  does nothing. The folding itself is the Gantt view's, worked out at every load.
- **The empty-view helper.** With at most one row and no attendance in it, the
  Attendances application's own helper (``AttendanceActionHelper``) shows: a layer
  over the grid on desktop, from 115 px below the top of the content area with one
  row (the header lines plus the rows' inner heights), and in the grid's place on
  a phone.

Access
------

The module adds no group, access right or record rule. Rows follow the user's read
rules on attendances (an employee without attendances still gets a row if the user
may read that employee's attendances); labels and bars are for internal users
only; schedules, contracts and versions are read with the rights of the system for
the employees that have a row.

Clicks, taps and the record dialog
==================================

A click or a tap on a pill (its body, its text, or an end pressed and released without
moving) opens the record dialog of the attendance at once: titled "Open", the creation form
of the Community with its own footer (Save & Close, Discard and, for a manager of the
attendance, Delete, which deletes without a confirmation). There is no popover, and the
framework's Remove button is not offered. The dialog waits for a write still being sent,
and the view reloads when it closes, on the same range, period and scroll position.

A first click on an attendance locks that attendance for 200 ms: a click on it in the rest
of the 200 ms does nothing (so a double click, or two quick taps, open one dialog), and the
lock does not restart. While a record dialog is opening or open no click opens another;
a click on another attendance, with no dialog opening or open, opens its dialog at once.
The code is ``AttendanceTimelineRenderer.onPillClick`` and
``AttendanceTimelineEditor`` (the editor of the view's ``Editor`` slot) in
``attendance_timeline_editor.js``.

Moving and resizing
===================

Dragging a pill, or one of its ends, writes the attendance as the Gantt view does for any
record; the Community's own rules apply to the write (an overlap, a check-out before the
check-in, the access rules), and a refused write shows its error and the pill goes back. A
move with Ctrl held asks for a copy, which the Community refuses (an error dialog; nothing
is created or moved). Some writes run the Community's time rules, which can split an
attendance longer than the schedule; Undo then gives the first part its values back but
cannot join the parts again.

An open attendance (no check-out) is drawn up to the instant its data was loaded ("now").
Moving it writes the check-in only, so it stays open; dragging its start writes the
check-in; dragging its end writes a check-out of "now" plus the sub-columns of the drag, with
the seconds of "now". Undo gives the earlier check-in back and, after a move or an end drag,
empties the check-out. The code is ``AttendanceTimelineEditor.writeValuesFor`` and
``undoValuesFor`` (the value hooks of the framework's editor).

The variant is a plain object, ``attendanceTimelineView`` in
``attendance_timeline_view.js``; a later module extends the renderer class, registers
its own entry and chooses it with ``js_class``; ``monthly_attendance_gantt``
(``monthly_attendance_view.js``) is built that way.

**The arch accepts more options by inheritance.** The view record names only the
options listed above. A later module inherits ``hr_attendance_gantt.hr_attendance_gantt_view``
and adds attributes to the ``gantt`` element, which the Gantt view already reads::

    <record id="my_attendance_view_gantt" model="ir.ui.view">
        <field name="inherit_id" ref="hr_attendance_gantt.hr_attendance_gantt_view"/>
        <field name="arch" type="xml">
            <gantt position="attributes">
                <attribute name="plan">0</attribute>
                <attribute name="form_view_id">42</attribute>
            </gantt>
        </field>
    </record>

``plan`` decides whether a click on an empty cell opens the plan dialog or the create
dialog; the view record sets it off (``plan="0"``), and the attendance variant also reads an
absent ``plan`` as off. ``form_view_id`` is the database identifier of the form view that
the create and record dialogs use; in an XML file it is written
``%(module.xmlid)d``, as the view record does.

Extension points used
=====================

On the framework side (``docs/modules/gantt_view.md``, "Extension points for view variants"):

- **The ``Editor`` slot.** ``AttendanceTimelineEditor`` (``attendance_timeline_editor.js``)
  is the editor of the variant; the monthly variant inherits it.
- **``creationContextFor``.** The editor adds ``scale``, the id of the displayed scale, to the
  context of every creation: the server reads it to decide whether the check-out is proposed.
- **``writeValuesFor`` and ``undoValuesFor``.** For an open attendance (no check-out) a move
  writes the check-in only, dragging the end writes a check-out measured from the "now" of the
  load, and Undo empties the check-out. Any other change keeps the values of the framework.
- **The renderer's ``onPillClick``**: the dialog and the lock of 200 ms.

On the Python side, all in ``models/``:

- ``hr.attendance``: ``has_active_contract`` (a search field, officers only, the two contract
  filters), ``show_contract_warning`` (computed with the rights of the system, drives the warning
  line) and the change handler of ``check_in`` that proposes the check-out when the context's
  ``scale`` is ``week``, ``month`` or ``year``; the data call, the unavailability hook and the
  progress hook of the Gantt view (above).
- ``hr.employee``: ``action_open_last_month_attendances`` adds the monthly Gantt view to the
  action it returns.
- The search view, the attendance form and the actions are changed only by inheriting views and
  action records in ``views/hr_attendance_gantt_views.xml``: the search view gets the filters
  (the "Date" grouping of the Gantt views is hidden by the search model of the variant, by the
  names in ``HIDDEN_GROUPINGS`` of ``attendance_timeline_view.js``), the form gets
  the warning and the link, the two actions get their view lines.

The migration
=============

``migrations/20.0.1.1.0/pre-migrate.py`` runs once when a database whose module version is
older than 20.0.1.1.0 is updated. The Attendances bridge as released with the earlier slice
(``hr_attendance_view_gantt``) named its view differently from the identifier the specification
requires (``hr_attendance_gantt_view``). The script calls ``rename_attendance_view`` of
``hooks.py``: it changes the ``name`` of that view's ``ir_model_data`` row (the module's own row)
and nothing else, so the view record keeps its database id, and the management action's view
line (and any customization that inherits it by identifier) still points at it. The update then
finds the record under its new identifier, and creates no second view. A database with no row
under the old name, or one that already has the new name, is left alone; the script can run twice.
It was checked by installing the module as released, then updating it with this code (the view
had the same id before and after; no row of the old name was left).

Tests
=====

The tests sit in ``tests/`` (Python, with the tours' browser scripts in ``static/tests/tours/``)
and ``static/tests/`` (Hoot). Each test is named after its scenario (``test_a26...``) or its
measured value (``test_m22...``). Run the module's tests on a fresh database, with the Enterprise
look module for the dark probes and the test host module for the Gantt framework::

    podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml \
        run --rm odoo odoo -d t_attendance_gantt -i web_enterprise,test_web_gantt,hr_attendance_gantt \
        --test-tags /hr_attendance_gantt --stop-after-init

What runs: the backend tests (rows, access, roles, filters, warning, check-out proposal, open
moves, notes), the tours (``test_actions_tours.py``, ``test_hr_rows_tours.py``: what a user
sees and does, with real pointer events for the gestures), the probes (``*_probes.py``: measured
values of the specification, in light and dark, desktop and phone) and the Hoot suite
(``test_hoot.py``; ``-e HR_ATTENDANCE_GANTT_HOOT_FILTER=<text>`` after ``run`` narrows it to the
tests whose name contains the text). Add ``--test-tags /hr_attendance_gantt:TestActionsTours`` to
run one class.

The screenshots of the documentation are taken on demand, by tests that carry their own tag and
are left out of every other run::

    ... run --rm -e HR_ACTIONS_SCREENS=1 -v ./.cache/actions_screens:/mnt/shots odoo odoo \
        -d <db> -i web_enterprise,test_web_gantt,hr_attendance_gantt \
        --test-tags hr_attendance_gantt_actions_screens --screenshots /mnt/shots --stop-after-init

``HR_ROWS_SCREENS`` with the tag ``hr_attendance_gantt_screens`` does the same for the earlier
slice's pictures. The files are named ``actions-NN-<name>[-dark][.mobile].png`` and are copied to
``docs/assets/attendance_gantt/``.

**Tests that skip**, and when:

- ``test_hr_rows_screens`` (the screenshots of the rows) unless the environment variable
  ``HR_ROWS_SCREENS`` is set.
- ``test_actions_screens`` (the screenshots of this slice) unless ``HR_ACTIONS_SCREENS`` is set.
- ``test_actions_tours.test_a62_demo_marc`` unless the database has the demo user ``demo`` **and**
  Abigail Peterson's demo attendance lies on 11 November 2026 (a database created at that
  instant with ``tools/odoo_at_instant.py``, ``docs/modules/attendance_gantt.md``). Its stand-in
  for CI, ``test_a62_team_officer``, always runs.
- The dark probes of ``test_hr_rows_probes.py`` and ``test_actions_probes.py`` (their ``schemes``
  helper keeps the light scheme only) when ``web_enterprise`` is not installed; a probe that
  measures a dark value alone skips whole, with the message "the dark scheme needs web_enterprise".
  The probes of the Gantt framework in ``addons/test_web_gantt/tests`` (``test_probes.py``,
  ``test_drag_probes.py``, ``test_edit_probes.py``, ``test_multi_probes.py``,
  ``test_note_probes.py``, ``test_dependency_probes.py``, ``timeline_probe.py``) do the same.
- ``test_web_gantt``'s ``test_demo_install_has_host_records`` (``test_host.py``) on a database
  without demo data.

Installation
============

Nothing to do: the module installs by itself once the Attendances application
(``hr_attendance``) and the Employees timeline module (``hr_gantt``) are both
installed. It is not an application and adds no menu, group or setting.
Uninstalling it restores the management action's view modes and context, and the view
modes of My Attendances (``calendar,list,pivot,graph``).

Configuration
=============

None.

Usage
=====

Open Attendances > Management > Dashboard. The view opens on today, one row per
employee. See ``docs/modules/attendance_gantt.md`` for the ranges, the labels and the
colours.

The tool ``tools/odoo_at_instant.py`` starts a demo database at a fixed clock and
adds prepared records for the checks; it runs inside the project's container
(``docs/modules/attendance_gantt.md``, the developers' section).

Credits
=======

Authors: Complete contributors.

Written for Complete from a specification of the behaviour; no source of the
original application was used.

Licence
=======

AGPL-3.0-only.
