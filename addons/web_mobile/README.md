# Mobile (`web_mobile`)

Connects the web client to the native Complete apps for Android and iOS. The apps
load the web client in an embedded browser and give the page a host object; this
module reads it and turns each capability the app lists into a feature. In a
normal browser, where there is no host object, nothing changes. User guide:
[docs/modules/mobile_bridge.md](../../docs/modules/mobile_bridge.md).

The module depends on `web_enterprise` and installs itself automatically
(`auto_install`). It adds no menu and no setting. The two companion modules
[`hr_mobile`](../hr_mobile/README.md) (Employees preferences) and
[`pos_hr_mobile`](../pos_hr_mobile/README.md) (camera badge scan on the point of
sale login) install themselves when their applications are present.

## What it adds

- **The bridge**, service `mobile`: detects the host object once at start-up, reads
  the capability list, removes the global and keeps a private reference. Its member
  `bus` is an event channel for the hardware readers; the event is
  `mobile_reader_scanned`. The reader loop runs while the channel has a listener.
- **User menu**: **Add to Home Screen** and **Switch/Add Account** (the latter
  replaces `log_out`), each shown only when the app lists its capability.
- **Data kept in step**: the application list (from the `HOME-MENU:APPS-UPDATED`
  event of `web_enterprise`, which carries `{apps}`) and the account details (at
  page load and after a successful save of My Preferences).
- **Device integrations**: downloads, history moves, the device back button, error
  reports, shared files.
- **Server**: the read-only field `image_medium` on contacts (and so users), and the
  view record `web_mobile.view_users_form_simple_modif`, whose form type reports the
  account details after a save.
- **iOS list**: the markup hooks for the one-row-per-application list; the layout
  itself is in `web_enterprise` (see its README).

## Native interface

Names are fixed by the apps; the exact shapes are in the slice model. In short:

| Part | Name |
|---|---|
| Host object | `OdooDeviceUtility` (methods `list_plugins` and `execute`), optional helper `OdooDevicePolyfill` |
| Answer function | `odoo.native_notify`, always defined by the page |
| Capabilities used | `addHomeShortcut`, `switchAccount`, `updateAvailableApps`, `updateAccount`, `downloadFile`, `hashChange`, `overrideBackButton`, `crashManager`, `getShareTargetFiles`, `enableReader`, `getReaderData` |
| App event | `backbutton`, a DOM event on `document` |
| Share address | `/share_target.localhost/?uri=` |
| Session value | `time_between_reads_in_ms` (reader polling interval, default 100) |
| Service | `mobile`, member `bus`, event `mobile_reader_scanned` |

Features follow capabilities, never the platform. Capabilities that this module
does not use stay callable by name for other modules. The platform markers in the
browser identification are used only by the account update (the iOS app does not
answer it, so the page does not wait) and by the iOS list.

## Rulings that affect behaviour

- Failed answers to background updates (account details, error report, unreadable
  picture) write one `console.warn` prefixed `[cwm]` and show nothing.
- Where the original shows the generic error dialog, a warning notice is shown
  instead: the home menu shortcut, an application without a picture icon, a file
  built inside the page, shared files that cannot be loaded. The texts are in
  [docs/modules/mobile_bridge.md](../../docs/modules/mobile_bridge.md).
- Reader polls wait for the previous answer for at most 1000 ms; no "reader off"
  request is sent.
- The Community version answer is unchanged; no edition marker is added.

## Provenance

Spec package: slice 001c-mobile-bridge. See
[docs/process.md](../../docs/process.md) and
[docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

| Layer | Where |
|---|---|
| Install and server | `tests/test_install.py`, `tests/test_server.py` |
| Hoot (browser unit tests) | `static/tests/*.test.js` with the fake host in `static/tests/helpers/fake_host.js`, run by `tests/test_js.py` |
| Real browser sessions | `tests/test_bridge.py`, `test_user_menu.py`, `test_sync.py`, `test_device.py`, `test_errors_shares.py`, `test_reader.py` |
| Screenshots (on demand) | `tests/test_screens.py`, tag `mobile_bridge_screens` |

**Test host helper.** `tests/mobile_host.py` defines `CwmHostCase`. Its
`host_session(...)` opens Chrome over DevTools, sets the browser identification
(Android app, iOS app or a normal browser), the viewport and touch, and installs
`tests/host_stub.js` before the page's own scripts, so the page sees a host object
like the apps provide. The stub records every request and answers as configured.

**Five configurations.** Run the module's tests (and the shell's) on each of these.
Python tests that need an application skip when it is not installed. The tests set up
what they need themselves, so they pass with and without demo data.

| Database | Modules | Tags |
|---|---|---|
| full | `web_mobile,hr_mobile,pos_hr_mobile,contacts,crm,project,project_todo,hr,hr_expense,account,calendar,point_of_sale,pos_hr` | `/web_enterprise,/web_mobile,/hr_mobile,/pos_hr_mobile` |
| base (no Employees, no point of sale) | `web_mobile,contacts,crm` | `/web_enterprise,/web_mobile` |
| Employees only | `web_mobile,hr` | `/web_mobile,/hr_mobile` |
| point of sale with Employees | `web_mobile,pos_hr` | `/web_mobile,/hr_mobile,/pos_hr_mobile` |
| CI (fresh database, no demo data) | `hr_mobile,pos_hr_mobile,test_timer,timer,web_enterprise,web_mobile` | `/hr_mobile,/pos_hr_mobile,/test_timer,/timer,/web_enterprise,/web_mobile` |

Each is one command with a fresh database name, for example the full one:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <fresh_db> -i web_mobile,hr_mobile,pos_hr_mobile,contacts,crm,project,project_todo,hr,hr_expense,account,calendar,point_of_sale,pos_hr --with-demo --log-level=warn --test-tags /web_enterprise,/web_mobile,/hr_mobile,/pos_hr_mobile --stop-after-init
```

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <fresh_db> -i web_mobile,contacts,crm --with-demo --log-level=warn --test-tags /web_enterprise,/web_mobile --stop-after-init
```

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <fresh_db> -i web_mobile,hr --with-demo --log-level=warn --test-tags /web_mobile,/hr_mobile --stop-after-init
```

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <fresh_db> -i web_mobile,pos_hr --with-demo --log-level=warn --test-tags /web_mobile,/hr_mobile,/pos_hr_mobile --stop-after-init
```

The CI configuration is the same command without `--with-demo`:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <fresh_db> -i hr_mobile,pos_hr_mobile,test_timer,timer,web_enterprise,web_mobile --log-level=warn --test-tags /hr_mobile,/pos_hr_mobile,/test_timer,/timer,/web_enterprise,/web_mobile --stop-after-init
```

Logged `ERROR` lines for errors "after termination" and one empty-name constraint
are expected: those tests raise them on purpose.

**Screenshots** (the pictures in `docs/assets/mobile_bridge/`). Container output
must not land in a tracked directory: bind a git-ignored host directory and run as
the normal (non-root) user. Create it first (`mkdir -p .cache/mobile_bridge_screens`),
then, with the absolute path of your checkout and a database that has demo data and
these modules installed:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm -v /path/to/complete/.cache/mobile_bridge_screens:/mnt/cwm_shots odoo odoo -d <db> -u web_mobile,pos_hr_mobile --test-tags mobile_bridge_screens --screenshots /mnt/cwm_shots --stop-after-init
```

The pictures keep a few capture helpers: scroll bars hidden, the browser's own
"Install App" entry removed from the user menu. In a guarded session see
[docs/isolation.md](../../docs/isolation.md#containers).
