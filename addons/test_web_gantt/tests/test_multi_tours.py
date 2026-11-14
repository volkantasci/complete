# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of slice 002b3 (multi-selection, multi-creation and the side panel).

The browser inherits the time zone of the test process, pinned to UTC here, and the records are
built around the date of that zone with a zero offset, so the browser and the records agree on
what today is. A scenario that changes the database runs inside the test's own savepoint, which
is rolled back after it: every test starts from the records of `setUpClass`.

A tour that needs real pointer events asks for them through ``window.__tl_mouse`` (see
``timeline_real_pointer``).
"""
import os
import time

from odoo import Command, fields
from odoo.tests import HttpCase, tagged

from .timeline_real_pointer import RealPointerMixin

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'
PILL = 'test.web.gantt.pill'
DESKTOP = '1600x900'
PHONE = '390x844'
RESTRICTED = 'restricted_editor'


@tagged('post_install', '-at_install')
class TestTimelineMultiTours(RealPointerMixin, HttpCase):

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
        pill = cls.env[PILL]
        # the demo data (when loaded) holds the same records: start from a clean host
        pill.with_context(active_test=False).search([]).unlink()
        cls.env['test.web.gantt.pill2'].with_context(active_test=False).search([]).unlink()
        cls.today = fields.Date.today()
        cls.records = pill._tl_build_host_records(today=cls.today, tz_offset_hours=0)
        cls.rtl_user = pill._tl_rtl_user()
        cls.restricted = cls.env['res.users'].create({
            'name': 'Restricted editor',
            'login': RESTRICTED,
            'password': RESTRICTED,
            'group_ids': [Command.set([cls.env.ref('base.group_user').id])],
        })

    def setUp(self):
        super().setUp()
        self.browser_size = DESKTOP
        self.touch_enabled = False
        self.env.ref('base.user_admin').lang = 'en_US'

    # -- helpers --------------------------------------------------------------------------------

    def _tour(self, host, name, login='admin', size=DESKTOP, touch=False):
        self.browser_size = size
        self.touch_enabled = touch
        path = host if host.startswith('/') else HOST_ACTION.format(host)
        self.start_tour_with_pointer(path, name, login=login)

    # -- notes on the earlier parts (R1) ---------------------------------------------------------

    def test_a1_tour_group_header_gesture(self):
        count = self.env[PILL].search_count([])
        self._tour('h3', 'timeline_002b3_a1_group_header_gesture')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a2_tour_record_header(self):
        self._tour('h3', 'timeline_002b3_a2_record_header')

    def test_a2_tour_group_header_gesture_phone(self):
        self._tour('h3', 'timeline_002b3_a2_group_header_gesture_phone', size=PHONE)

    # -- selecting cells (R2 to R9, R15) ---------------------------------------------------------

    def test_a9_tour_draw_over_rows(self):
        self._tour('h34', 'timeline_002b3_a9_draw_over_rows')

    def test_a12_tour_escape_cancels(self):
        self._tour('h34', 'timeline_002b3_a12_escape_cancels')

    def test_a16_tour_edge_scroll_both_axes(self):
        self._tour('h34', 'timeline_002b3_a16_edge_scroll_both_axes', size='1600x420')

    def test_a17_tour_column_headers(self):
        self._tour('h34', 'timeline_002b3_a17_column_headers')

    def test_a18_tour_row_headers(self):
        self._tour('h34', 'timeline_002b3_a18_row_headers')

    def test_a5_tour_phone(self):
        self._tour('h34', 'timeline_002b3_a5_phone', size=PHONE)
