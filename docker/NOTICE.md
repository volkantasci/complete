# Vendored Odoo image recipe

`Dockerfile`, `entrypoint.sh`, `odoo.conf` and `wait-for-psql.py` are taken from
the official Odoo Docker recipe and are licensed under LGPL-3.0.
Upstream notices are kept in the files.

- Source: https://github.com/odoo/docker/tree/f900094eb7492968332868d686caf22b966592ca/20.0/
- Commit: `f900094eb7492968332868d686caf22b966592ca`
- License: LGPL-3.0

## Changes

Only the `Dockerfile` differs from upstream.

1. The `.deb` download and install step is replaced by an install from the
   Community nightly source tarball
   `https://nightly.odoo.com/20.0/nightly/src/odoo_20.0.${ODOO_RELEASE}.tar.gz`.
   The build args are `ODOO_RELEASE` (default `20261106`) and
   `ODOO_SOURCE_SHA256` (replacing `ODOO_SHA`). The tarball is verified with
   `sha256sum -c`, extracted to `/opt/odoo/src`, and installed with pip into the
   virtualenv `/opt/odoo/venv`. `/usr/bin/odoo` links to the venv's `odoo`.
2. The step also creates what the package used to create: the `odoo` system
   user and the `/etc/odoo`, `/var/lib/odoo` and `/mnt/extra-addons`
   directories, owned by `odoo`.
3. Extra apt packages, needed to build the pip wheels (`libpq-dev` is installed from the pgdg repository, temporarily re-enabled, to match the installed `libpq5`): `build-essential`,
   `libffi-dev`, `libjpeg-dev`, `libldap2-dev`, `libpq-dev`, `libsasl2-dev`,
   `libxml2-dev`, `libxslt1-dev`, `python3-dev`, `python3-venv`, `zlib1g-dev`.
4. Labels `org.opencontainers.image.version=20.0+${ODOO_RELEASE}` and
   `com.complete.odoo.source-sha256=${ODOO_SOURCE_SHA256}`.
5. `ENV PATH=/opt/odoo/venv/bin:$PATH`, so a container started with
   `entrypoint: []` that runs `python3 -m odoo` uses the venv interpreter that
   holds Odoo's requirements.
6. `entrypoint.sh` and `wait-for-psql.py` are committed with the executable bit (upstream tracks it; a plain download does not).
7. `pyproject.toml` excludes `docker/` from ruff, so the vendored `wait-for-psql.py` stays byte-identical to upstream.
