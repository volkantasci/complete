# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.addons.web.tests.test_js import HootCommon, unit_test_error_checker
from odoo.tests import no_retry, tagged


@tagged('post_install', '-at_install')
class TestTimerHootSuite(HootCommon):
    """Run the Hoot unit tests of the `timer` module in headless Chrome."""

    @no_retry
    def test_timer_hoot_suite(self):
        asset_addons = self._get_addons_from_asset_bundle('web.assets_unit_tests')
        self.assertIn('timer', asset_addons, "The timer tests are not in the unit test bundle")
        # filter the Hoot run to the suite of the `timer` module only
        url = (
            '/web/tests?headless&loglevel=2&preset=desktop&timeout=15000'
            f'&id={self._generate_hash("@timer")}'
        )
        self.browser_js(
            url,
            "",
            "",
            login='admin',
            timeout=600,
            success_signal="[HOOT] Test suite succeeded",
            error_checker=unit_test_error_checker,
        )
