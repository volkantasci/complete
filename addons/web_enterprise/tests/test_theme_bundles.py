# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import re

from odoo.tests.common import TransactionCase, tagged

ROLES_LIGHT = 'web_enterprise/static/src/theme/roles_light.scss'
ROLES_DARK = 'web_enterprise/static/src/theme/roles_dark.scss'
FIXTURES = 'web_enterprise/static/tests/theme_fixtures'
PRIMARY_VARIABLES = 'web/static/src/scss/primary_variables.scss'


@tagged('post_install', '-at_install')
class TestThemeBundles(TransactionCase):
    def _css(self, bundle, debug_assets=False):
        """Compiled CSS of a bundle, lower-cased and without any whitespace."""
        asset = self.env['ir.qweb']._get_asset_bundle(bundle, debug_assets=debug_assets)
        css = asset.css().raw.decode()
        return re.sub(r'\s+', '', css).replace(';}', '}').lower()

    def _asset(self, bundle, directive, path, target=False):
        self.env['ir.asset'].create({
            'name': f'test {bundle} {path}',
            'bundle': bundle,
            'directive': directive,
            'path': path,
            'target': target,
        })

    def _probe_css(self, dark):
        """CSS of a small bundle built from the helpers, the role files
        (light only, or dark then light) and the derived probe, with the
        base roles of ``alt_base_roles.scss`` set ahead of both."""
        bundle = 'web_enterprise.cws_derived_probe_%s' % ('dark' if dark else 'light')
        self._asset(bundle, 'include', 'web._assets_helpers')
        self._asset(bundle, 'before', f'{FIXTURES}/alt_base_roles.scss', PRIMARY_VARIABLES)
        if dark:
            self._asset(bundle, 'before', ROLES_DARK, PRIMARY_VARIABLES)
        self._asset(bundle, 'before', ROLES_LIGHT, PRIMARY_VARIABLES)
        self._asset(bundle, 'append', f'{FIXTURES}/derived_probe.scss')
        return self._css(bundle)

    def _assert_in(self, needles, css):
        for needle in needles:
            self.assertIn(needle, css)

    def test_A1_roles_in_both_stylesheets(self):
        light = self._css('web.assets_web')
        self._assert_in([
            '--o-cws-primary:#714b67', '--o-cws-action:#017e84',
            '--o-cws-danger:#ef4444', '--o-cws-page-bg:#f8f9fa',
            '--o-cws-scheme:light',
        ], light)
        self.assertRegex(light, r'--o-cws-view-bg:(#fff|#ffffff|white)[;}]')
        dark = self._css('web.assets_web_dark')
        self._assert_in([
            '--o-cws-primary:#92427d', '--o-cws-action:#1cbcb1',
            '--o-cws-danger:#cb2f2f', '--o-cws-page-bg:#1f1f23',
            '--o-cws-view-bg:#2c2e35', '--o-cws-dark-chrome:#242733',
            '--o-cws-scheme:dark',
        ], dark)

    def test_A116_range_thumb_gloss(self):
        # D9 / R39: the pressed thumb keeps the control gloss over its fill, in both schemes
        for bundle, fill, tone in (
            ('web.assets_web', '#f8fbfb', '255,255,255'),
            ('web.assets_web_dark', '#b2559a', '0,0,0'),
        ):
            css = self._css(bundle)
            self.assertIn(f'--o-cws-range-thumb-active:{fill}', css)
            self.assertRegex(
                css,
                r':active::-webkit-slider-thumb[^{}]*\{'
                r'background-color:var\(--o-cws-range-thumb-active\);'
                r'background-image:linear-gradient\(180deg,rgba\(' + tone
                + r',0?\.15\),transparent\)')

    def test_A5_dark_bundle_takes_third_party_files(self):
        self._asset('web.dark_mode_variables', 'before',
                    f'{FIXTURES}/marker_variables.dark.scss', ROLES_DARK)
        self._asset('web.assets_web_dark', 'append',
                    f'{FIXTURES}/marker_rules.dark.scss')
        self.assertIn('.o_cws_probe_marker{color:#123456}', self._css('web.assets_web_dark'))
        self.assertNotIn('o_cws_probe_marker', self._css('web.assets_web'))
        self.assertIn('--o-cws-scheme:dark', self._css('web.assets_backend_lazy_dark'))
        self.assertIn('--o-cws-scheme:light', self._css('web.assets_backend_lazy'))

    def test_A107_derived_follow_base_roles(self):
        # base roles: primary #336699, action #AA5500; the expected values are
        # the Sass results of the formulas of the role files.
        light = self._probe_css(dark=False)
        self._assert_in([
            '.p-hover{color:#264d73}',                # darken(primary, 10%)
            '.p-pressed{color:#ebf0f5}',              # mix(primary, white, 10%)
            '.p-active{background-color:#f7eee6}',    # mix(action, white, 10%)
            '.p-focus{border-color:#bc956d}',         # mix(action, grey 400, 50%)
            '.p-lightsecondary{color:#e7ebed}',       # grey 200 (R5)
        ], light)
        dark = self._probe_css(dark=True)
        self._assert_in([
            '.p-hover{color:#376ea4}',                # lighten(primary, 3%)
            '.p-lightsecondary{color:#3e3f47}',       # grey 300 (R5)
            '.p-colour3{color:#e1b000}',              # fixed dark base colour
        ], dark)

    def test_frontend_bundle_untouched(self):
        self.assertNotIn('--o-cws-', self._css('web.assets_frontend'))

    def test_print_bundle_light(self):
        self.assertIn('--o-cws-scheme:light', self._css('web.assets_web_print'))
