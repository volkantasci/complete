# Gantt View (`web_gantt`)

A Gantt (timeline) view for the web client: records are drawn as pills on a
time grid, in rows that can be grouped by any field, and can be created,
planned, opened, changed and deleted from the grid. User documentation: [docs/modules/gantt_view.md](../../docs/modules/gantt_view.md).

The module depends on `web` only, installs automatically with it, has no menu
or setting and adds no model or server method for editing: the dialogs are the
web client's and every call runs with the user's rights. Moving and resizing
pills, multi-selection, dependencies and the HR and time-off bridges come in
later slices.

## What it adds

| Part | Technical name | Purpose |
|---|---|---|
| View type | `gantt` on `ir.ui.view` | Qweb-based view type, label "Gantt", with a validator for the definition (required `date_start` and `date_stop`, known attributes and children, `default_range`, `default_scale` and `display_mode` values, popover shape, `dependency_field` with `dependency_inverted_field`). Every field of the model is sent to the browser. |
| Action view mode | `gantt` on `ir.actions.act_window.view` | Added with the label "Gantt"; uninstalling the module deletes the lines that use it. |
| Generated view | `_get_default_gantt_view` on every model | Used when a model has no Gantt view. The start and stop fields come from `_start_name` and `_stop_name` (default `date_start`, `date_stop`), then from the candidate names `start_date`, `x_date_start`, `x_start_date` and `stop_date`, `date_end`, `end_date`, `x_date_stop`, `x_stop_date`, `x_date_end`, `x_end_date`. Without a pair the call fails. |
| Data call | `get_gantt_data` on every model | Keywords `domain`, `groupby`, `read_specification`, `scale`, `start_date`, `stop_date`, `limit`, `offset`, `progress_bar_fields`, `unavailability_fields`. Returns `groups` (each with `__record_ids`), `records`, `length`, `unavailabilities`, `progress_bars`. |
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
| `timeline.variables.scss`, `timeline.variables.dark.scss` | Own `!default` variables for the values that match no theme role. Every other colour is a theme role, so the view compiles on Community alone and follows the dark scheme when `web_enterprise` is installed. |

## Configuration

The attributes of the `gantt` element are listed in the
[user page](../../docs/modules/gantt_view.md#for-developers): `date_start`,
`date_stop`, `string`, `default_range`, `default_scale`, `scales`, `precision`,
`color`, `decoration-*`, `progress`, `pill_label`, `thumbnails`,
`display_mode`, `total_row`, `progress_bar`, `display_unavailability`,
`groups_limit`, plus the Community ones (`default_group_by`, `sample`,
`create`, `edit`, `delete`, `class`, `js_class`) and the editing ones
(`cell_create`, `plan`, `form_view_id`, `on_create`). The dependency, drag and
multi-create attributes (`multi_create_view`, `disable_drag_drop`,
`dependency_field`, `dependency_inverted_field`, `buffer_start`, `buffer_stop`,
`schedule`) are accepted and ignored for now. Context keys read by the view:
`default_range`, `default_scale`, `default_start_date`, `default_stop_date`,
`initialDate`, `group_by`. Context keys the view gives to the create dialog,
the create action and the plan dialog: the start and stop field names, their
`default_` forms, and for a click or selection in a grouped view each grouping
field's name with its `default_` and `search_default_` forms (see the
[user page](../../docs/modules/gantt_view.md#context-given-to-dialogs-and-actions)).

## Provenance

Written in a clean room from the spec package of slice 002a-gantt-display. The
provenance record is `provenance/web_gantt.yaml`. See
[docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

The Hoot suite is in `static/tests/` (loaded in `web.assets_unit_tests`, one
file per area, scenarios named `A<n>: ...`; the editing ones, in
`timeline_editing`, `timeline_editor`, `timeline_cell_click`,
`timeline_selection`, `timeline_plan` and `timeline_record_dialog`
`.test.js`, start with `002b `), run through
`tests/test_hoot.py`. The scratch host, tours, probes and backend tests live in
the hidden module [`test_web_gantt`](../test_web_gantt/README.md).

```
make test MODULES=web_gantt,test_web_gantt
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`,
for example `... run --rm odoo odoo -d <db> -i web_gantt,test_web_gantt
--test-tags /web_gantt,/test_web_gantt --stop-after-init`.
