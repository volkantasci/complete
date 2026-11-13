# test_web_gantt

Test models and a scratch host for the [Gantt view](../web_gantt/README.md).
Hidden module, never installed in production. User documentation:
[docs/modules/gantt_view.md](../../docs/modules/gantt_view.md).

## What it holds

- **Two test models**: `test.web.gantt.pill` (date-and-time start and stop,
  parent, dependency relations, properties) and `test.web.gantt.pill2` (date
  start and stop, no properties). On the first model internal users may only
  read and Settings administrators have full rights; on the second every
  internal user may read, create, change and delete. So an ordinary internal
  user is the read-only (restricted) user of the editing tests on the first
  model, and can still create on the second.
- **The scratch host**: custom fields on `test.web.gantt.pill` created as data
  (`x_progress`, `x_color`, `x_flagged`, `x_done`, `x_contact`, `x_tags`);
  fourteen Gantt views H1 to H12, H14 and H15 (main, grouped by parent, by
  parent and contact, by tags, minimal, labels in sparse mode, custom popover,
  empty with and without sample data, dated, colour by contact, unavailability,
  and the two mixed-type views) and the editing hosts H16 to H29 (below), their
  window actions (view modes
  `gantt,list,form`) and a top menu **Gantt Host**.
- **H16 to H29, the editing hosts** (slice 002b). H16: the default form view
  (priority 1: name, parent, contact, tags, dates, colour, progress) and list
  view of the first model, and an action with only list and form. H17: a view
  with the short form (`form_view_id`) and no planning. H18: no planning
  (a click creates). H19: `edit="0"` with a popover switch. H20: `create="0"`.
  H21: `delete="0"`, no planning. H22: a create action (`on_create`, a short
  form in a dialog, "Host quick create"). H23: `cell_create="0"`, no planning.
  H24: a popover with an editable switch and an Archive button. H25: the
  date-only model without planning. H26 and H27: H18's view grouped by parent
  (with a default parent) and by tags. H28: no planning, `edit` and `delete`
  explicitly yes. H29: the same with its own form view, which also says yes to
  edit, create and delete. Each has an action and a menu entry under
  **Gantt Host**; the new actions open in `gantt,list,form`.
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
| `tests/test_probes.py` (tag `timeline_probes`) | Opens the host views in a real Chrome, light and dark, desktop and phone, and compares measured styles and geometry with the spec's values. The dark probes are skipped without `web_enterprise`. Newer probes cover the scroll area reaching the view bottom (M65, with scrollbars turned on and a check that a scrollbar is drawn there), the custom line's date width, padding and Apply position (M73, M75), the date colour while a picker is open (M76, including a click inside the picker) and the phone bar spacing (M77 to M79, with a touch variant). |
| `static/tests/tours/timeline_edit_tours.js`, `tests/test_edit_tours.py` | Editing tours (scenarios A8 to A49c of slice 002b): selection and create dialog, edge scrolling on desktop and phone (mouse and touch), plan dialog from a row, Create New in the plan dialog, opening and renaming, the dialog waiting for a write, delete and keep, the restricted user, explicit-yes views (A1b read-only dialog, A1c server refusals), phone taps, long press, mouse drag and popover, New on the week in a Monday-first language, create and search, the popover switch, planning on a date-only model. |
| `tests/test_edit_host.py` | Backend tests of the editing hosts: H16 to H29 load with their options, the loader switches create, edit and delete off for the restricted user unless the view says yes (and the same for the forms), internal users read-only on the first model. |
| `tests/test_edit_probes.py` + `tests/timeline_edit_probe_values.py` (tag `timeline_probes`, class `TimelineEditProbes`) | Probes M1 to M37 of slice 002b in a real Chrome, light and dark, desktop and phone (with the middle-zone phone gesture and a touch variant): selection highlight and badges, New button, popover buttons, dialog sizes, Remove, the deletion box. Expected values are in the values file. |
| `tests/test_screens.py` (tag `gantt_view_screens`) | Takes the documentation screenshots on demand, the phone ones on an emulated touch phone; not part of the normal run. |
| `tests/test_edit_screens.py` (tag `gantt_edit_screens`) | The same for the editing screens, images 20 to 32 of `gantt_view`, on demand. |

The Hoot tests of the browser view, among them the editing ones, are in
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
