# Time Off Timeline

The module `hr_holidays_gantt` puts the time off of your employees on a time
grid: one row per employee, one pill per request. It is the bridge between the
Time Off application and the [Gantt View](gantt_view.md), and it builds on the
employee rows of the [Employees Timeline](employee_gantt.md). The grid, its
ranges, the control bar and the phone layout are those of the Gantt view; this
page tells what the time-off views add.

The module installs by itself when Time Off, Import and the Employees timeline
module are installed. It is not an application and adds no menu, group or
setting. Uninstalling it gives Time Off its old screens back (see
[Uninstalling](#uninstalling)).

Technical reference:
[`addons/hr_holidays_gantt/README.rst`](../../addons/hr_holidays_gantt/README.rst).

![The leave view on the Month range, light](../assets/time_off_gantt/01-month.png)

![The leave view on the Month range, dark](../assets/time_off_gantt/01-month-dark.png)

## In this release: reading, not editing

This release **shows** time off. A leave is still opened, changed, approved,
refused and created in the other views of Time Off (the list, the kanban, the
calendar, the request form and the Community dashboard). In the Gantt views
themselves these inputs do nothing yet: a click or a tap on a pill, a double
click, a drag or a resize of a pill, a click or a drag on empty cells, and the
selection of several cells. No popover opens, no dialog opens, nothing is
written and nothing is highlighted. The Gantt view takes these inputs in a later
release.

What does work in the views: the search and its filters, the grouping, the range
menu, the previous, next and Today buttons, the pager, the folding of columns,
the click on an avatar (the employee card), the click on a row header (it scrolls
to the first pill of the row) and the gear menu.

## Two views, and who reaches which

The module adds two Gantt views.

- **The leave view** shows time off requests, one pill per request.
- **The report view** shows the Community's time-off report, one pill per
  request too, and reads the same for every employee. It cannot write anything.

The menu **Time Off > Overview** chooses by role each time you click it.

| Your role | Overview opens | Also reached |
|---|---|---|
| Officer (Manage all requests) or Administrator | the leave view | Management > Time Off, with the Gantt button last in its switcher |
| Employee, Approver, or Manager of an employee | the report view, with Calendar as its second view | Approvers also have Management > Time Off, in which they see the requests they may read |
| No Time Off group | the Community's access error | Time Off is not in their home menu |

For an Officer or Administrator the Overview opens the leave view alone, with
the title "All Time Off", the grouping by employee as its only facet and no
other search default. Requests that are Refused or Cancelled are not listed
there. Management > Time Off is the Community list action with a Gantt view
added after its other views (List stays the default); its Gantt view lists every
state, and starts with the action's own filters (Waiting For Me and the current
year).

![The report view, light](../assets/time_off_gantt/04-report.png)

The report view and the leave view differ in a few more ways.

| | Leave view | Report view |
|---|---|---|
| Header over the row names | Days | Time Off |
| Ranges | Week, Month, Quarter, Custom | Day, Week, Month, Quarter, Year, Custom |
| Pill colour | the colour of the leave type | the colour of the employee |
| Marks on pills | striped with an info mark for requests waiting for approval; a danger mark for Refused; a secondary mark for Cancelled | none |
| Hours label | yes, for internal users | none |
| Gear: Import and Export | yes, on a wide screen | none |
| Sample data | none | when the report holds nothing at all |

The report view's Week range works by half days, so a leave of half a day is
drawn on half of its day there, and the lunch rounding of the attendance views
applies. When you have 50 employees or more to read, the report also opens with
the filter **My Team** (if you manage someone) or **My Department**, so that the
first page is not the whole company.

## Ranges

Like the attendance views, each named range shows **one period**: one week
(from the first day of your language's week), one calendar month, one quarter.
Previous and next move by one period, and Today brings back the period of
today. The leave view opens on the Month range. When today lies inside the
period on screen, choosing another range builds it around today. The custom
range works as in the Gantt view. The columns of the leave view are whole days;
no pill is rounded.

![The Week range, light](../assets/time_off_gantt/02-week.png)

![The Quarter range, light](../assets/time_off_gantt/03-quarter.png)

## The pills

A pill runs from the first to the last day of the request.

| Who reads | On the Month and Quarter ranges, a request of one day or less | Otherwise (for example on the Week range) |
|---|---|---|
| Officer, Administrator | the duration alone: "1d", "0.5d", or "04:00" for a request in hours | the type's code (its name when it has no code), a space and the duration: "PTO 4 days", "TH 04:00" |
| Anyone else | the duration alone | the duration alone: "4 days", "1 day" |

A request of one day or less therefore reads its duration alone on the Month
and Quarter ranges, **whatever the search holds**. This includes the searches
on the request itself, as the default filters of Management > Time Off (Waiting
For Me, a state, a type, a date). The view tells the server which range it shows
with every load, with or without such a condition, so a one-day request does not
change its text when you add a filter.

Without the grouping by employee (you removed it, or you chose another
grouping), the pill has the Community's long text instead: the employee, the type
and the dates; no avatar, label or unavailable cell is then drawn.

The colour of the leave view's pill is that of the leave type; the text is black.
The states that are shown:

| State | Overview (leave view) | Management > Time Off | Report view |
|---|---|---|---|
| To Approve, Second Approval | shown, striped, info mark | shown, striped, info mark | shown, plain |
| Approved | shown | shown | shown |
| Refused | not shown | shown, danger mark | not shown |
| Cancelled | not shown | shown, secondary mark | not shown |

![The states of a leave in Management > Time Off, light](../assets/time_off_gantt/12-states.png)

## The rows

Which employees get a row depends on what you search.

- **A search on employees.** With the grouping by employee alone and a search
  that concerns only the employee (the name, the department, the manager, the
  schedule, My Team, My Department, or no search at all), **every matching
  employee has a row**, also one with no leave in the period. The rows are
  ordered by name, 20 to a page, and the pager counts employees ("1-20 / 22").
- **A search on the requests.** With a condition on the request itself (a state
  filter, Waiting For Me, Missing Document, a type, a date), or with another
  grouping, or several, **only the employees who have matching requests** get
  rows. The same is true in the report view for a search on the report's
  department, which belongs to the request, and not to the employee. A search
  on the report's job position or company is a search on the employee and keeps
  the empty rows.
- Only active employees have rows.
- What you may see: every employee with a Time Off group may read the list of
  employees, so the report view shows all of them. In Management > Time Off an
  Approver gets rows only for the employees whose requests the Community lets
  them read (the ones they approve, and themselves).

Grouping by something other than the employee alone (the type, the status)
gives plain rows with no avatar; grouping by the employee first and something
else after keeps the avatars. The search menu of the leave view does not offer
the Community's grouping by Date, because a Gantt view cannot be grouped by the
date it is laid out on.

![A search on the request, light](../assets/time_off_gantt/15-filter-month.png)

## Unavailable days and flexible schedules

Days on which an employee is not available are grey, as in the attendance views.
The module takes them from the Community's own computation, which comprises:

- the days outside the employee's contracts (an employee with no contract is
  grey on the whole period);
- the days off and hours off of the working schedule;
- the company-wide leaves;
- the employee's **approved** leaves. A request that waits for approval, or that
  is refused, makes nothing grey.

Both leave views draw whole days: a day is grey only when the whole day is
unavailable, so a half day or a few hours of leave grey nothing there. The
report view does the same on its Month and Quarter ranges, and shows half days
on its Week range.

**Flexible schedules.** An employee whose working schedule has no fixed hours
has no grey day of their own, weekends included, but an approved leave still
greys what it covers. The module sets that by the request's unit, in the
employee's time zone:

- a leave in **half days** covers the morning or afternoon it names, up to the
  end of the last half day;
- a leave in **hours** covers the whole days when its hours equal the schedule's
  hours per day, the morning or the afternoon when they equal half of it, and
  otherwise the hours from its start to its end;
- a leave in **days** covers whole days.

This applies in every view of employees, the attendance views included (see
[What Time Off changes in the attendance views](attendance_gantt.md#what-time-off-changes-in-the-attendance-views)).

![A flexible schedule, light](../assets/time_off_gantt/10-flex.png)

When every employee of the page is grey for a whole column and no pill touches
it (the weekends, usually), the run of columns folds, and the folding is worked
out at each load, as in the attendance views.

## The hours label

Next to each employee's name the leave view shows a short label, such as "168h".
It is in the muted colour, has no bar under it and no tooltip, and shows for
internal users only. The report view has none. The number is rounded to the
nearest whole hour, and it counts the period on screen (the days of the week,
month or quarter).

**The label has two meanings, depending on the employee's schedule.**

| Schedule | The label shows | Example, November, standard schedule |
|---|---|---|
| **Fixed** (hours on set days) | the **hours to work in the period, less leave**: the schedule's working hours, less validated leaves and company-wide leaves | 168h for an employee with no leave (21 working days of 8 hours); 80h for one who is out for 11 days |
| **Flexible** (no fixed hours, or hours per week without set days) | the **hours of approved leave** that overlap the period | 16h for two approved days of 8 hours |

The meaning follows the employee's current schedule. For a flexible schedule a
leave that crosses the edge of the period counts with all its hours, not just the
part inside. A request that waits for approval or is refused counts in neither
case. The two meanings are intended: a flexible schedule has no hours to work, so
the label tells how much leave the employee has taken instead. Read a row's label
with the employee's schedule in mind.

The period is the same calendar days for every employee, read in the browser's
time zone, whatever the time zone of the employee.

![Labels of a fixed and a flexible schedule, light](../assets/time_off_gantt/10-flex.png)

## The employee card

A click on an avatar (on a screen 768 px wide or more) opens the card of the
Community's employee, with a **leave band** under its body, and without the
card's footer. Nothing opens on a phone. The card closes on a click elsewhere
or Escape. It is the same in both views.

![The employee card with its leave band, light](../assets/time_off_gantt/05-card.png)

The band has:

- **The schedule button**, for everyone: a calendar icon and the hours per week
  of the employee's schedule ("40 h / Week"), or "Time Off" when the schedule has
  no hours. It has the focus when the card opens. A click opens the employee's
  time-off dashboard, on the Week range of the view if it shows a week, on the
  Month range if it shows a month, and on the year for every other range.
- **The leave lines**, for Employees officers only: one line for each leave type
  that is valid in the company's country and for which the employee has time
  allocated or taken. A line reads the type, the time taken in bold and, for a
  type that needs an allocation, the time left in muted text ("Legal leave
  employee: 11 days / 9 days"). The lines are ordered by time left, the smallest
  first.
- **A pencil**, for Employees officers only: it asks for a date and creates a
  new version of the employee at that date, then opens the employee on it.
  Closing the date picker without a date does nothing.

An employee who is not an officer sees the band with the schedule button alone.

![The card of an employee without leave lines, light](../assets/time_off_gantt/06-card-emp.png)

## Import and Export in the gear

On a screen 768 px wide or more, the gear beside the title of the leave view
offers two entries. They are not there in the report view, and not on a phone.

- **Import** opens the Community's import screen for time off requests. Its
  breadcrumb comes back to the view.
- **Export**, for users of the Community's export group, downloads at once, with
  no dialog, a spreadsheet of the requests of the current search (the action's
  filters included), without grouping, with five columns: the request, the
  employee, the type, the start and the end.

![The gear menu, light](../assets/time_off_gantt/07-cog.png)

An Approver in Management > Time Off, who is not in the export group, gets Import
alone.

## When nothing shows

When no employee matches the search, both views show **one empty row with no
name** and the total row, without helper text and without a layer, on a phone
too. A row of an employee who has no leave is a normal row. With requests
elsewhere but none in the period, the rows are drawn as usual. The report's
sample data appears only when the report holds no record at all.

![An empty leave view, light](../assets/time_off_gantt/08-empty.png)

![An empty report view, light](../assets/time_off_gantt/09-empty-report.png)

## On a phone

Below the small-screen breakpoint both views take the phone layout of the Gantt
view: a narrow row header with the avatar, the cut name and the label, and the
search facets behind the search button. There is no card and no gear entry.

![The leave view on a phone, light](../assets/time_off_gantt/01-month.mobile.png)

## Time zones

- Today, the days of the period and the drawing of pills follow the **browser's**
  time zone.
- The hours of an employee's schedule, which the grey cells show, are read in
  the employee's own time zone and placed at the same clock time in the
  browser's zone, so a working day of 8 to 17 greys no cell of the day whatever
  the zone of the browser.
- The label counts the same calendar days for every employee (see above).
- The leave intervals of flexible schedules follow the employee's time zone.
- The dates in the long pill text are those of the request.

The browser sends its zone with each load of the data.

## What Time Off changes in the attendance views

With this module and Time Off installed, the attendance views change in three
places; they are described in
[Attendances Timeline](attendance_gantt.md#what-time-off-changes-in-the-attendance-views).

## Uninstalling

Uninstalling the module gives the Overview menu the Community's time-off
dashboard action, and gives that action and Management > Time Off their
Community view modes (calendar for the first; list, kanban, form, calendar and
activity for the second). Uninstalling the Employees timeline module uninstalls
this one too.

## Who sees what

The module adds no group, access right or record rule. The Community's Time Off
groups decide. Where a role may not act, an element is **absent**, not
disabled.

| | No role | Employee, Manager | Approver | Officer, Admin |
|---|---|---|---|---|
| Overview | access error | report view | report view | leave view |
| Management > Time Off | not there | not there | yes | yes |
| Pill text on Month and Quarter, one day or less | n/a | duration | duration | duration |
| Pill text otherwise | n/a | duration | duration | type code and duration |
| Hours label | n/a | none | none (report) | yes |
| Card lines and pencil | n/a | no | no | yes |
| Gear | n/a | none | Import (no export group) | Import and Export |

A Manager who is not an approver does not see Management > Time Off. If they
open it by its address they get the same view as an Approver, with the
Community's read rules on requests applied. An Approver in Management > Time
Off sees the label, since the hours are read with their own rights.

## For developers

**View variants.** Two client variants of the Gantt view, both built on the
employee variant of `hr_gantt`, are registered in the `views` registry:

| `js_class` | View |
|---|---|
| `hr_holidays_gantt_manager_hr_leave` | the leave view, `hr_holidays_gantt.hr_leave_gantt_view`, model `hr.leave` |
| `hr_holidays_report_gantt` | the report view, model `hr.leave.report.calendar` |

They replace the card's content, the hours label and the context of the data call
(`group_by`, `tz`, and the scale), and make a named range one period.

**Inputs for the later parts: `hhgInputs`.** The renderer of the leave variant
lists the inputs of the framework that do nothing in this release, in a getter
`hhgInputs` that returns an object of booleans, all `false`: `pillClick`,
`pillDoubleClick`, `pillHover`, `pillPress`, `cellPress` and `multiSelect`. A
value of `true` hands the input back to the framework. A subclass flips entries
by spreading its parent's:

```js
get hhgInputs() {
    return { ...super.hhgInputs, pillClick: true };
}
```

A later part that adds the popover and the pill gestures assigns its popover in
`setup()` after `super.setup()` and sets the four pill entries; a part that adds
the selection of cells adds its form option to the view and sets `cellPress` and
`multiSelect`. Clicks on avatars and row headers, folding and the controls are
not listed: they stay.

**Server.** A model holds the part both data calls share (`hhg.gantt.rows`, an
abstract model mixed into `hr.leave` and `hr.leave.report.calendar`):

- `get_gantt_data` is overridden on both models. It reads with the displayed scale
  in the context (`scale`) on both of its paths, so that the pill text follows
  the scale, and it asks for every employee's row only when the search concerns
  the employee alone (`user_domain`, `group_by` in the context). The report's
  job position and company conditions are converted to the employee's first.
- `_gantt_unavailability` answers for the employee field with the Community's
  unavailable intervals, read with system rights in the browser's zone (`tz`).
- `_gantt_progress_bar` of `hr.leave` gives the hours label of the rows to
  internal users.
- `hr.employee.public` gets two computed fields for the card, `avatar_leave_summary`
  and `avatar_hours_per_week`, and a method that opens an employee's time-off
  dashboard for any user.
- `resource.calendar._handle_flexible_leave_interval` is overridden for the leave
  intervals of flexible schedules (all views of employees).
- A method of `hr.leave` returns the action that the server action
  `hr_holidays_gantt.action_hr_holidays_overview` runs for the Overview menu;
  `uninstall_hook` writes the Community's view modes and menu action back.

**Extension point.** The client's `hhgInputs` getter is the extension point
that the module offers. The server side is extended by the usual inheritance of
the two models above.

**The Gantt view's unavailable parts.** One change was made to `web_gantt` for
this module; see [Gantt View](gantt_view.md#capacity-bars-unavailable-periods-and-folded-columns).
