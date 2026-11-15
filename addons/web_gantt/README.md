# Gantt View (`web_gantt`)

A Gantt (timeline) view for the web client: records are drawn as pills on a
time grid, in rows that can be grouped by any field, and can be created,
planned, opened, changed and deleted from the grid, and pills can be moved,
copied and resized with the pointer. User documentation: [docs/modules/gantt_view.md](../../docs/modules/gantt_view.md).

The module depends on `web` only, installs automatically with it, has no menu
or setting and adds no model; its one server method is the undo of a drag
(below). The dialogs are the web client's and every call runs with the user's
rights. Dependencies and the HR and time-off bridges come in later slices.

## What it adds

| Part | Technical name | Purpose |
|---|---|---|
| View type | `gantt` on `ir.ui.view` | Qweb-based view type, label "Gantt", with a validator for the definition (required `date_start` and `date_stop`, known attributes and children, `default_range`, `default_scale` and `display_mode` values, popover shape, `dependency_field` with `dependency_inverted_field`). Every field of the model is sent to the browser. |
| Action view mode | `gantt` on `ir.actions.act_window.view` | Added with the label "Gantt"; uninstalling the module deletes the lines that use it. |
| Generated view | `_get_default_gantt_view` on every model | Used when a model has no Gantt view. The start and stop fields come from `_start_name` and `_stop_name` (default `date_start`, `date_stop`), then from the candidate names `start_date`, `x_date_start`, `x_start_date` and `stop_date`, `date_end`, `end_date`, `x_date_stop`, `x_stop_date`, `x_date_end`, `x_end_date`. Without a pair the call fails. |
| Data call | `get_gantt_data` on every model | Keywords `domain`, `groupby`, `read_specification`, `scale`, `start_date`, `stop_date`, `limit`, `offset`, `progress_bar_fields`, `unavailability_fields`. Returns `groups` (each with `__record_ids`), `records`, `length`, `unavailabilities`, `progress_bars`. |
| Undo call | `gantt_undo_drag_drop(drag_kind, values=None)` on every model | Takes back a move, a resize or a copy (see below). |
| Hooks | `_gantt_unavailability`, `_gantt_progress_bar` | Host models override them; the base versions return an empty mapping. |
| Browser view | registry `views` key `gantt` | `TimelineView` with model, renderer, controller, popover and arch parser (below). |

## Browser files

All under `static/src/`; class names use the stem `Timeline`, CSS classes the
prefix `o_tl_`, templates `web_gantt.Timeline...`.

| File | Role |
|---|---|
| `timeline_dates.js` | Pure date logic: ranges, scales, columns, navigation. |
| `timeline_layout.js` | Pure layout: pills, stacking, segments, totals, colours, labels, unavailable parts, folding. |
| `timeline_arch_parser.js`, `timeline_view.js` | Reads the definition; registers the view. |
| `timeline_model.js` | Loads data, builds rows (record rows in sparse mode follow `orderPills`), remembers the range (`rangeOf-viewId-<id>` in the browser storage), sample state. The period domain takes each bound from the type of its own field (date-only bounds in local days, date-time bounds as the UTC instant of the local midnight), so a view may mix both types. |
| `timeline_controller.*` | Control bar, range menu with the custom range (plain date fields, the picked date stays unselected; date fields sized to ten characters, the line's side padding fitted to the menu width, dates and arrow in black/white roles while the picker is open), phone gear menu and range sheet (its bar lines carry their own spacing, mirrored with touch). On a touch phone the theme's touch button size applies; the phone rules only fix the desktop size when `body` lacks `o_touch_device`. |
| `timeline_editing.js`, `timeline_editor.js`, `timeline_selection.js` and the editing parts of the controller, renderer and popover | Editing (slice 002b); pure helpers for the periods and the creation context, the editor that opens the dialogs and runs the plan write, the selection: the New button's period (week of the language's first day), the cell click and the selection with its badges and edge scrolling (mouse, and long press on touch), creation context (`default_*`, `search_default_*`), create dialog or `on_create` action, plan dialog with its write, record dialog (editable only when the view's and the form's own edit allow it), Remove with the web client's confirmation, editable popover fields and buttons. Date-only stops are the last covered day. |
| `timeline_renderer.*`, `timeline_popover.*` | Grid, rows (each name in an ellipsis label), pills, total row, column tooltips with the weekday; the popover. The grid's own scroll area takes the view background and stretches to the bottom of the view (so its scrollbar is at the bottom); the outer box has no fill. In the sample state the box is transparent and the scroll area ends after the faded row. |
| `timeline_multi_select.js` | Pure: the set of selected cells (`TimelinePickedCells`), the multi-selection mode test, the count of distinct records, the days per row and the first block of a selection. |
| `timeline_multi_create.js` | Pure: builds the value mappings of one multi-creation (one per day and record row, the cell's values over the template form's). |
| `timeline_selection_buttons.js`, `.xml` | `TimelineSelectionButtons`: the Community's selection buttons with the count box, Add, Plan and Delete as the view's permissions allow. |
| `timeline_side_panel.js`, `.xml`, `.scss` | `TimelineSidePanel`: the list of records without dates with Load more, the resize strip and the drop zone. |
| `timeline_panel_math.js` | Pure: the span of a dragged line, the clamped panel width, and the removal of start and stop conditions from the search domain. |
| `timeline.variables.scss`, `timeline.variables.dark.scss` | Own `!default` variables for the values that match no theme role. Every other colour is a theme role, so the view compiles on Community alone and follows the dark scheme when `web_enterprise` is installed. |

