# Attendances Timeline

The module `hr_attendance_gantt` puts the attendances of your employees on a
time grid: one row per employee, one pill per attendance. It is the first view
of the Attendances application to use the [Gantt View](gantt_view.md), and the
first place where the employee rows of the [Employees Timeline](employee_gantt.md)
show up. The grid, its ranges, the control bar and the phone layout are those of
the Gantt view; this page tells what the attendance view adds.

The module installs by itself when the Attendances application and the
Employees timeline module are both installed. It is not an application, and it
adds no menu, group or setting. Uninstalling it gives the Attendances menu its
old list view back.

Technical reference:
[`addons/hr_attendance_gantt/README.rst`](../../addons/hr_attendance_gantt/README.rst).

![The attendances of a day, light](../assets/attendance_gantt/01-day.png)

![The attendances of a day, dark](../assets/attendance_gantt/01-day-dark.png)

## Opening the view

Choose **Attendances > Management > Dashboard**. The menu shows for the
attendance groups **Officer: Manage all attendances** and **Administrator**.
The action opens on the Gantt view, which now comes first in the view switcher,
followed by List. The search bar starts with one facet, **Employee**, which is
the grouping of the view; the Community's own grouping by month is no longer
applied. The column over the row headers is titled **Days**.

The view opens on the **Day** range of today: one day, 24 hour columns, the
current hour lit. The pager counts employees, not attendances, and shows 20 of
them per page.

## The rows

Every employee gets a row, ordered by name, **also an employee who has no
attendance in the period**. That is what makes the view useful for spotting who
did not check in. Only active employees are listed, unless your search asks for
archived ones. The pager steps through the pages of employees.

![The second page of employees, light](../assets/attendance_gantt/11-page2.png)

The rows keep to your search. A search on the employee or on a field the
employee carries (the department, the manager, the attendance manager, the
working schedule), and the filters My Attendances, My Team, Active Employees
and Archived Employees, keep the empty rows of the employees that match. A
search on the attendance itself (a state filter, At Work, Errors, a date, the
check-in) leaves only the employees who have a matching attendance. The same
happens when you group by something other than the employee alone: the view
then shows only the groups that have attendances. Grouping by the department
alone gives plain rows, with no avatar, label or bar; grouping by the employee
first and something else after it keeps the avatars, but no name is red.

### Avatars and the card

Each row header starts with the employee's avatar and name. An employee with no
photo gets the generated avatar of the Community, a coloured square with the
first letter of the name. Pointing at the avatar or the name shows the full
name in a tooltip.

A click on an avatar opens the Community's **employee card** under it: photo,
name, job title, work email and phone, a **View Profile** button and whatever
the installed applications add (skills, for one). The card closes on a click
elsewhere or Escape. The click does not scroll the grid. A click on the name or
anywhere else in the header does what it does in every Gantt view: it scrolls
the grid to the first pill of the row.

![The employee card, light](../assets/attendance_gantt/02-card.png)

![The tooltip on an avatar, light](../assets/attendance_gantt/12-avatar-tooltip.png)

On a phone, a tap on an avatar opens nothing.

## Ranges: one period at a time

