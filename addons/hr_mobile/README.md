# Employees Mobile (`hr_mobile`)

With the Employees application installed, My Preferences uses the Employees form
type. This module makes that form send the saved account details (name, login,
picture) to the native app first, and only then run the Community follow-up (the
reload after a language change). A failed or missing answer from the app never
stops the follow-up. User guide:
[docs/modules/mobile_bridge.md](../../docs/modules/mobile_bridge.md).

Depends on `hr` and [`web_mobile`](../web_mobile/README.md); installs itself
automatically (`auto_install`) when both are present. No menu, no setting.

## Scope

Patches the controller of the Employees preferences form type. The account
request itself (capability `updateAccount`, service `mobile`), the wait for the
app's answer, and the rule that the iOS app is not waited for, live in
`web_mobile`. Failed answers write one `[cwm]` console entry and show nothing.
The view record of `web_mobile` gets a priority such that the Employees form type
still wins over the one of `web_mobile`.

## Provenance

Spec package: slice 001c-mobile-bridge. The provenance record is
`provenance/hr_mobile.yaml`. See
[docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

`tests/test_install.py` (installation and form type) and `tests/test_hr_prefs.py`
(save, order of the update and the language reload, answers that fail). They use
the test host helper `CwmHostCase` of `web_mobile` (see its
[README](../web_mobile/README.md#tests)), and need `hr`.

The module belongs to three of the four test databases (full, Employees only, and
point of sale with Employees). Employees only:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <fresh_db> -i web_mobile,hr --with-demo --log-level=warn --test-tags /web_mobile,/hr_mobile --stop-after-init
```

The full matrix, with the exact commands for all four databases, is in the
[`web_mobile` README](../web_mobile/README.md#tests).
