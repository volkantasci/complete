# web_mobile

Connects the web client to the native mobile apps. This part holds the
server side: a read-only medium-sized picture on contacts (and so on users),
and the preferences form variant that reports account details to the app.

## Provenance

Spec package: slice 001c-mobile-bridge. See
[docs/module-authoring.md](../../docs/module-authoring.md).

## Tests

```
podman compose --env-file docker/versions.env --env-file docker/.env -f docker/compose.yaml run --rm odoo odoo -d <db> -i web_mobile --with-demo --test-tags /web_mobile --stop-after-init
```