The range menu offers Day, Week, Month, Quarter, Year and Custom. Unlike other
Gantt views, a named range shows **one period**, not three: one day, one week
(starting on the first day of your language's week), one calendar month, quarter
or year. Previous and next move by one period. Today brings back the period of
today, or scrolls to today when it is already shown. The custom range works as
in the Gantt view.

**Around today.** When today lies inside the period on screen, choosing another
range builds it around today, whatever part of the period is scrolled into view.
On the Month range of November, for instance, choosing Week gives the week that
contains today. When today is not on screen, the new range is built around the
middle of what you see, as everywhere else.

The scales are fine-grained where it matters: the Day range works in quarter
hours, the Week range in quarter days, the Month range (and Quarter, which
uses it) in half days, and the Year range in whole months.

![A week, light](../assets/attendance_gantt/03-week.png)

![A month with half-day shading, light](../assets/attendance_gantt/07-month.png)

![A week at quarter-day precision, light](../assets/attendance_gantt/08-quarters.png)

### Pills

A pill runs from check-in to check-out. Its text is the code of the work entry
type and the duration, for example "A - 3h 30m". Every attendance of the
standard data has the same type, so every pill is the first colour of the
palette: light grey, and in the dark look the theme's neutral grey, with black
text. Moving, copying and resizing work as described in the Gantt view, with
the Undo notice.

An attendance that goes on over midnight is cut at the edges of the period, and
shows on both days. A pill on the Month range that lies on both halves of one
day can be drawn on one half only, the way a lunch break splits a working day:
on that range, a pill that ends by 14:00 sits on the morning half, and one that
starts at 11:00 or later, and starts nearer noon than it ends, sits on the
afternoon half. Which half is chosen changes only the drawing, never the
record. On the Week range, with its quarters of a day, no pill is rounded.

The dates of the pill are those of the browser's time zone, as in every Gantt
view.

### Open attendances

An attendance with no check-out yet (the employee is still checked in) is
drawn from its check-in up to **now**. Now is read once, when the data is
loaded, and the pill does not grow until the next load; its end is then
rounded up to the end of its column cell (on the Day range, the next quarter
hour). Its text is just the work entry type's code, without a duration. An
open attendance from an earlier day is drawn from the start of the period on
later days. A period that lies entirely in the future shows no open
attendance, and a period in the past shows an open attendance up to its end.

![An open attendance, light](../assets/attendance_gantt/09-open.png)

## Hours worked: labels and bars

At the right end of every employee row header is a label, and under the row a
thin bar, both telling how much the employee worked in the period against how
much they should have worked.

- **Worked.** The hours of the employee's closed attendances in the period. An
  attendance that crosses a boundary of the period counts only for the part
  inside it, with any break shared in proportion; so a night shift from 20:00
  to 08:00 gives 4 hours to the first day and 8 to the second. Open
  attendances do not count.
- **Expected.** The hours the employee's working schedule asks for over the
  period's own days, less the company-wide leaves (a public holiday on a working
  day lowers the week from 40 to 32 hours). A flexible schedule with hours per
  week is reckoned by whole weeks plus the remaining days, capped by the weekly
  hours. An employee whose schedule is fully flexible is expected 24 hours for each day
  of the period; nothing a user sees depends on it (the label shows the hours
  worked alone).

### What the label says

On a window **1400 px wide or more** the label gives both numbers and the
difference: "29h / 40h (11h left)" while the employee is under target,
"10h / 8h (+2h)" over it, and just "8h / 8h" at exactly the target. Hours and
minutes are written "3h 30m"; minutes appear only when not zero. A difference
that rounds to no whole minute shows no brackets at all.

**The label follows the window live.** When you resize the window across 1400
px, in either direction, the label changes its form on its own, within about a
second, without loading the data again. Below 1400 px (laptops, tablets and
phones) only the bracket's content is shown without the brackets: "+2h",
"4h 30m left", or the hours worked alone ("8h", "0h") when there is nothing to
add. Only the label's text changes; the bar, the row heights and the tooltip
do not.

### Colours

| Situation | Label | Bar |
|---|---|---|
| Under 100 % of the expectation | muted | green, filled to the share worked |
| Over 100 % and under 200 % | warning colour | full, amber |
| 200 % or more | danger colour | full, red |
| Nothing worked, but the employee is tracked by attendances | warning colour | empty |
| Fully flexible schedule | muted, hours only | none, and no tooltip |

A fully flexible employee who is also tracked by attendances still gets the warning
colour, as nothing is expected and nothing counts. Resting the pointer on the
label or the bar shows a tooltip such as "29h/40h (72%)", with the percentage
rounded to the nearest whole number. It has no tooltip when nothing is
expected.

![The label states, light](../assets/attendance_gantt/06-labels.png)

![The tooltip of the bar, light](../assets/attendance_gantt/05-tooltip.png)

Labels and bars are shown to internal users only; other users see rows without
them.

### Employees without a contract

The name of an employee who has **no contract overlapping the period** is red.
A contract that ends during the period does not turn the name red; the days
after its end are grey instead. The red name is shown only when the view is
grouped by the employee alone.

## Unavailable cells and folded columns

Cells where an employee is not available are grey. The view reads the
employee's contract and working schedule:

- Outside the employee's contracts, and for a whole period with no contract,
  everything is grey.
- On the days of a contract the working schedule decides. A schedule with
  whole working days greys the days off (weekends, typically). A schedule with
  hours greys everything but the working hours: for a day of 8 to 12 and 13 to
  17, the night, the lunch hour and the evening are grey. A flexible schedule
  has no grey day at all, weekends included.
