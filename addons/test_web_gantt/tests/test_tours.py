# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the scrolling behaviours of the Gantt view (R10, R11, R39, R40).

The tours read the date from the browser and compare positions with each other; the only thing
they expect from the records is that pills exist near today. The browser inherits the time zone
of the test process, which these tests pin to UTC, and the records are built around the date of
that zone with a zero offset around D0, the instant the browser's clock starts at, so the
browser and the records agree on what today is.
"""
import os
import time
from datetime import datetime

from odoo.tests import HttpCase, tagged

from .timeline_real_pointer import RealPointerMixin

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'
# 002a's D0 is Thursday 12 November 2026 (its captures); 002b adds the hour, 09:00. The browser's
# clock moves to this instant (this process runs in UTC) and runs on from there.
D0 = datetime(2026, 11, 12, 9, 0)


@tagged('post_install', '-at_install')
class TestTimelineTours(RealPointerMixin, HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        previous = os.environ.get('TZ')
        os.environ['TZ'] = 'UTC'
        time.tzset()

        def restore():
            if previous is None:
                os.environ.pop('TZ', None)
            else:
                os.environ['TZ'] = previous
            time.tzset()

        cls.addClassCleanup(restore)
        pill = cls.env['test.web.gantt.pill']
        cls.records = pill._tl_build_host_records(
            today=D0.date(), tz_offset_hours=0)

    def _tour(self, host, name):
        self.start_tour_with_pointer(HOST_ACTION.format(host), name, login='admin', now=D0)

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
