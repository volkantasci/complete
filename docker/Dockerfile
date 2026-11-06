FROM ubuntu:noble
LABEL maintainer="Odoo S.A. <info@odoo.com>"

SHELL ["/bin/bash", "-xo", "pipefail", "-c"]

# Generate locale C.UTF-8 for postgres and general locale data
ENV LANG=en_US.UTF-8

# Retrieve the target architecture to install the correct wkhtmltopdf package
ARG TARGETARCH

# Install some deps, lessc and less-plugin-clean-css, and wkhtmltopdf

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        dirmngr \
        fonts-noto-cjk \
        gnupg \
        libssl-dev \
        node-less \
        python3-magic \
        python3-num2words \
        python3-odf \
        python3-pdfminer \
        python3-pip \
        python3-phonenumbers \
        python3-pyldap \
        python3-qrcode \
        python3-renderpm \
        python3-setuptools \
        python3-slugify \
        python3-vobject \
        python3-watchdog \
        python3-xlrd \
        python3-xlwt \
        xz-utils && \
    if [ -z "${TARGETARCH}" ]; then \
        TARGETARCH="$(dpkg --print-architecture)"; \
    fi; \
    WKHTMLTOPDF_ARCH=${TARGETARCH} && \
    case ${TARGETARCH} in \
    "amd64") WKHTMLTOPDF_ARCH=amd64 && WKHTMLTOPDF_SHA=967390a759707337b46d1c02452e2bb6b2dc6d59  ;; \
    "arm64")  WKHTMLTOPDF_SHA=90f6e69896d51ef77339d3f3a20f8582bdf496cc  ;; \
    "ppc64le" | "ppc64el") WKHTMLTOPDF_ARCH=ppc64el && WKHTMLTOPDF_SHA=5312d7d34a25b321282929df82e3574319aed25c  ;; \
    esac \
    && curl -o wkhtmltox.deb -sSL https://github.com/wkhtmltopdf/packaging/releases/download/0.12.6.1-3/wkhtmltox_0.12.6.1-3.jammy_${WKHTMLTOPDF_ARCH}.deb \
    && echo ${WKHTMLTOPDF_SHA} wkhtmltox.deb | sha1sum -c - \
    && apt-get install -y --no-install-recommends ./wkhtmltox.deb \
    && rm -rf /var/lib/apt/lists/* wkhtmltox.deb

# install latest postgresql-client
RUN echo 'deb http://apt.postgresql.org/pub/repos/apt/ noble-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
    && GNUPGHOME="$(mktemp -d)" \
    && export GNUPGHOME \
    && repokey='B97B0AFCAA1A47F044F244A07FCC7D46ACCC4CF8' \
    && gpg --batch --keyserver keyserver.ubuntu.com --recv-keys "${repokey}" \
    && gpg --batch --armor --export "${repokey}" > /etc/apt/trusted.gpg.d/pgdg.gpg.asc \
    && gpgconf --kill all \
    && rm -rf "$GNUPGHOME" \
    && apt-get update  \
    && apt-get install --no-install-recommends -y postgresql-client \
    && rm -f /etc/apt/sources.list.d/pgdg.list \
    && rm -rf /var/lib/apt/lists/*

# Install rtlcss (on Debian buster)
RUN apt-get update && \
    apt-get install -y --no-install-recommends nodejs npm \
    && npm install -g rtlcss \
    && apt-get purge --autoremove -y npm \
    && rm -rf /var/lib/apt/lists/*

# Install Odoo from the CE nightly source tarball (replaces the .deb install)
ENV ODOO_VERSION=20.0
ARG ODOO_RELEASE=20261106
ARG ODOO_SOURCE_SHA256=0e050d1514b26ac28428f3abd48a62b35ee173370d4e6aa5881aafe6c711a9bd
LABEL org.opencontainers.image.version="20.0+${ODOO_RELEASE}" \
      com.complete.odoo.source-sha256="${ODOO_SOURCE_SHA256}"
# libpq-dev must come from the same pgdg repo as the installed libpq5 (noble's libpq-dev needs the older libpq5)
RUN echo 'deb http://apt.postgresql.org/pub/repos/apt/ noble-pgdg main' > /etc/apt/sources.list.d/pgdg.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        libffi-dev \
        libjpeg-dev \
        libldap2-dev \
        libpq-dev \
        libsasl2-dev \
        libxml2-dev \
        libxslt1-dev \
        python3-dev \
        python3-venv \
        zlib1g-dev \
    && rm -f /etc/apt/sources.list.d/pgdg.list \
    && rm -rf /var/lib/apt/lists/* \
    && curl -o odoo.tar.gz -sSL https://nightly.odoo.com/${ODOO_VERSION}/nightly/src/odoo_${ODOO_VERSION}.${ODOO_RELEASE}.tar.gz \
    && echo "${ODOO_SOURCE_SHA256}  odoo.tar.gz" | sha256sum -c - \
    && mkdir -p /opt/odoo/src \
    && tar -xzf odoo.tar.gz -C /opt/odoo/src --strip-components=1 \
    && rm odoo.tar.gz \
    && python3 -m venv /opt/odoo/venv \
    && /opt/odoo/venv/bin/pip install --no-cache-dir -r /opt/odoo/src/requirements.txt \
    && /opt/odoo/venv/bin/pip install --no-cache-dir /opt/odoo/src \
    && ln -s /opt/odoo/venv/bin/odoo /usr/bin/odoo \
    && useradd --system --create-home --home-dir /var/lib/odoo --shell /usr/sbin/nologin odoo \
    && mkdir -p /etc/odoo /var/lib/odoo /mnt/extra-addons \
    && chown -R odoo:odoo /etc/odoo /var/lib/odoo /mnt/extra-addons
# Let `entrypoint: []` + `python3 -m odoo` use the venv holding Odoo's requirements
ENV PATH=/opt/odoo/venv/bin:$PATH

# Copy entrypoint script and Odoo configuration file
COPY ./entrypoint.sh /
COPY ./odoo.conf /etc/odoo/

# Set permissions and Mount /var/lib/odoo to allow restoring filestore and /mnt/extra-addons for users addons
RUN chown odoo /etc/odoo/odoo.conf \
    && mkdir -p /mnt/extra-addons \
    && chown -R odoo /mnt/extra-addons
VOLUME ["/var/lib/odoo", "/mnt/extra-addons"]

# Expose Odoo services
EXPOSE 8069 8071 8072

# Set the default config file
ENV ODOO_RC=/etc/odoo/odoo.conf

COPY wait-for-psql.py /usr/local/bin/wait-for-psql.py

# Set default user when running the container
USER odoo

ENTRYPOINT ["/entrypoint.sh"]
CMD ["odoo"]
