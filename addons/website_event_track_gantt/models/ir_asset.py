# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo import models

_AUTOCOMPLETE_TESTS = 'website_address_autocomplete/static/tests/'


class IrAssetTestsBundle(models.Model):
    _inherit = 'ir.asset'

    def _get_asset_paths(self, bundle, assets_params):
        paths = super()._get_asset_paths(bundle, assets_params)
        # A Community module that Website installs ships a tour that imports the
        # tour helpers of website_sale without depending on it. Without
        # website_sale that import breaks the tests bundle for every tour; this
        # bridge brings Website in, and its own tours need the bundle.
        if bundle != 'web.assets_tests' or 'website_sale' in self._get_installed_addons_list():
            return paths
        # entries are (path, full path, bundle, last modified); paths start with '/'
        return [
            entry for entry in paths
            if _AUTOCOMPLETE_TESTS not in entry[0]
        ]
