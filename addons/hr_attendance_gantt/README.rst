====================
Attendances Timeline
====================

The bridge between the Attendances application and the Gantt view: the
attendances of the employees on a timeline, in one row per employee.

User documentation: ``docs/modules/attendance_gantt.md`` (written with the
feature).

Features
========

The Gantt view of the attendances is registered as the view variant
``attendance_gantt`` on top of the employee variant of ``hr_gantt``: one period
per range, the open attendances drawn up to the moment of loading, the hours
worked label and bar of each employee row (its long form follows the width of
the window), red names for employees without a contract and the Community's
empty-view helper under the grid.

Extension points for the next part of the slice (002d3): the renderer's
``onPillClick`` and ``onPillDoubleClick`` (the popover and the record dialog),
the editor's ``openRecord`` and creation path, all unchanged for now.

Installation
============

Nothing to do: the module installs by itself once the Attendances application
(``hr_attendance``) and the Employees timeline module (``hr_gantt``) are both
installed. It is not an application and adds no menu, group or setting.

Configuration
=============

None.

Usage
=====

None yet.

Credits
=======

Authors: Complete contributors.

Written for Complete from a specification of the behaviour; no source of the
original application was used.

Licence
=======

AGPL-3.0-only.
