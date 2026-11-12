# Gantt View

The Gantt view shows records as horizontal bars, called pills, on a time grid.
Each pill runs from the start to the stop of its record, and the records can
be arranged in rows by any field. The view is read-only in this release: you
can look, navigate and open a summary of a record, but not change anything
from the grid.

The view has no menu of its own. It appears in any window action whose view
modes include **Gantt**, next to the other views in the view switcher, or as
the first view of such an action. The first Community applications that use it
arrive in later slices; until then it is reached through actions written by
other modules, such as the scratch host of the hidden test module
[`test_web_gantt`](../../addons/test_web_gantt/README.md), used for the
screenshots below. The search bar of the action (filters, group by, favourites)
applies as usual.

Technical reference:
[`addons/web_gantt/README.md`](../../addons/web_gantt/README.md).

![A week of records, light](../assets/gantt_view/01-week-ungrouped.png)

![A week of records, dark](../assets/gantt_view/01-week-ungrouped-dark.png)

## The control bar

Under the control panel, a bar holds the controls of the view, from left to
right:

| Control | What it does | Key |
|---|---|---|
| Previous and next arrows | Move back or forward by one period of the current range (one day, week, month, quarter or year). A custom range moves by its own length. | `p`, `n` |
| Range button | Shows the current range ("Day", "Week", "Month", "Quarter" or "Year"), or the two dates of a custom range. Opens the range menu. | `v` |
| **Today** | Scrolls so that today is in the middle of the grid. If today is outside the displayed period, the range is rebuilt around it; a custom range keeps its length. | `t` |
| Display mode | Switches between one shared row per group of records (dense) and one row per record (sparse). | |
| Open or fold every group | Opens all group rows, or folds them all. Shown only when the first row is a group row; otherwise it keeps its place but is invisible. | |

When several clicks on previous or next follow each other quickly, the data is
loaded once, half a second after the last click. If the action offers a New
button, it sits in the control panel (key `c`); what it does belongs to a
later slice.

### The range menu

The menu lists the ranges the view offers, with the current one checked, then
a line for a **custom range**: two date fields with an arrow between them and
an **Apply** button. Picking a date in either field opens a date picker; the
menu stays open until you press Apply. If you pick a start after the stop (or
the reverse), the other date follows. A range can be at most ten years minus
one day long. Choosing another range in the list rebuilds the grid around the
date that is currently in the middle of the screen.

![The range menu, light](../assets/gantt_view/09-range-menu.png)

![The range menu, dark](../assets/gantt_view/09-range-menu-dark.png)

![The custom range with its date picker, light](../assets/gantt_view/14-custom-picker.png)

![The custom range with its date picker, dark](../assets/gantt_view/14-custom-picker-dark.png)

When the view opens, the range comes from, in this order: the range you chose
last time on this view (the browser remembers the name of the range, never the
dates of a custom one), the range passed by the action, the default range of
the view definition. If none applies the view opens on a custom range of three
months starting at the first day of the current month.

![A custom range by default, light](../assets/gantt_view/06-default-range.png)

![A custom range by default, dark](../assets/gantt_view/06-default-range-dark.png)

## Scales and ranges

A named range shows three periods of its kind: the one that contains the focus
date (today unless the action says otherwise), the one before and the one
after. Every range has a scale, which sets what a column is:

| Scale | Column | Grouped under | Used by |
|---|---|---|---|
| Day | one hour | the day | Day range |
| Week | one day | the week | Week range |
| Month | one day | the month | Month range, Quarter range (nine months) |
| Year | one month | the year | Year range |

A custom range picks its scale from its length: under 6 days the day scale,
under 27 the week scale, under 364 the month scale, otherwise the year scale.
If the view does not offer that scale, the nearest smaller offered one is
used, then the nearest larger one. Columns share the free width equally; when
that would make them too narrow the grid scrolls sideways. Weeks start on the
first day of the week of your language. On the days when the clock changes,
the day scale has 23 or 25 hour columns, and pills follow the wall clock.

Today's column has a pale warm tint in its header and cells (on the day scale
it is the current hour).

![The day scale, light](../assets/gantt_view/10-day.png)

![The month scale, light](../assets/gantt_view/11-month.png)

