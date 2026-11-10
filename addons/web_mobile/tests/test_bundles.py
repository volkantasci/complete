# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests.common import TransactionCase, tagged

OWN_FILES = 'web_mobile/static/src/'


@tagged('post_install', '-at_install')
class CwmBundles(TransactionCase):

    def _own_files(self, bundle):
        paths = self.env['ir.asset']._get_asset_paths(bundle, {})
        return [entry[0] for entry in paths if OWN_FILES in entry[0]]

    def test_R1_bridge_only_in_backend(self):
        self.assertTrue(self._own_files('web.assets_backend'))
        self.assertEqual(self._own_files('web.assets_frontend'), [])
        pos = self.env['ir.module.module'].search(
            [('name', '=', 'point_of_sale'), ('state', '=', 'installed')])
        if pos:
            self.assertEqual(self._own_files('point_of_sale._assets_pos'), [])