- The public holidays of the working schedule are grey for everyone on it.

The schedule's hours are read in the employee's own time zone and shown at the
same clock time in the time zone of the user's preferences; the browser then
draws them in its own zone.

On a scale with half-day precision (the Month range) a cell whose two halves
differ is split by a **diagonal**: the available half in one triangle and the
grey half in the other, the grey afternoon in the upper-left one. On other
scales cells keep the vertical halves or quarters of the Gantt view.

![Diagonal shading in a month, light](../assets/attendance_gantt/07-month.png)

### Folding

When every employee row of the page is unavailable for a whole column, and no
pill touches that column, the run of such columns folds into one narrow column
with two small arrows. With the standard data, the Week range folds Saturday and
Sunday, and the Month range folds each weekend pair. A flexible employee on the
page, or a pill on a weekend, prevents any folding. Click a folded header or cell
to open the run. A click with Ctrl does the same, and a click with Shift does
nothing, because this view has no multiple selection.

**The folding is worked out at every load.** It is worked out again whenever
the data of the view is loaded: when the view first opens, at every change of
range, scale or period, and also after a search, a filter, a change of
grouping, a step of the pager and the reload after a change. A column you opened
by hand stays open until the next load. The same page therefore always looks
the same, however you got to it. On the Day range, a page where every row is
grey all day folds its 24 hour columns into one column as wide as the grid.

![An opened folded column, light](../assets/attendance_gantt/04-unfolded.png)

## When nothing shows: the empty-view helper

When the page has **at most one row and that row has no attendance** (a search
on one employee who has not checked in, an unmatched search, a period with
nothing in it), the view shows the helper of the Attendances application, in its
own wording: onboarding for an attendance officer or above who is also an Employees officer, a
short note for others. It is laid over
the grid from 115 px below the top of the view, so the row stays visible and can
still be clicked through it, and it stretches to the bottom of the window. On a
phone, the helper takes the place of the grid instead. Two or more rows never
show it, even if none has an attendance.

![The helper over one empty row, light](../assets/attendance_gantt/10-helper.png)

![The helper over a folded page, light](../assets/attendance_gantt/13-helper-folded.png)

The folded column in the second picture is the result of the rule above: the
only row is grey all day, so the page folds right after the search.

## On a phone

Below the small-screen breakpoint the view is the phone layout of the Gantt
view. The row header column is narrower, the names are cut with an ellipsis and
the label always takes its short form. The pager sits in the control panel, and the search facets show once the search
bar is opened with its button. A tap
on an avatar opens nothing.

![The attendances on a phone, light](../assets/attendance_gantt/01-day.mobile.png)

![The label states on a phone, light](../assets/attendance_gantt/06-labels.mobile.png)

![The helper on a phone, light](../assets/attendance_gantt/10-helper.mobile.png)

## Who sees what

The bridge adds no group, access right or record rule.

- **Rows.** A user sees a row for each employee whose attendances they may
  read, also an employee who has none. An attendance officer sees the employees
  they manage and themselves; a user with own attendances only sees their own
  row. In the standard data, Marc Demo, who manages four employees, sees five
  rows.
- **Hours.** Labels and bars sum the attendances the user may read. Other
  users than internal ones see none.
- **Schedules, contracts and leaves** are read by the server for every row on
  the page, with the rights of the system, because these users cannot read them
  themselves. They are used only to grey cells, to work out the expectation and
  to redden names.
- **The card** opens on the employee's public record, which every internal user
  may read.
- **The menu.** The Management menu is shown to officers and administrators. The
  action itself belongs to every user of the attendance groups, and its address
  opens it for them too. What each role may do in the view is in "What each role
  may do" below.

## Where the view is reached

The Gantt view shows in three places of the Attendances application and the
Employees application.

- **Attendances > Management > Dashboard**, as described above (officers and
  administrators).
- **Attendances > My Attendances.** The Community calendar of your own
  attendances stays the first view and the default. The view switcher then offers
  Calendar, Gantt, List, Pivot and Graph, in that order; on a phone the switcher is
  the Community's one-button menu with the same five entries. The Gantt view is the
  attendance view of this page, with one row: your own employee, which gets a row
  also when you have no attendance in the period. No facet shows in the calendar,
  list, pivot or graph, and the Gantt view shows the "Employee" facet. A user with
  no employee gets the Community's notice that they have no employee in the current
  company, and the Gantt view shows one unnamed empty row and the helper.
