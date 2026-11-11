# test_web_gantt

Test models and scratch host for the Gantt view.

## Scope

Two test models (`test.web.gantt.pill`, `test.web.gantt.pill2`) for the Gantt view, and
the scratch host that later tasks build on top of them.

## Provenance

Spec package: slice 002a-gantt-display. The provenance record is
`provenance/test_web_gantt.yaml`. See [docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

```
make test MODULES=test_web_gantt
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`.