## Moving, copying and resizing

Slice 002b2. The browser view lets a pill be dragged (`timeline_drag.js`,
`timeline_drag_math.js`, `timeline_edge_scroll.js`, `timeline_notification.scss`
and the matching parts of the renderer, model, editor and arch parser): a move or, with
Ctrl held, a copy, within or across rows (grouping values written, read-only
grouping levels refuse drops); a resize by the two handles; the lock for cut
pills, edit off and `disable_drag_drop`; time badges; edge scrolling; the
notification with Undo; writes sent one after the other, each followed by a
reload; whole days on date-only fields; touch (long press to move, no touch
resizing) and right-to-left layout. The same slice corrects the focus date after
a range change, the badges and headers in right-to-left languages, the
edge-scroll speed of selections, the click lock after clicks on group rows,
deleting without a connection and the empty-value row chains.

- **View option `disable_drag_drop`** (yes or no, default no): locks every pill
  for moving and copying; resizing stays possible. Read like the other yes/no
  options: any value read as false keeps moving on.
- **Server method `gantt_undo_drag_drop(drag_kind, values=None)`**, on the
  abstract `base` model every model inherits (`models/timeline_base.py`).
  Call it on one record. `drag_kind` is `'copy'`, which deletes the record (the
  copy), or `'reschedule'`, which writes `values` back (the earlier start and
  stop, in the formats of the create context, plus the earlier grouping values;
  a relation to many records gives its whole former list). The result is the
  result of the deletion or write; it is `False` when the record no longer
  exists, the kind is neither of the two, or a reschedule has an empty mapping.
  No access rule is added: the user's own write or delete right applies and
  gives the usual access error. Other modules can override it to undo their own
  extra changes.
- **Server calls made by a gesture:** a plain write (start, stop and grouping
  values that differ), or a plain `copy` with those values as defaults, then
  `get_gantt_data` again. Nothing is sent when nothing changes.
- **Translations:** `i18n/ar.po` is the Arabic translation file (it also
  carries the unit words of the resize badge: minutes, hours, days, months);
  `i18n/web_gantt.pot` is the template.

## Selecting several cells and the side panel

Slice 002b3. With `multi_create_view` set (and a computer screen, shared rows and a
range whose columns are days) cells are selected by click, drawing and the
row and column headers (Ctrl toggles, Shift extends from an anchor); the
Community's selection buttons offer Add (create), Plan (one record-row cell,
plan option and edit) and Delete (delete). Add opens the Community's multi-create
popover with the template form and creates one record per day and record row;
the cell's dates and the row's grouping values replace the form's. With
`schedule` on (and edit on, not a phone, no sample state) the side panel lists
the records without start and stop, lets a line be dragged onto the grid, and
turns into a drop zone while a pill is moved so that its dates can be removed.
The same slice makes text in the view unselectable and fixes the row header
click.

