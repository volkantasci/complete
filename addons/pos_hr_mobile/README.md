# pos_hr_mobile

On the point of sale login screen with employee login enabled, the badge scanner button of
the PIN step opens the Community camera barcode scanner. The code it reads is passed to the
point of sale's barcode reader like a code from a hardware scanner, so the Community badge
rules apply. An empty code closes the scanner and shows a warning asking to scan again.

## Scope

Browser part only, inside the point of sale bundle. No bridge code of `web_mobile` is loaded
there. The module also loads the Community barcode scanner styles into the point of sale and
one colour rule for primary buttons inside the mobile barcode container; neither changes the
login screen.

## Provenance

Spec package: slice 001c-mobile-bridge (R20 to R23). See
[docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

```
make test MODULES=pos_hr_mobile
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`.
