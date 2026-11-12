# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import re

from odoo.tests.common import TransactionCase, tagged


@tagged('post_install', '-at_install')
class TestWebGanttAssets(TransactionCase):
    """The stylesheets of the timeline view compile in both colour schemes."""

    def _css(self, bundle):
        """Compiled CSS of a bundle, lower-cased and without any whitespace."""
        asset = self.env['ir.qweb']._get_asset_bundle(bundle)
        css = asset.css().raw.decode()
        return re.sub(r'\s+', '', css).replace(';}', '}').lower()

    def _has_theme(self):
        theme = self.env['ir.module.module'].search([('name', '=', 'web_enterprise')])
        return theme.state == 'installed'

    def test_light_bundle(self):
        css = self._css('web.assets_web')
        self.assertIn('.o_tl_pill{', css)
        self.assertIn('.o_tl_col.o_tl_is_today', css)
        # index 0 is the first palette colour at 60 % over white
        self.assertRegex(css, r'\.o_tl_color_0\{background-color:#c7c7c7')
        # the dark-only rules stay out of the light stylesheet
        self.assertNotIn('.o_tl_renderer.o_tl_color_0{', css)
        self.assertRegex(css, r'\.o_tl_cell\.o_tl_is_today\{background-color:#fffaeb')

    def test_dark_bundle(self):
        css = self._css('web.assets_web_dark')
        self.assertIn('.o_tl_pill{', css)
        # index 0 is the grey 700 role in the dark scheme
        grey = '#b3b4b8' if self._has_theme() else '#495057'
        self.assertRegex(
            css, rf'\.o_tl_renderer\.o_tl_color_0\{{background-color:{grey}')
        # the dark variables win over the light defaults: no warm opaque fill
        self.assertNotIn('.o_tl_cell.o_tl_is_today{background-color:#fffaeb', css)
        self.assertRegex(
            css, r'\.o_tl_cell\.o_tl_is_today\{background-color:rgba\(')