- **The worked-hours button of an employee.** It opens the Community list
  "Attendances This Month", and the view switcher then offers List (the default) and
  Gantt. See "The monthly view" below.

![My Attendances, its calendar](../assets/attendance_gantt/actions-01-my-calendar.png)

![My Attendances, its Gantt view](../assets/attendance_gantt/actions-02-my-gantt.png)

The management action opens with one search default, the **Employee**
grouping. In the Gantt views of the management action and of My Attendances the
search menu does not offer the Community's "Date" grouping (the one by month of
check-in); the list, calendar, pivot and graph views still do. "Custom Group"
still lists the date fields, and choosing one of them changes nothing in the
rows (the facet shows).

![The search menu](../assets/attendance_gantt/actions-09-search.png)

## What you do in the views

### Opening an attendance

A click or a tap on a pill, or a press and release on one of its ends without
moving, opens the attendance in a dialog at once, with the Community's form for
creating an attendance and its own footer: **Save & Close** (when you may edit
the attendance), **Discard** and, at the right end, **Delete** (for a manager of
the attendance; it deletes without asking). There is no popover. The first click
on an attendance locks it for 200 ms, so a double click or two quick taps open
one dialog, and no click opens a second dialog while one is opening or open. A
click on the dialog's backdrop does nothing. When the dialog closes, whichever
way, the view loads its data again and stays on the same range, period and scroll
position, so the labels, the bars and the folding are worked out again; an
attendance that does not match the search is saved but not shown.

On a phone the dialog fills the screen.

![The record dialog](../assets/attendance_gantt/actions-03-open.png)

![One dialog after two quick clicks](../assets/attendance_gantt/actions-04-one-dialog.png)

### Creating an attendance

For a user who may create attendances, a click on an empty cell of a row opens
the creation dialog ("Create") with the row's employee and the cell's period: the
hour on the Day range, the day on the Week and Month ranges, the month on the
Year range. A press dragged over empty cells of one row proposes the dragged span
at the scale's precision. The New button opens the dialog with your own employee
and the period of the range (the Day range: today, 0:00 to 0:00 of the next
day). Nothing happens when you click an empty cell and have no right to create
(no role), and the pointer resting on a cell shows nothing.

**The check-out proposal.** On every range but the Day range, the dialog proposes
the check-out as the check-in plus the employee's hours per day (8 hours on the
demo schedule), also for a span dragged over several days, and again every time
you change the check-in; it never does so when you empty the check-in. The hours
are those of the working schedule in effect on the check-in's UTC date, read with
the rights of the system. An employee with no hours per day (a fully flexible
schedule) or none at all gets a check-out equal to the check-in. A
Custom range takes the rule of its length (three days: the Day scale, no
proposal; ten days: the Week scale, the proposal). An attendance opened from a
pill never gets the proposal.

![Creating on the Week range](../assets/attendance_gantt/actions-08-create-week.png)

### The contract warning and its link

When the employee has no contract on the attendance's day, a line under the
status bar of the form says so, in the dialog, in the full-page form of an
attendance and in the form of My Attendances. It is worked out again as you change
the employee or the check-in. The day is the calendar day of the check-in in the
employee's time zone (a check-in with no value counts as today), and an employee
who is not set shows no warning. For an Employees officer the line ends with the
link **Correct employee**, which opens the employee's form in the main window as a
next step of the breadcrumb.

In a dialog the link saves nothing: the dialog closes and its record is not
created, or its changes are dropped. On a full-page form the link leaves the form
as any navigation does, which first saves the valid changes. The breadcrumb's earlier
step brings the view back on its range, with its data loaded again.

![The warning and its link](../assets/attendance_gantt/actions-05-warning.png)

![The same dialog for an employee with a contract](../assets/attendance_gantt/actions-06-plain.png)

![The employee form after the link](../assets/attendance_gantt/actions-07-link.png)

### Moving, resizing and copying

