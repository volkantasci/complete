# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of slice 002c (dependencies, rescheduling and buffers).

The package's fixed date: the browser's clock is Thursday 12 November 2026 at noon (UTC) and the
records are built around that day with a zero offset. A scenario that changes the database runs
inside the test's own savepoint, which is rolled back after it.

A tour that needs real pointer events asks for them through ``window.__tl_mouse`` (see
``timeline_real_pointer``).
"""
import os
import time
from datetime import datetime

from odoo.tests import HttpCase, tagged

from .timeline_real_pointer import RealPointerMixin

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'
PILL = 'test.web.gantt.pill'
DESKTOP = '1600x900'
D0 = datetime(2026, 11, 12, 12)
LONG_NAME = 'A very long name of a record that cannot fit into the narrow panel of the view'


@tagged('post_install', '-at_install')
class TestTimelineDependencyTours(RealPointerMixin, HttpCase):

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
        cls.records = pill._tl_build_host_records(today='2026-11-12', tz_offset_hours=0)

    def setUp(self):
        super().setUp()
        self.browser_size = DESKTOP
        self.touch_enabled = False
        self.env.ref('base.user_admin').lang = 'en_US'

    # -- helpers --------------------------------------------------------------------------------

    def _tour(self, host, name, login='admin', size=DESKTOP, touch=False, now=D0):
        self.browser_size = size
        self.touch_enabled = touch
        path = host if host.startswith('/') else HOST_ACTION.format(host)
        self.start_tour_with_pointer(path, name, login=login, now=now)

    # -- the name in a line of the side panel (R1) -----------------------------------------------

    def test_a2_tour_line_drag_and_open(self):
        record = self.env[PILL].search([('name', '=', 'Unscheduled')], limit=1)
        beta = self.env[PILL].search([('name', '=', 'Beta')], limit=1)
        long = self.env[PILL].create({'name': LONG_NAME})
        self.assertFalse(record.date_start)
        self._tour('h37', 'timeline_002c_a2_line_drag_and_open')
        # the press on the empty part scheduled the record as a press on its name does
        self.assertEqual(record.date_start, datetime(2026, 11, 12, 12))
        self.assertEqual(record.date_stop, datetime(2026, 11, 13, 12))
        self.assertEqual(record.parent_id, beta)
        # restore the record and delete the long-named one
        record.write({'date_start': False, 'date_stop': False})
        long.unlink()
        self.assertFalse(record.date_start)
        self.assertFalse(long.exists())

    # -- the action's own filter in the side panel's list (R2) -----------------------------------

    def test_a4_tour_and_date_filter(self):
        self._tour('h51', 'timeline_002c_a4_and_date_filter')

    def test_a5_tour_or_date_filter(self):
        self._tour('h52', 'timeline_002c_a5_or_date_filter')

    def test_a6_tour_negated_date_filter(self):
        self._tour('h53', 'timeline_002c_a6_negated_date_filter')
