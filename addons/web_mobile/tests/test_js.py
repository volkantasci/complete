# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only

import logging
import re

from odoo.addons.web.tests.test_js import HootCommon, unit_test_error_checker
from odoo.tests import no_retry, tagged


@tagged('post_install', '-at_install')
class TestMobileHootSuite(HootCommon):
    """Run the Hoot unit tests of the `web_mobile` module in headless Chrome."""

    @no_retry
    def test_mobile_hoot_suite(self):
        asset_addons = self._get_addons_from_asset_bundle('web.assets_unit_tests')
        self.assertIn("web_mobile", asset_addons, "No web_mobile unit test bundled")
        url = (
            '/web/tests?headless&loglevel=2&preset=desktop&timeout=15000'
            f'&id={self._generate_hash("@web_mobile")}'
        )
        records = []
        handler = logging.Handler(logging.INFO)
        handler.emit = records.append
        browser_logger = self._logger.getChild('browser')
        previous_level = browser_logger.level
        browser_logger.setLevel(logging.INFO)  # whatever the server log level is
        browser_logger.addHandler(handler)
        try:
            self.browser_js(
                url,
                "",
                "",
                login='admin',
                timeout=600,
                success_signal="[HOOT] Test suite succeeded",
                error_checker=unit_test_error_checker,
            )
        finally:
            browser_logger.removeHandler(handler)
            browser_logger.setLevel(previous_level)
        # A filter that matches nothing also "succeeds": require a real run.
        counts = [
            int(match.group(1))
            for record in records
            if (match := re.search(r'Passed (\d+) tests', record.getMessage()))
        ]
        self.assertTrue(counts, "The Hoot run did not report a pass count")
        self.assertGreater(counts[-1], 0, "The @web_mobile Hoot suite ran no test")