![The quarter range, light](../assets/gantt_view/12-quarter.png)

![The year scale, light](../assets/gantt_view/13-year.png)

![The year scale, dark](../assets/gantt_view/13-year-dark.png)

Records that have only a date, not a time, are shown for the whole days; the
stop day is included.

![Date fields on the month scale, light](../assets/gantt_view/17-date-fields-month.png)

On the year scale, a record that lies inside a single month fills that whole
month.

![The year scale started from the week scale, light](../assets/gantt_view/24-year-from-week.png)

Records are shown when they overlap the displayed period. A record without a
start or a stop, or whose stop is before its start, is not shown. A record
that begins before or ends after the period is cut at the edge of the grid.
Archived records appear only when the search asks for them.

## Rows and grouping

With no grouping, one unnamed row holds every pill; pills that overlap in time
are stacked on separate lines. With a grouping from the search bar (or from
the view definition or the action), each value gives a row, and rows nest when
you group by several fields. Grouping by a date or date-and-time field is
ignored.

- A row for records **without a value** comes first and is named "Undefined"
  followed by the field label, for example "Undefined Parent". It is always
  there at the top level, unless the field is required. Zero and an empty text
  also count as no value. Yes/no fields show "True" and "False".
- With a **many-to-many** field, a record appears in the row of every value it
  has, and in the empty-value row only when it has none.
- Fields that list all their values even when empty (a stage, for example)
  give empty rows.
- Row names are shown with the normal display of the field; a grouping field
  can have a small image shown before the name of its row.

A row that has sub-rows is a **group row**: a caret before its name shows
whether it is open or folded, and clicking its header or its cells folds or
opens it. Instead of pills, a group row shows for each stretch of time the
number of records running there, as a thin line with the count at its left.
Clicking the header of a row without sub-rows scrolls the grid to its first
pill. Pointing at a group row highlights the whole row, header included.
Changing the grouping opens every row again.

![Records grouped on two levels with a total row, light](../assets/gantt_view/02-grouped-two-levels.png)

![Records grouped on two levels with a total row, dark](../assets/gantt_view/02-grouped-two-levels-dark.png)

![A folded group, light](../assets/gantt_view/03-group-collapsed.png)

![A folded group, dark](../assets/gantt_view/03-group-collapsed-dark.png)

![The pointer on a group row, light](../assets/gantt_view/23-group-row-hover.png)

![Rows from a many-to-many field, light](../assets/gantt_view/05-many2many-rows.png)

![Rows from a many-to-many field, dark](../assets/gantt_view/05-many2many-rows-dark.png)

### Sparse mode and paging

In sparse mode every record gets a row of its own, named after the record,
below its group. Group rows are then used for every level of grouping. Without
grouping, each record is a row. Switching between the two modes opens all
folded rows.

When the view definition sets a number of groups per page and the data is
grouped, the control panel shows a pager. It counts combinations of the
grouping values, so with two levels a page of two shows two combinations below
their parent rows, and a parent row can occur on several pages. The
empty-value row is shown on every page.

![Sparse mode with a pager, light](../assets/gantt_view/04-sparse-pager.png)

![Sparse mode with a pager, dark](../assets/gantt_view/04-sparse-pager-dark.png)

## Pills

A pill starts at the beginning of the part of a column that holds the start of
the record and ends at the end of the part that holds its stop. Each scale cuts
a column in parts (the day scale by hour, the week and month scales by half
days, the year scale by month); the view definition can make this coarser or
finer.

- **Label.** The pill shows the name of the record. If the view asks for
  dates in the label, a record that spans several days and sticks out of the
  displayed range also shows its start and stop dates before the name (on the
  year scale, any record shows them). When the model has hours allocated to a
  record, a one-day pill on the week and month scales can also show its times
  and allocated hours. Text is cut at the edge of the pill.
- **Colour.** The view can colour pills by a number or relational field. There
  are twelve colours, taken from the theme; the first one is a neutral grey.
- **Marks.** The view definition can mark pills that meet a condition (danger,
  warning, success, info, secondary) with a small triangle in the top left
  corner. The info mark also fills the pill with diagonal stripes.
