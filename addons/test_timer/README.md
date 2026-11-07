# Timer Tests (`test_timer`)

Hidden test module for [Timer](../timer/README.md). It is not meant for
production databases. The name `test_timer` is kept from the original test
module for compatibility (see
[docs/module-authoring.md](../../docs/module-authoring.md#naming)).

## Contents

- **Test models.** Two documents that use the timer behaviour: `timer.test`
  ("Timer Model", with a name and an "Hours Already Logged" field) and
  `timer.test.interruption`, whose running timer is stopped instead of paused
  when another timer starts. Three more models exist only for tests:
  `timer.test.parent` and `timer.test.parent.empty` (parent timer behaviour,
  with and without a child document) and `timer.test.restricted` (documents
  some users may read but not delete).
- **Host screens.** A "Timer Tests" menu with a list and a form of
  `timer.test`. They show the running clock, a start/stop button in each list
  row and Start, Pause, Resume and Stop buttons in the form. They exist to run
  the browser tests, take screenshots and let a reviewer try the timer.
- **Demo data.** Five `timer.test` documents, loaded with `--with-demo`.
  "Write report" has 1.5 hours already logged.
- **Tests.** Test names carry the id of the acceptance scenario or spec rule
  they check (for example `test_A7_stop_on_paused_counts_to_pause`).

| File | Covers |
|---|---|
| `tests/test_timer_record.py` | timer record, rounding helper, server clock, access (A11, A12, A20, A21, A31) |
| `tests/test_timer_mixin.py` | start, pause, resume, stop, interruption (A1–A10, A13, A14, A22, A23, A26, A28–A30) |
| `tests/test_timer_delete.py` | deletion and rights (A17–A19, A27) |
| `tests/test_timer_search.py` | searches (A15, A16) |
| `tests/test_timer_parent.py` | parent timer behaviour (A24, A25, A32) |
| `tests/test_js.py` | runs the JavaScript unit tests in `addons/timer/static/tests/` in headless Chrome (U1–U10, R19–R22, V1) |
| `tests/test_tours.py` | browser tours on the host screens (U1–U3, U5, U8, U9) |

## Running

```
make test MODULES=timer,test_timer
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers). The browser tests
need the Chrome layer of `docker/Dockerfile`; without Chrome, Odoo skips them.
