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

- The employee variant of the Gantt view (``js_class="hr_gantt"``): avatar row
  headers and their card, the user's search passed to the server, the range
  chosen around today when today is shown, half-day diagonal shading and lunch
  rounding of pills.
- The server helper that keeps employees without records in the rows.

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
