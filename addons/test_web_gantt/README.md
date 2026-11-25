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
  and the two mixed-type views), the editing hosts H16 to H29, the drag hosts H30 to H32 and the multi-create hosts H33 to H41 (below), their
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
- **H30 to H32, the drag hosts** (slice 002b2), each with an action and a menu
  entry under **Gantt Host**. H30: the view of the editing hosts without
  planning, grouped by Parent and then by Created by (a read-only field, so its
  rows refuse drops). H31: the same view with `disable_drag_drop` on and no
  grouping. H32: H30's view grouped by Parent, Created by and Contact.
- **H33 to H41, the multi-create and schedule hosts** (slice 002b3), each with an
  action and a menu entry under **Gantt Host**. H33: the first model with a
  template form (`multi_create_view`), ungrouped. H34: the same view grouped by
  Parent and Contact. H35: the date-only model with a template form and no
  planning. H36 and H37: scheduling on, no planning, ungrouped and grouped by
  Parent. H38: an empty view with sample data and scheduling. H39: scheduling
  with `edit="0"`. H40: template form and scheduling together. H41: H36's view
  grouped by Parent and Created by (a read-only field, so no row accepts a
  panel drop).
- **H42 to H54, the dependency hosts** (slice 002c). Two float host fields,
  **Buffer before** and **Buffer after** (`x_buffer_before`, `x_buffer_after`),
  and links between existing records written by the builder (Design blocks
  Build, Build blocks Test, Review blocks Overlap A, and on the date-only model
  Three days blocks Day one; buffers 24/12 on Design and 12/24 on Review). H42:
  dependency arrows, grouped by Parent. H43: the same view grouped by Tags.
  H44: adds the two buffer fields. H45: the date-only model with dependencies.
  H46 and H47: H42's and H45's views opened on 12 June 2030 for the prepared
  records below. H48: dependencies with a template form (multi-create). H49:
  `edit="0"`. H50: an empty sample view with dependencies. H51 to H53: H36's
  scheduling view with a date filter in the action's domain (plain, under "or",
  negated). H54: `edit="1"` explicitly, for the restricted user.
- **The prepared rescheduling records**:
  `test.web.gantt.pill._tl_build_reschedule_records()` deletes any leftover and
  creates Chain A, B, C and the cyclic Loop 1 and 2 on the first model and Chain
  A and B on the date-only model (June 2030, created by the administrator); it
  returns them by name (`dated Chain A` and `dated Chain B` for the second
  model). `_tl_drop_reschedule_records()` deletes them by name on both models.
- **The template forms**: two small forms with priority 99, one per model
  (`host_form_template_one`: name required, contact, tags, colour;
  `host_form_template_two`: name required). The date-only model also gets an
  explicit default form (priority 1) so that its create dialogs have a fixed
  layout.
- **The right-to-left user**: `test.web.gantt.pill._tl_rtl_user(env=None)`
  activates Arabic (`ar_001`) with its translations and returns the user
  "RTL Admin" (login and password `rtl`, the administrator's groups and time
  zone), creating it when missing and returning the same one afterwards. The
  module's data and demo files **do not call it** and activate no language: a
  database installed with the demo data keeps the languages it had. Tests and
  verifiers that need the user call the helper themselves (an Odoo shell, or a
  `-i`-time test: `env['test.web.gantt.pill']._tl_rtl_user()`).
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
  views, including the same-day case. The administrator (`base.user_admin`) creates
  every record, so the "Created by" rows of H30 and H32 carry that name. Demo data calls it; tests that need the records call it
  too (without demo data, as in CI). A second call **moves the records in
  place**: they are found by name (archived ones too) and rewritten with the
  full values of the table, so every id stays the same and a rebuild equals a
  fresh build.
- **Hook override for tests**: `test.web.gantt.pill` overrides
  `_gantt_unavailability` and `_gantt_progress_bar`. When the system parameter
  `test_web_gantt.hook_answers` holds JSON of the shape
  `{"unavailability": {field: {id: [{"start": ..., "stop": ...}]}}, "progress":
  {field: {id: {"value": ..., "max_value": ..., "warning": ...}}}}` the override
  answers from it; with no parameter it returns the (empty) base answer.

## Slice 002c: running its tests

- **Tours:** `--test-tags /test_web_gantt:TestTimelineDependencyTours` and
  `/test_web_gantt:TestTimelineRescheduleTours`, on a database where the module
  is installed or updated (`-u test_web_gantt,web_gantt` on an existing one, as
  `-i` of an installed module runs no tests). The tours build the records they
  need and put the links they change back afterwards.
- **The clock D0:** the H42 tours and the probes run with the browser clock set
  to 12 November 2026, 12:00 (`D0` in the two tour classes), so "today" and the
  positions of the host records are the same on every day; the browser zone is
  three hours ahead of UTC for the probes and for the A77 tour, and the
  server's own clock decides only the plain-write scenarios on H42 (its records
  lie in the past). Tours on H46 and H47 (June 2030) use the browser's own
  clock, since their action sets the date.
