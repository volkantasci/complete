==================
Employees Timeline
==================

The bridge between the Employees application and the Gantt view. It holds the
employee variant of the Gantt view and a server helper that keeps employees
without records in the rows, for the modules that show records by employee.

User documentation: ``docs/modules/employee_gantt.md`` (written with the
feature).

Features
========

At this stage the module is an installable shell. The employee variant of the
view and the helper arrive with the next parts of this slice.

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

None on its own: other modules choose its view variant.

Credits
=======

Authors: Complete contributors.

Written for Complete from a specification of the behaviour; no source of the
original application was used.

Licence
=======

AGPL-3.0-only.
