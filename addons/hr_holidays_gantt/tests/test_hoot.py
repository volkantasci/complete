# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
import logging
import os
import re
from urllib.parse import quote

from odoo.addons.web.tests.test_js import HootCommon, unit_test_error_checker
from odoo.tests import no_retry, tagged


@tagged('post_install', '-at_install')
class TestHrHolidaysGanttHootSuite(HootCommon):
    """Run the Hoot unit tests of the `hr_holidays_gantt` module in headless Chrome."""

    @no_retry
    def test_hr_holidays_gantt_hoot_suite(self):
        asset_addons = self._get_addons_from_asset_bundle('web.assets_unit_tests')
        self.assertIn(
            "hr_holidays_gantt", asset_addons, "No hr_holidays_gantt unit test bundled")
        # filter the Hoot run to the suite of the `hr_holidays_gantt` module only;
        # HR_HOLIDAYS_GANTT_HOOT_FILTER narrows it to the tests whose name contains that text
        # (Hoot adds a text filter to the ids instead of intersecting them, so the ids are left
        # out then)
        url = '/web/tests?headless&loglevel=2&preset=desktop&timeout=15000'
        if text_filter := os.environ.get('HR_HOLIDAYS_GANTT_HOOT_FILTER'):
            url += f'&filter={quote(text_filter)}'
        else:
            url += f'&id={self._generate_hash("@hr_holidays_gantt")}'
        # Record the browser console without stealing it from the test log.
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
        self.assertGreater(counts[-1], 0, "The @hr_holidays_gantt Hoot suite ran no test")
