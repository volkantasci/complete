# web_gantt

A read-only Gantt (timeline) view for the web client: records are drawn as pills on a time grid.

## Scope

This module adds the view type, the window action view mode, the view validator, the generated
default view and (in later tasks) the browser view and the data call. It adds no model.

## Provenance

Spec package: slice 002a-gantt-display. The provenance record is
`provenance/web_gantt.yaml`. See [docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

```
make test MODULES=web_gantt
```

In a guarded session use the podman command in
[docs/isolation.md](../../docs/isolation.md#containers) instead of `make test`.
