# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of slice 002b2 (drag and resize, and its notes on 002a and 002b).

The browser inherits the time zone of the test process, pinned to UTC here, and the records are
built around the date of that zone with a zero offset, so the browser and the records agree on
what today is. A scenario that changes the database runs inside the test's own savepoint, which
is rolled back after it: every test starts from the records of `setUpClass`.
"""
import os
import time

from odoo import Command, fields
from odoo.tests import HttpCase, tagged

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'
PILL = 'test.web.gantt.pill'
DESKTOP = '1600x900'
RESTRICTED = 'restricted_editor'


@tagged('post_install', '-at_install')
class TestTimelineDragTours(HttpCase):

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
        self.start_tour(path, name, login=login)

    # -- notes on 002a and 002b -----------------------------------------------------------------

    def test_a63_tour_focus_after_range_change(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b2_a63_focus_after_range_change')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a64_tour_scroll_moves_focus(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b2_a64_scroll_moves_focus')
        self.assertEqual(self.env[PILL].search_count([]), count)

    # -- right-to-left badges (R19) -------------------------------------------------------------

    def test_a60_tour_rtl_selection_badges(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b2_a60_rtl_selection_badges', login='rtl')
        self.assertEqual(self.env[PILL].search_count([]), count)

    # -- edge scrolling (R20) -------------------------------------------------------------------

    def test_a65_tour_selection_edge_speed(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b2_a65_selection_edge_speed')
        self.assertEqual(self.env[PILL].search_count([]), count)

    # -- the click lock (R23) -------------------------------------------------------------------

    def test_a68_tour_click_lock(self):
        count = self.env[PILL].search_count([])
        self._tour('h3', 'timeline_002b2_a68_click_lock')
        self.assertEqual(self.env[PILL].search_count([]), count)

    # -- the record dialog (R21, R24) -----------------------------------------------------------

    def test_a66_tour_delete_offline(self):
        self._tour('h1', 'timeline_002b2_a66_delete_offline')
        self.assertTrue(self.records['Build'].exists(), 'Build was deleted')

    def test_a69_tour_read_only_button(self):
        count = self.env[PILL].search_count([])
        self._tour('h28', 'timeline_002b2_a69_read_only_button', login=RESTRICTED)
        self.assertEqual(self.env[PILL].search_count([]), count)
        self.assertEqual(self.records['Build'].name, 'Build')