Dragging a pill moves it and dragging one of its ends resizes it, as in every
Gantt view: the notification with Undo shows, a pill cut by the period's edge cannot
be moved, and its uncut end can be resized. The Community's rules decide the write:
an attendance may not overlap another of the employee, nor end before it starts, a
move to another employee's row is allowed only to that employee, an administrator
or the attendance manager, and a validated attendance may be refused. A refusal
shows the Community's own error dialog, and the pill goes back. Holding Ctrl while
dragging asks for a copy, which the Community refuses (an error dialog; nothing
is created or moved). A user who may not edit the attendance sees no handle,
and a drag leaves the pill in place.

The Community's time rules (Attendances configuration) can split an attendance
after a write; Undo then writes the first part back and keeps the part the
Community created, marked for review. The demo data never meet a rule.

**An open attendance.** Moving it writes the check-in only, so it stays open (it
is drawn from the new check-in to now, and not at all while the new check-in is after
now). Dragging its start writes the check-in. Dragging its end writes a check-out
of the instant now plus the sub-columns of the drag, with the seconds of now (so the
attendance is closed, and the check-out may lie in the future). Undo after a move
or an end drag gives the earlier check-in back and empties the check-out: the
attendance is open again.

![A pill being dragged](../assets/attendance_gantt/actions-13-dragging.png)

![After the move](../assets/attendance_gantt/actions-14-dragged.png)

![An open attendance after a move](../assets/attendance_gantt/actions-15-open-moved.png)

### The contract filters

For officers (Team, All and Administrator) the search menu of the management
action and of My Attendances has a section of its own after the Date filter, with
**Ongoing Contract** and **No Active Contract**. They keep the attendances of
the employees who have, or have not, an active contract today: a version whose
contract started before tomorrow and whose end is empty or on or after today. Today
is the date in the time zone of the user's preferences, read from the server's
clock when you search, and the displayed period plays no part. Choosing both keeps
everything. With the Employee grouping every matching employee gets a row, also
without attendances (the seven demo employees with no contract for No Active
Contract).

The monthly action uses another Community search view and has no contract filter.

![The filter No Active Contract](../assets/attendance_gantt/actions-10-no-contract.png)

### The monthly view

