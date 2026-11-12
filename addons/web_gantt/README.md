# Gantt View (`web_gantt`)

A read-only Gantt (timeline) view for the web client: records are drawn as
pills on a time grid, in rows that can be grouped by any field. User
documentation: [docs/modules/gantt_view.md](../../docs/modules/gantt_view.md).

The module depends on `web` only, installs automatically with it, has no menu
or setting and adds no model. It does not edit records: editing, dependencies
and the HR and time-off bridges come in later slices.

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
| `timeline_model.js` | Loads data, builds rows, remembers the range (`rangeOf-viewId-<id>` in the browser storage), sample state. |
| `timeline_controller.*` | Control bar, range menu with the custom range, phone gear menu. |
| `timeline_renderer.*`, `timeline_popover.*` | Grid, rows, pills, total row; the popover. |
| `timeline.variables.scss`, `timeline.variables.dark.scss` | Own `!default` variables for the values that match no theme role. Every other colour is a theme role, so the view compiles on Community alone and follows the dark scheme when `web_enterprise` is installed. |

## Configuration

The attributes of the `gantt` element are listed in the
[user page](../../docs/modules/gantt_view.md#for-developers): `date_start`,
`date_stop`, `string`, `default_range`, `default_scale`, `scales`, `precision`,
`color`, `decoration-*`, `progress`, `pill_label`, `thumbnails`,
`display_mode`, `total_row`, `progress_bar`, `display_unavailability`,
`groups_limit`, plus the Community ones (`default_group_by`, `sample`,
`create`, `edit`, `delete`, `class`, `js_class`). The editing and dependency
attributes are accepted and ignored for now. Context keys read by the view:
`default_range`, `default_scale`, `default_start_date`, `default_stop_date`,
`initialDate`, `group_by`.

## Provenance

Written in a clean room from the spec package of slice 002a-gantt-display. The
provenance record is `provenance/web_gantt.yaml`. See
[docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

The Hoot suite is in `static/tests/` (loaded in `web.assets_unit_tests`, one
file per area, scenarios named `A<n>: ...`), run through
`tests/test_hoot.py`. The scratch host, tours, probes and backend tests live in
the hidden module [`test_web_gantt`](../test_web_gantt/README.md).

```
make test MODULES=web_gantt,test_web_gantt
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`,
for example `... run --rm odoo odoo -d <db> -i web_gantt,test_web_gantt
--test-tags /web_gantt,/test_web_gantt --stop-after-init`.
