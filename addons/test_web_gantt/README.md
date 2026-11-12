# test_web_gantt

Test models and a scratch host for the [Gantt view](../web_gantt/README.md).
Hidden module, never installed in production. User documentation:
[docs/modules/gantt_view.md](../../docs/modules/gantt_view.md).

## What it holds

- **Two test models**: `test.web.gantt.pill` (date-and-time start and stop,
  parent, dependency relations, properties) and `test.web.gantt.pill2` (date
  start and stop, no properties). Every internal user may read, create, change
  and delete both.
- **The scratch host**: custom fields on `test.web.gantt.pill` created as data
  (`x_progress`, `x_color`, `x_flagged`, `x_done`, `x_contact`, `x_tags`);
  fourteen Gantt views H1 to H12, H14 and H15 (main, grouped by parent, by
  parent and contact, by tags, minimal, labels in sparse mode, custom popover,
  empty with and without sample data, dated, colour by contact, unavailability,
  and the two mixed-type views), their window actions (view modes
  `gantt,list,form`) and a top menu **Gantt Host**.
- **H13, the search view**: a search view with an **Archived** filter and
  group-bys for parent, contact and tags; it is the search view of every action
  on the first model (not of H10, which has its own model). Archived records
  are reached through its filter.
- **H14 and H15, mixed field types**: a host field **Day** (`x_day`, date only)
  and two views over the records whose name starts with "MIX": H14 starts at
  Day and stops at the stop datetime, H15 starts at the start datetime and
  stops at Day.
- **Host records**: `test.web.gantt.pill._tl_build_host_records(today=None,
  tz_offset_hours=3)` creates the records the scenarios need, around today in a
  +3 hour browser time, among them the four **MIX** records (first, last,
  before, after) at 10:00 and 12:00 UTC on their day that exercise the mixed
  views, including the same-day case. Demo data calls it; tests that need the records call it
  too (without demo data, as in CI).
- **Hook override for tests**: `test.web.gantt.pill` overrides
  `_gantt_unavailability` and `_gantt_progress_bar`. When the system parameter
  `test_web_gantt.hook_answers` holds JSON of the shape
  `{"unavailability": {field: {id: [{"start": ..., "stop": ...}]}}, "progress":
  {field: {id: {"value": ..., "max_value": ..., "warning": ...}}}}` the override
  answers from it; with no parameter it returns the (empty) base answer.

## Tests

| Where | What |
|---|---|
| `tests/test_install.py`, `test_view_type.py`, `test_validation.py`, `test_default_view.py`, `test_gantt_data.py`, `test_access_rights.py`, `test_host.py` | Backend tests: view type and action mode, validator messages, generated view, `get_gantt_data` (grouping, paging, date-only fields, archived records, hooks), access, host data. |
| `static/tests/tours/timeline_tours.js`, `tests/test_tours.py` | Tours for behaviour that needs the live client: scrolling to today, remembered range, restoring the view after the list, row header scrolling, group row hover. |
| `tests/test_probes.py` (tag `timeline_probes`) | Opens the host views in a real Chrome, light and dark, desktop and phone, and compares measured styles and geometry with the spec's values. The dark probes are skipped without `web_enterprise`. |
| `tests/test_screens.py` (tag `gantt_view_screens`) | Takes the documentation screenshots on demand, the phone ones on an emulated touch phone; not part of the normal run. |

The Hoot tests of the browser view are in
[`web_gantt`](../web_gantt/README.md#tests).

```
make test MODULES=web_gantt,test_web_gantt
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers), with `-i
test_web_gantt,web_enterprise --with-demo --test-tags /web_gantt,/test_web_gantt`
for a demo run. Probes: `--test-tags timeline_probes/test_web_gantt`. A probe page opens
with the viewport's own touch setting (touch for the phone, none for the
desktop); the `touch` option of the probe's `page` overrides it, for example to
read the phone without touch.
Screenshots: `--test-tags gantt_view_screens --screenshots <dir>` on a database
with `web_enterprise`; the files land in `<dir>/gantt_view/`.

## Provenance

Spec package: slice 002a-gantt-display. The provenance record is
`provenance/test_web_gantt.yaml`. See
[docs/module-authoring.md](../../docs/module-authoring.md).