- **Probes:** `--test-tags timeline_probes/test_web_gantt:TimelineDependencyProbes`
  on a database with `-i test_web_gantt,web_enterprise`; without
  `web_enterprise` the dark readings are skipped. Expected values are copied
  from the spec into `tests/timeline_dependency_probe_values.py`. Three
  readings are **not compared**, by ruling, and the probe class logs them
  (`PROBE-SKIPPED`) instead of failing: M4 and M11 (the original's empty
  outline element; decision D5 says no outline is drawn), and in M49 the
  `overflow` of the week header (the sticky label would stop following the
  scroll if it were hidden, T19-2) and its `geometry.x`, which differs by one
  pixel because of the centring of the focus day by earlier slices (T19-3).
- **Screenshots:** `--test-tags gantt_dependency_screens --screenshots <dir>`
  with the mounted directory as described below; the files 75 to 88 land in
  `<dir>/gantt_view/`.
- **Prepared records:** the helpers `_tl_build_reschedule_records()` and
  `_tl_drop_reschedule_records()` of `test.web.gantt.pill` (above) give the
  chains, loops and date-only records the rescheduling tests use; they are
  created by the test, never by the demo data, so tests pass with and without
  demo data.

## Tests

| Where | What |
|---|---|
| `tests/test_install.py`, `test_view_type.py`, `test_validation.py`, `test_default_view.py`, `test_gantt_data.py`, `test_access_rights.py`, `test_host.py` | Backend tests: view type and action mode, validator messages, generated view, `get_gantt_data` (grouping, paging, date-only fields, archived records, hooks), access, host data. |
| `static/tests/tours/timeline_tours.js`, `tests/test_tours.py` | Tours for behaviour that needs the live client: scrolling to today, remembered range, restoring the view after the list, row header scrolling, group row hover. |
| `tests/test_probes.py` (tag `timeline_probes`) | Opens the host views in a real Chrome, light and dark, desktop and phone, and compares measured styles and geometry with the spec's values. The dark probes are skipped without `web_enterprise`. Newer probes cover the scroll area reaching the view bottom (M65, with scrollbars turned on and a check that a scrollbar is drawn there), the custom line's date width, padding and Apply position (M73, M75), the date colour while a picker is open (M76, including a click inside the picker) and the phone bar spacing (M77 to M79, with a touch variant). |
| `static/tests/tours/timeline_edit_tours.js`, `tests/test_edit_tours.py` | Editing tours (scenarios A8 to A49c of slice 002b): selection and create dialog, edge scrolling on desktop and phone (mouse and touch), plan dialog from a row, Create New in the plan dialog, opening and renaming, the dialog waiting for a write, delete and keep, the restricted user, explicit-yes views (A1b read-only dialog, A1c server refusals), phone taps, long press, mouse drag and popover, New on the week in a Monday-first language, create and search, the popover switch, planning on a date-only model. |
| `tests/test_edit_host.py` | Backend tests of the editing hosts: H16 to H29 load with their options, the loader switches create, edit and delete off for the restricted user unless the view says yes (and the same for the forms), internal users read-only on the first model. |
| `tests/test_edit_probes.py` + `tests/timeline_edit_probe_values.py` (tag `timeline_probes`, class `TimelineEditProbes`) | Probes M1 to M37 of slice 002b in a real Chrome, light and dark, desktop and phone (with the middle-zone phone gesture and a touch variant): selection highlight and badges, New button, popover buttons, dialog sizes, Remove, the deletion box. Expected values are in the values file. |
| `static/tests/tours/timeline_drag_tours.js`, `tests/test_drag_tours.py` (class `TestTimelineDragTours`) | Drag tours of slice 002b2 (the scenarios of A1 to A76 that need the live client): moves, copies, Ctrl during a move, Undo and its notification, refused drops, read-only grouping rows, resizes and invalid ones, locks, edge scrolling, date-only fields, right-to-left, the phone with touch emulation, plus the notes on 002a and 002b (focus date, click lock, offline deletion, read-only button, empty-value rows). |
| `tests/test_drag_host.py` | Backend tests: H30 to H32 views, actions and menus, the `rtl` user helper (and the Arabic unit words reaching the browser), and the undo method `gantt_undo_drag_drop` (reschedule, copy, missing record, empty mapping, unknown kind, access error). |
| `tests/test_drag_probes.py` + `tests/timeline_drag_probe_values.py` (tag `timeline_probes`, class `TimelineDragProbes`) | Probes M1 to M61 of slice 002b2 in a real Chrome, light and dark, desktop and phone: move, copy, handles, resize, locks, notifications, right-to-left badges, the plan dialog's search bar. Run only these with `--test-tags timeline_probes/test_web_gantt:TimelineDragProbes`. |
| `static/tests/tours/timeline_multi_tours.js`, `tests/test_multi_tours.py` (class `TestTimelineMultiTours`) | Tours of slice 002b3 for the scenarios that need the live client: selecting by click, drawing and headers, the buttons, the template form popover, the stored records after Add and Delete (checked by the Python test after the tour), the side panel, Load more, dragging onto the grid and onto the drop zone, resizing, closing and reopening, the phone. Real pointer events come from `tests/timeline_real_pointer.py`. |
| `tests/test_dependency_host.py` (class `TestDependencyHost`) | Backend tests: H42 to H54 load with their attributes, actions and contexts, the buffer fields, the dependency links and buffers kept by a rebuild, the prepared rescheduling records, the restricted user's edit flag. |
| `tests/test_reschedule.py` (classes `TestReschedule`, `TestRescheduleDates`) | Backend tests of the server rescheduling on the prepared records: both methods, forward, backward and only-stop cases, plain writes (past start, no stop, no dates), the past error and the rollback, cycles, a blocker without dates, property sub-fields, a user who may read but not write, the unknown method, the rollback method, and the same cases on the date-only model in whole days (with the clock frozen where the result depends on it). |
| `static/tests/tours/timeline_dependency_tours.js`, `tests/test_dependency_tours.py` (class `TestTimelineDependencyTours`) | Tours of slice 002c for the arrows, drawing, removal, the method menu and switch, buffers, the phone and sample cases: which arrows (also after a range step or a search), colours, highlight and layering, handles, drawing with the exact gesture, touch, locked pills, hidden arrows, stored choices, no arrow lit after a gesture. Shared helpers (`realMouse` and the others) are exported from this file. |
| `static/tests/tours/timeline_reschedule_tours.js`, `tests/test_reschedule_tours.py` (class `TestTimelineRescheduleTours`) | Tours of the rescheduling by a real move or resize: both methods, the notification and Undo, warnings, no-op drops, the phone, the date-only model, a move across rows with Undo, two writes in a row, and the week header label of another year. The H46 and H47 tours use the browser's own clock; the H42 ones use the fixed clock below. |
| `tests/test_dependency_probes.py` + `tests/timeline_dependency_probe_values.py` (tag `timeline_probes`, class `TimelineDependencyProbes`) | Probes M1 to M50 of slice 002c in a real Chrome, light and dark, desktop and phone: arrows, handles, drawing, the method menu, notifications, buffer bands, the side panel line and the week header. Only these: `--test-tags timeline_probes/test_web_gantt:TimelineDependencyProbes`. |
| `tests/test_multi_host.py` | Backend tests: H33 to H41 load with their options, the template forms, the explicit default form, and the builder that moves records in place and keeps their ids. |
| `tests/test_multi_probes.py` + `tests/timeline_multi_probe_values.py` (tag `timeline_probes`, class `TimelineMultiProbes`) | Probes M1 to M74 of slice 002b3 in a real Chrome, light and dark, desktop and phone: selection tint, buttons, popover, panel, strip, drop zone, row header widths, text selection. Only these: `--test-tags timeline_probes/test_web_gantt:TimelineMultiProbes`. |
| `tests/test_dependency_screens.py` (tag `gantt_dependency_screens`, class `TimelineDependencyScreens`) | The documentation screenshots 75 to 88 of `gantt_view` (arrows, handles, drawing, method menu, buffers, rescheduling, a loop, the date-only model), on demand, not part of the normal run. |
| `tests/test_multi_screens.py` (tag `gantt_multi_screens`) | The documentation screenshots 53 to 74 of `gantt_view`, on demand, not part of the normal run. |
| `tests/test_drag_screens.py` (tag `gantt_drag_screens`) | The documentation screenshots 33 to 52 of `gantt_view`, on demand, not part of the normal run. |
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
Screenshots: `--test-tags gantt_view_screens --screenshots <dir>` (and
`gantt_edit_screens`, `gantt_drag_screens`) on a database with
`web_enterprise`; the files land in `<dir>/gantt_view/`. Write them under the
git-ignored `.cache/` of the checkout through a bind mount, as the
[web_enterprise](../web_enterprise/README.md) screenshots do. Create
the directory yourself and make it writable for the container's user (the run
is not root), then:

```
mkdir -p /path/to/complete/.cache/gantt_multi_screens
chmod 777 /path/to/complete/.cache/gantt_multi_screens
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm -v /path/to/complete/.cache/gantt_multi_screens:/mnt/cwg_shots odoo odoo -d <db> -i test_web_gantt,web_enterprise --with-demo --screenshots /mnt/cwg_shots --test-tags gantt_multi_screens --stop-after-init
```

The files (images 53 to 74) land in `.cache/gantt_multi_screens/gantt_view/`;
copy the ones you keep into `docs/assets/gantt_view/`. Drag tours:
`--test-tags /test_web_gantt:TestTimelineDragTours`; host and undo tests:
`/test_web_gantt:TestTimelineDragHost` and
`/test_web_gantt:TestTimelineUndoMethod`.

## Provenance

Spec packages: slices 002a-gantt-display, 002b-gantt-editing,
002b2-gantt-drag-resize, 002b3-gantt-multi-create and 002c-gantt-dependencies. The provenance record is
`provenance/test_web_gantt.yaml`. See
[docs/module-authoring.md](../../docs/module-authoring.md).
