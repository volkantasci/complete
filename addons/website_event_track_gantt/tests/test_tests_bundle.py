# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from unittest.mock import patch

from odoo.addons.base.models.ir_asset import IrAsset
from odoo.tests.common import TransactionCase

_TOUR = '/website_address_autocomplete/static/tests/autocomplete_tour.js'
_OTHER = '/web/static/tests/other.js'


class TestTestsBundle(TransactionCase):
    def _stand_in(self):
        return [(_TOUR, 'x', 'b', 1), (_OTHER, 'x', 'b', 1)]

    def test_tests_bundle_without_website_sale(self):
        asset = self.env['ir.asset']
        installed = set(asset._get_installed_addons_list())
        self.assertNotIn('website_sale', installed)
        with patch.object(IrAsset, '_get_asset_paths', return_value=self._stand_in()):
            tests = asset._get_asset_paths('web.assets_tests', {})
            self.assertEqual([entry[0] for entry in tests], [_OTHER])
            backend = asset._get_asset_paths('web.assets_backend', {})
            self.assertEqual(backend, self._stand_in())
            with patch.object(type(asset), '_get_installed_addons_list',
                              return_value=installed | {'website_sale'}):
                self.assertEqual(asset._get_asset_paths('web.assets_tests', {}), self._stand_in())

    def test_real_tests_bundle_has_no_autocomplete_test(self):
        asset = self.env['ir.asset']
        paths = asset._get_asset_paths('web.assets_tests', {})
        marker = 'website_address_autocomplete/static/tests/'
        left = [entry[0] for entry in paths if marker in entry[0]]
        self.assertFalse(left)