- **Browser storage:** `timelinePanelOpen-view-<view id>-action-<action id>`
  holds whether the panel is open. The panel's width is not stored.
- **Server calls:** one `create` with a list of mappings and the context key
  `multi_create` (true) added to the action and search context; one `unlink`
  for the selected records, sent at once; a `web_search_read` of the display
  name with a limit (20, then 20 more per Load more) for the panel list; one
  `write` per panel drop, queued behind earlier writes; one `write` of the
  start and stop set to false for the drop zone, sent at once. Each is followed
  by a reload. Nothing else is added: no model, field or server method.

## Configuration

The attributes of the `gantt` element are listed in the
[user page](../../docs/modules/gantt_view.md#for-developers): `date_start`,
`date_stop`, `string`, `default_range`, `default_scale`, `scales`, `precision`,
`color`, `decoration-*`, `progress`, `pill_label`, `thumbnails`,
`display_mode`, `total_row`, `progress_bar`, `display_unavailability`,
`groups_limit`, plus the Community ones (`default_group_by`, `sample`,
`create`, `edit`, `delete`, `class`, `js_class`), the editing ones
(`cell_create`, `plan`, `form_view_id`, `on_create`) and `disable_drag_drop`.
`multi_create_view` (the template form's XML identifier) and `schedule` (yes or
no) are the attributes of the multi-selection and the side panel. The dependency
attributes (`dependency_field`, `dependency_inverted_field`, `buffer_start`,
`buffer_stop`) are accepted and ignored for now. Context keys read by the view:
`default_range`, `default_scale`, `default_start_date`, `default_stop_date`,
`initialDate`, `group_by`. Context keys the view gives to the create dialog,
the create action and the plan dialog: the start and stop field names, their
`default_` forms, and for a click or selection in a grouped view each grouping
field's name with its `default_` and `search_default_` forms (see the
[user page](../../docs/modules/gantt_view.md#context-given-to-dialogs-and-actions)).

## Provenance

Written in a clean room from the spec packages of slices 002a-gantt-display,
002b-gantt-editing, 002b2-gantt-drag-resize and 002b3-gantt-multi-create. The
provenance record is `provenance/web_gantt.yaml`. See
[docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

The Hoot suite is in `static/tests/` (loaded in `web.assets_unit_tests`, one
file per area, scenarios named `A<n>: ...`; the editing ones, in
`timeline_editing`, `timeline_editor`, `timeline_cell_click`,
`timeline_selection`, `timeline_plan` and `timeline_record_dialog`
`.test.js`, start with `002b `; the slice 002b2 ones, in `timeline_drag`,
`timeline_drag_math`, `timeline_drag_rows`, `timeline_edge_scroll`,
`timeline_resize`, `timeline_undo` and `timeline_notes` `.test.js`, are named
after the scenarios A1 to A76; the slice 002b3 ones, in
`timeline_multi_select`, `timeline_multi_view`, `timeline_multi_create_view`,
`timeline_multi_buttons`, `timeline_multi_create`, `timeline_side_panel`,
`timeline_panel_drag` and `timeline_panel_math` `.test.js` and in
`timeline_notes`, are named `002b3 A<n>: ...`), run through
`tests/test_hoot.py`; the environment variable `WEB_GANTT_HOOT_FILTER` narrows
the run to the tests whose name contains its text, for example `002b3 A29`. The scratch host, tours, probes and backend tests live in
the hidden module [`test_web_gantt`](../test_web_gantt/README.md).

```
make test MODULES=web_gantt,test_web_gantt
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`,
for example `... run --rm odoo odoo -d <db> -i web_gantt,test_web_gantt
--test-tags /web_gantt,/test_web_gantt --stop-after-init`.
