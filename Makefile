# Load pinned versions and local credentials, and export them to child processes.
include docker/versions.env
-include docker/.env
export

COMPOSE := podman compose -f docker/compose.yaml
SOURCE_URL := https://nightly.odoo.com/$(ODOO_VERSION)/nightly/src/odoo_$(ODOO_VERSION).$(ODOO_RELEASE).tar.gz
comma := ,
empty :=
space := $(empty) $(empty)
TEST_TAGS = $(subst $(space),$(comma),$(patsubst %,/%,$(subst $(comma),$(space),$(MODULES))))

.PHONY: image up down test

image:
	curl -fsI $(SOURCE_URL) | head -1 | grep -q ' 200'
	podman build --build-arg ODOO_RELEASE=$(ODOO_RELEASE) --build-arg ODOO_SOURCE_SHA256=$(ODOO_SOURCE_SHA256) -t localhost/complete-odoo:$(ODOO_VERSION)-$(ODOO_RELEASE) docker/

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

test:
	@test -n "$(MODULES)" || { echo "usage: make test MODULES=mod_a,mod_b"; exit 2; }
	$(COMPOSE) run --rm odoo odoo -d test_$$(date +%s) -i $(MODULES) --test-tags $(TEST_TAGS) --stop-after-init
