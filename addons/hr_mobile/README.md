# hr_mobile

With the Employees application installed, the My Preferences form uses its own form type.
This module makes that form send the saved account details (name, login, picture) to the
native app first, and only then run the Community follow-up (the page reload after a
language change). A failed or missing answer from the app never stops the follow-up.

## Scope

Patches the controller of the Employees preferences form type. Everything else (the
account request itself, waiting for the app except in the iOS app) lives in `web_mobile`.

## Provenance

Spec package: slice 001c-mobile-bridge. The provenance record is
`provenance/hr_mobile.yaml`. See [docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

```
make test MODULES=hr_mobile
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`.
