====================
Attendances Timeline
====================

The bridge between the Attendances application and the Gantt view: the
attendances of the employees on a timeline, in one row per employee.

User documentation: ``docs/modules/attendance_gantt.md``. The employee rows come
from ``hr_gantt`` (``docs/modules/employee_gantt.md``).

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

For the next part of the slice (002d3)
======================================

The module leaves the following places for a later module to change what a click and
the creation do. They are unchanged now.

- ``AttendanceTimelineRenderer.onPillClick(ev, pill, row)``: a click or a tap on a
  pill; it opens the popover of the Gantt view.
- ``AttendanceTimelineRenderer.onPillDoubleClick(ev, pill)``: a double click; it
  opens the record dialog through the editor.
- ``props.editor.openRecord(resId)`` (the Gantt editor): opens the record dialog,
  and the creation path of the editor (a cell, a drawing across cells, the New
  button) opens the create dialog. Both take the form of the dialog from the
  view's arch.

The variant is a plain object, ``attendanceTimelineView`` in
``attendance_timeline_view.js``; a later module extends the renderer class, registers
its own entry (for the monthly view, for instance) and chooses it with ``js_class``.

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

Installation
============

Nothing to do: the module installs by itself once the Attendances application
(``hr_attendance``) and the Employees timeline module (``hr_gantt``) are both
installed. It is not an application and adds no menu, group or setting.
Uninstalling it restores the management action's view modes and context.

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