- **Progress.** A darker band covers the left part of the pill, as wide as the
  percentage held by a field of the record.

![A pill under the pointer, light](../assets/gantt_view/20-pill-hover.png)

![A pill under the pointer, dark](../assets/gantt_view/20-pill-hover-dark.png)

### The popover

A single click on a pill opens a popover next to it (after a short delay, so
that a double click does not open it). A cross at the top right, a click
elsewhere, or a click on another pill closes it; the click on the other pill
opens that pill's popover. Without any content in the view definition the
popover shows the record name as its header and two lines, Start and Stop,
with the dates, and a small primary button in its footer: **Edit** when the
view allows editing, **View** otherwise (what the button opens is part of a
later slice).

A view definition can supply its own content in the manner of a card: a body,
a header and a footer, or the identifier of a card view to borrow its fields
and templates. A custom body replaces the two lines; a custom footer replaces
the button unless it is told to keep it. On a phone the popover opens as a
full-screen sheet.

![The default popover, light](../assets/gantt_view/07-popover-default.png)

![The default popover, dark](../assets/gantt_view/07-popover-default-dark.png)

![A popover with a custom body, light](../assets/gantt_view/08-popover-custom.png)

![A popover with a custom body, dark](../assets/gantt_view/08-popover-custom-dark.png)

## The total row

When the view definition asks for it, a row named **Total** is added at the
bottom. For every stretch of time in which records run it draws a vertical bar
whose height follows the number of records, with the count at its foot. Bars
too narrow for the count show a smaller figure. Pointing at a bar darkens it
and draws a translucent band up to the top of the grid. Without row headers
the row has no title.

## Capacity bars, unavailable periods and folded columns

Three features are drawn by the view but filled in by the module that hosts
it. A plain installation of the Gantt view supplies no data for them (the two
hooks return nothing), so you see them only in applications that provide it,
such as the employee, attendance, event track and time off applications of later slices.

- **Capacity bars.** For a grouping field named by the view definition, a row
  header can show how much of a quantity (typically hours) is used: a small
  label with what remains, and a thin bar filled in green up to 100 percent
  and in red beyond it. Pointing at the bar or the label shows used and
  maximum with the percentage. If the host gives a warning instead of a
  maximum, a warning icon with that text replaces the bar. In sparse mode only
  group rows show the bars.
- **Unavailable periods.** With the option on, the periods in which the
  resource of a row is unavailable are greyed in its cells; a cell that is
  partly covered is grey only where it is covered.
- **Folded columns.** When every row is unavailable for a whole column and no
  pill touches it, runs of such columns fold into one narrow column whose
  header shows two arrows pointing at each other. Click the folded header or a
  folded cell to open the run, and click the header of an open one to fold it
  again. While you point at the header of an open column of such a run, the
  headers of the run show outward arrows and the others dim. Folding is reset
  when the range or scale changes.

![Capacity bars and unavailable periods, light](../assets/gantt_view/18-progress-unavailability.png)

![Capacity bars and unavailable periods, dark](../assets/gantt_view/18-progress-unavailability-dark.png)

![A folded column that was opened, light](../assets/gantt_view/21-folded-column-opened.png)

![The tooltip of a capacity bar, light](../assets/gantt_view/22-progress-tooltip.png)

## Sample data and empty views

If the view definition allows sample data and the first load finds no record,
the view shows a faded, non-interactive grid with generated rows and no pills,
and the help text of the action drawn over it. The sample state ends at the
next load (any navigation or search). When sample data is not allowed, an empty
result shows the normal grid with empty rows and no help.

![The sample state, light](../assets/gantt_view/15-sample-data.png)

![The sample state, dark](../assets/gantt_view/15-sample-data-dark.png)

![An empty view, light](../assets/gantt_view/16-empty.png)

![An empty view, dark](../assets/gantt_view/16-empty-dark.png)

## On a phone

On a small screen the control bar wraps: previous, next and the range button
on the first line, then Today and a gear button on the second. The gear menu
holds the display mode switch ("One row per record" or "Shared rows") and, below
a separator, "Open every group" or "Fold every group". The range menu opens as
a bottom sheet, dates are picked in a dialog, popovers open full screen and
the row header column takes a third of the width. Month names in the headers
are abbreviated, and the page itself scrolls.

