# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the scrolling behaviours of the Gantt view (R10, R11, R39, R40).

The tours read the date from the browser and compare positions with each other, so they hold
on any day and in any time zone; the records are built around today in the zone of the browser
(the zone of the test process), whose offset to UTC is left out.
"""
from odoo import fields
from odoo.tests import HttpCase, tagged

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'


@tagged('post_install', '-at_install')
class TestTimelineTours(HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        pill = cls.env['test.web.gantt.pill']
        cls.records = pill._tl_build_host_records(
            today=fields.Date.context_today(pill), tz_offset_hours=0)

    def _tour(self, host, name):
        self.start_tour(HOST_ACTION.format(host), name, login='admin')

    def test_a20_tour_week_scroll_centres_today(self):
        self._tour('h1', 'timeline_week_scroll_centres_today')

    def test_a29_tour_today_scrolls(self):
        self._tour('h1', 'timeline_today_scrolls')

    def test_a35_tour_remembered_range(self):
        self._tour('h1', 'timeline_remembered_range')

    def test_a88_tour_restore_after_list(self):
        self._tour('h2', 'timeline_restore_after_list')

    def test_a89_tour_row_header_scroll(self):
        self._tour('h3', 'timeline_row_header_scroll')

    def test_a90_tour_group_row_hover(self):
        self._tour('h3', 'timeline_group_row_hover')
