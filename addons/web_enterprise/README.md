# Web Enterprise (`web_enterprise`)

Gives the Community web client a home menu, an adapted top bar, mobile
navigation, an administrator message, a per-user colour scheme preference and
three view behaviours. The module name is the original module name, kept for
database and extension compatibility (see
[docs/module-authoring.md](../../docs/module-authoring.md#naming)).

This is a work in progress for slice 001a-web-shell. Scope, provenance and the
test list are completed with the browser side of the slice.

## Tests

```
make test MODULES=web_enterprise
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`.
