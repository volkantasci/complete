==================
Employees Timeline
==================

The bridge between the Employees application and the Gantt view. It holds the
employee variant of the Gantt view and a server helper that keeps employees
without records in the rows, for the modules that show records by employee.

User documentation: ``docs/modules/employee_gantt.md``.

Features
========

The employee variant, ``js_class="hr_gantt"``
---------------------------------------------

A Gantt view definition chooses the variant with its ``js_class`` attribute. The
variant behaves as the Gantt view, with these changes:

- Where a row stands for an employee (a many-to-one field to ``hr.employee`` or
  ``hr.employee.public``), the row header shows the employee's avatar and name,
  at every level of a grouping, and not on the empty-value row. A click on the
  avatar opens the employee card from the Messaging module, on the public
  employee record, when the screen is 768 px wide or more; below that it opens
  nothing. The click never reaches the row header.
- The user's own search conditions (filters, search field, favourites, without
  the action's domain, the grouping and the period) are sent with every data call
  in the context key ``user_domain``.
- A named range chosen from the range menu is built around today when today lies
  inside the period that is loaded; otherwise the Gantt view's choice (the middle
  of the visible part) stands. Custom ranges, previous, next and Today are
  unchanged.
- A cell whose two parts differ in availability is shaded along a diagonal (a
  hard-edged gradient at 325 degrees) in any column with exactly two parts.
- At half-day precision, a pill that covers exactly the two halves of one day is
  drawn on one half by the lunch rule: the afternoon half when it starts at 11:00
  or later and the start is the nearer to noon, else the morning half when it
  stops at 14:00 or earlier, else both. At any other precision no pill is
  rounded. The record is not changed.

The server helper ``_get_gantt_data_with_empty``
------------------------------------------------

Defined on every model. It answers the Gantt data call (the arguments of
``get_gantt_data``) with one group for **every record of the related model that
matches the search**, also those with no record of the view's model in the period.
A model calls it from its own ``get_gantt_data``; the Attendances bridge does.

- The condition of the call (the user's search, the period and the model's read
  rule, joined by "and") is turned into a condition on the related model. A
  condition on the relation, or on a field reached through it, becomes a condition
  on the related record; so does a condition on a field of the view's model that is
  a related field going through the relation. Negations are first moved down to the single
  conditions. A condition that cannot be converted is replaced by the value that
  leaves its operator unchanged: true inside an "and", false inside an "or"; an
  operator none of whose parts can be converted says nothing and is left out of
  its parent.
- The context key ``user_domain`` is what the browser's variant sends. A model
  reads it to decide whether every condition of the user's search concerns the
  related record (``_hrg_concerns_only(domain, field_name)``) before it chooses the
  helper.
- The related records are searched **with the user's own rights**, in their model's
  default order (employees by name), with the call's limit and offset. Archived
  records are listed only when the converted condition names ``active``. The
  call's total is the number of matching related records.
- The records of the view's model are read for the page's related records only,
  and the unavailability and progress hooks are asked for every group of the page,
  those without records included.
- It accepts a grouping by exactly one field that is a relation, to one record or
  to many. It raises a user error for no grouping, several fields, a field that is
  not a relation, and a call without the start and stop of the period.

No menu, action or view
-----------------------

The module adds no menu, window action, view, group or setting. Another module
chooses its variant in a view definition.

For developers of later modules
===============================

A module of a later part (the time off bridge, the attendance bridge) builds on
the variant by extending its classes and registering its own entry with
``registry.category("views")``. The names below are the places meant to be
overridden. Each of them is documented where it is defined.

Model (``EmployeeTimelineModel``, a ``TimelineModel``)
  - ``_readUserDomain(searchParams)``: the conditions sent as ``user_domain``.
  - ``_request(range, offset)``: the data call; the variant adds the context key.
  - ``_focusForKind(kind)``: the date a named range is built around (the hook of
    the Gantt view).
  - ``_spanOf(record)``: the sub-columns a record covers (the hook of the Gantt
    view); the lunch rule is applied through it.

Renderer (``EmployeeTimelineRenderer``, a ``TimelineRenderer``)
  - ``rowLeadTemplate``: the template that comes before the name in a row header;
    here ``hr_gantt.EmployeeRowLead`` (the Gantt view's slot).
  - ``employeeOf(descriptor)``: the employee a row stands for, ``{id, name}``, or
    null.
  - ``nameClass(descriptor)``: extra classes of the row's name (the attendance
    variant adds the danger colour).
  - ``avatarUrl(employee)`` and ``onAvatarClick(ev, employee)``: the image and the
    card.
  - ``partialCellStyle(covered)``: the style of a partly unavailable cell (the
    hook of the Gantt view); a cell with two different halves also gets the class
    ``o_hrg_split``.

Pure helpers in ``employee_layout.js`` (``lunchRoundedParts``,
``diagonalBackground``, ``isHalfDayPrecision``) carry the rules and can be tested
alone. The template ``hr_gantt.EmployeeTimelineRenderer`` inherits the Gantt
grid and puts the avatar and the name in one box, ``o_hrg_identity``, in an
employee row's title line.

Installation
============

Nothing to do: the module installs by itself once the Employees application
(``hr``) and the Gantt view (``web_gantt``) are both installed. It is not an
application and adds no menu, action, view, group or setting.

Configuration
=============

None.

Usage
=====

None on its own: other modules choose its view variant. See
``docs/modules/attendance_gantt.md`` for the first view that does.

Credits
=======

Authors: Complete contributors.

Written for Complete from a specification of the behaviour; no source of the
original application was used.

Licence
=======

AGPL-3.0-only.
