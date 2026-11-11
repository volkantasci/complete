# Point of Sale Camera Badge Login (`pos_hr_mobile`)

On the point of sale login screen with employee login enabled, the badge scanner
button of the PIN step opens the Community camera barcode scanner. The code it
reads is passed to the point of sale's barcode reader like a code from a hardware
scanner, so the Community badge rules apply. An empty code closes the scanner and
shows a warning asking to scan again. User guide and setup steps:
[docs/modules/mobile_bridge.md](../../docs/modules/mobile_bridge.md).

Depends on `pos_hr` and [`web_mobile`](../web_mobile/README.md); installs itself
automatically (`auto_install`) when both are present. No menu, no setting.

## Scope

Browser part only, inside the point of sale bundle (`point_of_sale._assets_pos`).
No bridge code of `web_mobile` is loaded there; the scan works in any browser that
offers camera access. The module also loads the Community barcode scanner styles
into the point of sale and one colour rule (the action teal, from the Community
variable available in that bundle) for primary buttons inside the mobile barcode
container; neither exists on the login screen.

## Rulings that affect behaviour

- The two buttons of the PIN panel (cashier list and badge scanner) have a 6 px
  corner radius, the measured value; nothing else on the login screen changes.
  Complete's own theme does not reach the point of sale bundle, which would
  otherwise draw 4 px.
- An empty code shows a warning notice ("No code was read. Please scan the badge
  again.") instead of the original's error dialog. The notice has type `warning`.
- After a non-empty code the device vibrates for 100 ms where it can.

## Provenance

Spec package: slice 001c-mobile-bridge. See
[docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

| Layer | Where |
|---|---|
| Install | `tests/test_install.py` |
| Badge scan (point of sale tours in a real browser, with a camera stand-in) | `tests/test_badge_scan.py`, `static/tests/tours/badge_scan_tours.js`, `static/tests/camera_standin.js` |
| Screenshots (on demand, tag `mobile_bridge_screens`) | `tests/test_screens.py`, `static/tests/tours/badge_screens_tours.js` |

The tests belong to two of the four databases of the
[`web_mobile` README](../web_mobile/README.md#tests) (full, and point of sale with
Employees). The latter:

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <fresh_db> -i web_mobile,pos_hr --with-demo --log-level=warn --test-tags /web_mobile,/hr_mobile,/pos_hr_mobile --stop-after-init
```

Screenshots use the non-root command with the git-ignored `.cache` bind mount given
in the `web_mobile` README (`-u pos_hr_mobile`, or both modules, with
`--test-tags mobile_bridge_screens`).