On the form of an employee (and on the public profile that users without the
Employees group see) the worked-hours button opens "Attendances This Month". Its
Gantt view opens on the Month range with the Community's attendance overview
above the grid: one card for each work entry type, with the sum of the
hours of closed attendances that overlap the displayed period (for example "29h
Work"), loaded again at every change of the period and after every reload. The grid
has one unnamed row without header text, avatar, label or bar. Every way of creating
there (a click on a cell, a drag, the New button) proposes the employee of the form
the button was clicked on, not your own, and the check-out proposal and the contract
warning follow that employee. Who reaches another employee's monthly view follows the
Community's rule for the button: All and Administrator for every employee, Team for the
employees they manage, everyone else for themselves.

![The monthly action's list](../assets/attendance_gantt/actions-11-monthly-list.png)

![The monthly Gantt view](../assets/attendance_gantt/actions-12-monthly.png)

![The monthly Gantt view on a phone](../assets/attendance_gantt/actions-12-monthly.mobile.png)

## What each role may do

The module adds no group, access right or record rule; the Community's
groups decide. A control that a role may not use is absent, not disabled.

| | No role | Self | Team | All | Administrator |
|---|---|---|---|---|---|
| Attendances in the home menu | no | yes | yes | yes | yes |
| Menus of Attendances | none | My Attendances | none | My Attendances, Management, Kiosk Mode, Reporting | those and Configuration |
| My Attendances by its address | own row | own row | own row | yes | yes |
| Management action by its address | own row | own row | the employees they manage | every employee, 20 to a page | every employee |
| The contract filters | no | no | yes | yes | yes |
| The Date grouping | hidden | hidden | hidden | hidden | hidden |
| New button, creating from a cell | no | for their own employee | for their employees | yes | yes |
| Moving and resizing | no | their own, while not validated (when the company validates) | their employees' | all | all |
| Footer of the record dialog | Discard only, read-only form | Save & Close, Discard | with Delete | with Delete | with Delete |
| Validate and Refuse in the status bar | no | no | yes | yes | yes |
| The warning | yes | yes | yes | yes | yes |
| The link "Correct employee" | only with the Employees "Officer" group | the same | the same | the same | yes |

A user with no attendance role who clicks an empty cell sees nothing happen. A
write that the Community's rules refuse (a user moving an attendance that is
validated) shows the Community's access error and the pill goes back.

![A user with no attendance role](../assets/attendance_gantt/actions-16-role-none.png)

Every image above also exists in a dark variant (suffix `-dark`) and, for most, a
phone variant (suffix `.mobile`) in `docs/assets/attendance_gantt/`.

## Known differences

- **The phone dialog's left line.** On a Complete dialog at 390 x 844, in light
  and in dark, there is no 1 px line along the dialog's left edge: its
  `border-left` is 0 and its `box-shadow` is `0 8px 16px 0`. The original draws that
  line in the border grey. It belongs to the shell and the theme (`web_enterprise`),
  which draw every dialog, and not to this module (spec IQ1, M97); a later slice
  of the theme can add it.
- **The overview card in the dark look.** The card of the monthly view is the
  Community's component in whatever colour the theme gives its colour class in dark;
  its dark colour is not compared (decision D6).
- **Where the original is not copied.** Two clicks on one pill open one dialog;
  moving an open attendance leaves it open and Undo opens it again; a creation in the
  monthly view proposes the employee of the form; and the available quarters and halves
  of a cell that is partly grey follow the direction of the grid in a right-to-left
  language.

## For developers

The module adds one Gantt view record on `hr.attendance`, changes the management
window action, and registers the view variant `attendance_gantt` in the
browser; it adds no model and no stored field. The Python side overrides the
model's data call, the unavailability hook and the progress hook. The
description of the clicks and of the extension points used is in the
[README](../../addons/hr_attendance_gantt/README.rst); the extension points
themselves are in [Gantt View](gantt_view.md#extension-points-for-view-variants).
The view also adds, with the tour and probe tests, a database migration
(version 20.0.1.1.0, described in the README) and the Python of the contract
warning, the contract filters and the check-out proposal.

### The demo database at the project's instant

The standard demo data places attendances and contracts around the day it is
installed, so a database that has to show the same thing every time must be
created while the server's clock reads a given instant. The tool
[`tools/odoo_at_instant.py`](../../tools/odoo_at_instant.py) does that, and also
checks and extends such a database. It starts Odoo with the clock set at the
instant you give, and the clock runs on from there.

**It runs inside the project's container only.** It imports Odoo and its test
clock library, reads the database settings from the container's environment
(`HOST`, `PORT`, `USER`, `PASSWORD`) and finds the prepared-record builders in
the attendances bridge under `/mnt/extra-addons`. A Python of the host has none
of this. Mount `tools` read-only into the container, as the commands below do.
Every command is one plain `podman compose` command from the root of the
repository, after `docker/.env` has been created as the
[module authoring guide](../module-authoring.md#start-from-the-scaffold)
describes. Replace `DB` with the name of the database (the verifier of slice 002d3 uses `demo002d3`).

Create a database with demo data while the clock reads 11 November 2026,
10:00 UTC (the time is UTC unless it carries a zone):

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm -v ./tools:/mnt/instant:ro odoo python3 /mnt/instant/odoo_at_instant.py --at 2026-11-11T10:00:00 -- -d DB -i web_enterprise,test_web_gantt,hr_gantt,hr_attendance_gantt --with-demo --stop-after-init
```

Everything after `--` is the Odoo command line. The module list is the one the
tool was checked with; `hr_attendance_gantt` brings Attendances, Employees and
both bridges. The demo data need the clock while the database is created; the
server is then started under the same clock (below), so that its pages read the
same day as the package's scenarios.

Check that the demo data came out as expected. The command lists every employee
with schedule, time zone, contracts and attendances, then one line `DIFF ...`
for each difference from the expected table, and `differences: N`. It exits with
status 1 when there is a difference; employees whose name starts with "Gantt "
are shown but not compared.

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm -v ./tools:/mnt/instant:ro odoo python3 /mnt/instant/odoo_at_instant.py check-demo -d DB
```

Add the **prepared records**, ten employees named "Gantt ..." with their
working schedules and attendances, which show the states the demo data lacks
(over and under target, an open attendance, an hourly schedule, lunch rounding).
The command removes earlier prepared records first, so it can be run again, and
prints the record counts before and after. `--night` adds an attendance across
the end of a month (A64), `--holiday` adds a company-wide leave on 12 November
(A62), and `--differences` adds "Gantt Above" and "Gantt Under", whose
attendances differ from the target by ten seconds (A68). All three are optional:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm -v ./tools:/mnt/instant:ro odoo python3 /mnt/instant/odoo_at_instant.py prepare -d DB --night --holiday --differences
```

Remove them again, with their employees, schedules and the holiday:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm -v ./tools:/mnt/instant:ro odoo python3 /mnt/instant/odoo_at_instant.py unprepare -d DB
```

Start the server on that database with the clock started at the instant and
running on, published on port 8069 (the server answers at
`http://localhost:8069`). Run it in the background or in its own terminal:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm -p 127.0.0.1:8069:8069 -v ./tools:/mnt/instant:ro odoo python3 /mnt/instant/odoo_at_instant.py --at 2026-11-11T10:00:00 -- -d DB
```

Stop it by name: `podman ps` lists the run container (its name looks like
`docker-odoo-run-c38678dc7f23`), and

```
podman stop CONTAINER
```

stops it; `--rm` removes it.

Drop the database, under the same clock as the other commands:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm -v ./tools:/mnt/instant:ro odoo python3 /mnt/instant/odoo_at_instant.py --at 2026-11-11T10:00:00 -- db drop DB
```

`prepare` and `unprepare` work as the administrator and commit their changes.
`prepare` needs Attendances installed in the database. The tool also re-points
the clock of the XML data evaluator, which would otherwise keep the real day, so
that contracts which end "today" end on the instant's day; it relies on how this
Odoo release lays that evaluator out, and fails at start with an import error,
not silently, if a later release moves it.

### Records of the slice's scenarios

The prepared records of the earlier slice come from `prepare` as above (add
`--night`, `--holiday` and `--differences` as the scenario asks). `prepare` makes
the working schedule "Gantt Late" with the others, and does not create anything
else of this slice: it has no role users, no "Gantt Moved" and no
"Gantt Afternoon". The administrator creates them in the user interface of the
database, and removes them after the scenario (by name, archived ones too, with
their attendances):

| Record | How it is made |
|---|---|
| Role users `gantt_none`, `gantt_self`, `gantt_team`, `gantt_all`, `gantt_allhr` (password equal to the login) | Settings > Users, one user for each; the groups are set explicitly and replace what a new user gets by default: only the internal user role for `gantt_none`; the Attendances "Self Attendance Edit" for `gantt_self`; "Officer: Manage attendances" for `gantt_team`; "Officer: Manage all attendances" for `gantt_all`; the same and the Employees "Officer: Manage all employees" for `gantt_allhr`. Time zone Europe/Brussels. |
| Their employees | One employee of the same name for each, linked to the user: schedule "40 hours/week", contract from 1 January 2026 with no end, time zone Europe/Brussels. A sixth employee, "Gantt Role Peer", has no user. For `gantt_team` only, set the user as the attendance manager of both employees (which gives the user the Team group; do it for no other role). |
| Their attendances | One attendance of each of the two employees on 11 November 2026, 07:00 to 09:00 UTC. |
| "Gantt Moved" | An employee with the schedule "40 hours/week", contract from 1 January 2026, Europe/Brussels, and one **open** attendance checked in on 11 November 2026 at 07:00 UTC. |
| "Gantt Afternoon" | An employee with the schedule "Gantt Late" (made by `prepare`), a contract from 1 January 2026, Europe/Brussels, and no attendance. |

The tests make the same records with their fixtures, `make_role_users`,
`make_gantt_moved` and `drop_actions_records` in
`addons/hr_attendance_gantt/tests/actions_fixtures.py` and `make_prepared(...,
afternoon=True)` in `hr_rows_fixtures.py`, which is how CI works (no demo data).

### Values that depend on the server's clock

While the server runs under the instant's clock, two things read the server's
"today" and no other: the contract filters (the date of today in the user's
time zone) and the monthly action (its domain asks for the check-ins of the current
month of the employee). Run the scenarios of the filters (No Active Contract and
Ongoing Contract, also with another time zone in the user's preferences) while the
clock reads between 11 November 2026 10:00 UTC and 12 hours later, and the monthly
view while it reads November 2026. The browser's clock decides the rest (the
"now" of open attendances, the lit hour and column), and the verifier's browser reads
Wednesday 11 November 2026, 11:00, Europe/Brussels. The tests fix both: the Python
tests freeze the server's clock (`freeze_time`, and `action_in_november` of the fixtures
for the monthly action), and the tours and probes fix the browser's clock and time zone.