![The week view on a phone, light](../assets/gantt_view/01-week-ungrouped.mobile.png)

![The week view on a phone, dark](../assets/gantt_view/01-week-ungrouped-dark.mobile.png)

![The gear menu on a phone, light](../assets/gantt_view/19-phone-toolbar-menu.mobile.png)

![The gear menu on a phone, dark](../assets/gantt_view/19-phone-toolbar-menu-dark.mobile.png)

![The range menu on a phone, light](../assets/gantt_view/09-range-menu.mobile.png)

![A popover on a phone, light](../assets/gantt_view/07-popover-default.mobile.png)

## Light and dark

Every colour of the view comes from the theme colours of the web client, so
the view follows the light or dark look chosen in your preferences (see the
[Web Theme](web_theme.md)). In the dark look today's highlight is a
translucent warning colour, unavailable periods are a flat grey and the first
pill colour is the theme's neutral grey. When the theme module is not
installed the view still works, with the default colours of the web client.

## For developers

### The view definition

A Gantt view is a `gantt` element. `date_start` and `date_stop` (names of date
or date-and-time fields) are required. The other attributes:

| Attribute | Meaning |
|---|---|
| `string` | title above the row headers |
| `default_range`, `default_scale` | opening range: `day`, `week`, `month`, `quarter`, `year` (`default_scale` also takes `week_2` and `month_3`, which give a custom range) |
| `scales` | comma-separated list of the ranges offered |
| `precision` | per scale, `unit:part` with part `full`, `half` or `quarter` |
| `color` | number or relational field choosing the pill colour |
| `decoration-danger`, `-warning`, `-success`, `-info`, `-secondary` | conditions on the record that mark the pill |
| `progress` | number field with a percentage |
| `pill_label` | add dates (and times) to the label |
| `thumbnails` | maps a grouping field to an image field of the related model |
| `display_mode` | `dense` (default) or `sparse` |
| `total_row` | add the Total row |
| `progress_bar` | relational grouping fields that show a capacity bar |
| `display_unavailability` | grey out unavailable periods |
| `groups_limit` | groups per page |
| `default_group_by`, `sample`, `create`, `edit`, `delete`, `class`, `js_class` | the usual meaning in a Community view |

Children are `field` elements (extra fields to read, for decorations and the
popover) and at most one `popover`. A `popover` takes `card_id` only, and may
hold `field` elements and one `templates` element with `popover-body` (or
`card`), `popover-header` and `popover-footer` (the last with `replace` set to
a false value to keep the default button). The editing and dependency
attributes (`form_view_id`, `on_create`, `cell_create`, `plan`,
`multi_create_view`, `disable_drag_drop`, `dependency_field`,
`dependency_inverted_field`, `buffer_start`, `buffer_stop`, `schedule`) and
`collapse_first_level`, `dynamic_range`, `offset` are accepted and have no
effect yet. A view that breaks the rules is refused when saved, with a message
that names the problem. An action can pass the context keys `default_range`,
`default_scale`, `default_start_date`, `default_stop_date`, `initialDate` and
`group_by`.

```xml
<gantt date_start="date_start" date_stop="date_stop" string="Work"
       default_range="week" color="priority" progress="progress"
       decoration-danger="is_late" total_row="1">
    <field name="is_late"/>
</gantt>
```

### The server side

- `get_gantt_data` is the model call the view makes in one go. It returns
  `groups` (with `__record_ids`), `records`, `length`, `unavailabilities` and
  `progress_bars`.
- `_gantt_unavailability` and `_gantt_progress_bar` are the two hooks a host
  model overrides to fill the last two keys. The base versions return nothing.
- A model without a Gantt view gets a generated one (`_get_default_gantt_view`)
  built from the fields named by `_start_name` and `_stop_name`, or the usual
  candidates (`date_start`, `start_date`, `date_stop`, `date_end`, ...). If no
  pair is found the request fails with an error saying so.

## Not included yet

Creating, moving, copying and resizing pills, the dependency arrows and
buffers, rescheduling, the dialog that plans records, and the Gantt views of employees,
attendances, event tracks and time off are delivered in later slices.
