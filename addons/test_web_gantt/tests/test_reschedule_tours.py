# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of slice 002c's rescheduling (A38 to A50, A71, A72, A77, A85, A86).

The prepared records of H46 and H47 (June 2030, in the server's future) are created before each
tour and dropped after it. The server's clock is real. The tours of H46 and H47 run with the
browser's own clock (their action sets the initial date); those of H42 with the D0 clock.
"""
import os
import time
from datetime import datetime, timedelta

from odoo.tests import HttpCase, tagged

from .timeline_real_pointer import RealPointerMixin

HOST_ACTION = '/odoo/action-test_web_gantt.host_action_{}'
PILL = 'test.web.gantt.pill'
DESKTOP = '1600x900'
PHONE = '390x844'
D0 = datetime(2026, 11, 12, 12)


@tagged('post_install', '-at_install')
class TestTimelineRescheduleTours(RealPointerMixin, HttpCase):

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
        self.env.ref('base.user_admin').lang = 'en_US'

    # -- helpers --------------------------------------------------------------------------------

    def _run(self, host, name, size=DESKTOP, now=None, prepared=True, timezone=None):
        """Create the prepared records, run the tour, return them (refreshed); they are dropped
        by the caller's `finally`-less cleanup (a class cleanup per test)."""
        pill = self.env[PILL]
        built = pill._tl_build_reschedule_records() if prepared else {}
        self.addCleanup(self._drop)
        self.browser_size = size
        self.touch_enabled = False
        self.start_tour_with_pointer(HOST_ACTION.format(host), name, login='admin', now=now,
                                     timezone=timezone)
        self.env.invalidate_all()
        return built

    def _drop(self):
        self.env[PILL]._tl_drop_reschedule_records()

    def _at(self, record, start, stop):
        """The record's dates as 'MM-DD HH:MM' texts of June 2030 (or whole days)."""
        record.invalidate_recordset()
        if isinstance(record.date_start, datetime):
            fmt = '%m-%d %H:%M'
            got = (record.date_start.strftime(fmt), record.date_stop.strftime(fmt))
        else:
            got = (record.date_start.strftime('%m-%d'), record.date_stop.strftime('%m-%d'))
        self.assertEqual(got, (start, stop), record.name)

    def _prepared(self, built, *names):
        prepared = {
            'Chain A': ('06-10 06:00', '06-10 14:00'),
            'Chain B': ('06-11 06:00', '06-11 14:00'),
            'Chain C': ('06-12 06:00', '06-13 14:00'),
            'Loop 1': ('06-14 06:00', '06-14 10:00'),
            'Loop 2': ('06-14 11:00', '06-14 14:00'),
            'dated Chain A': ('06-10', '06-10'),
            'dated Chain B': ('06-12', '06-12'),
        }
        for name in names:
            self._at(built[name], *prepared[name])

    # -- the first model, H46 --------------------------------------------------------------------

    def test_a38_tour_manual(self):
        built = self._run('h46', 'timeline_002c_a38_manual')
        self._at(built['Chain A'], '06-11 06:00', '06-11 14:00')
        self._prepared(built, 'Chain B', 'Chain C')

    def test_a39_tour_keep_buffer(self):
        built = self._run('h46', 'timeline_002c_a39_keep_buffer')
        self._at(built['Chain A'], '06-11 06:00', '06-11 14:00')
        self._at(built['Chain B'], '06-12 06:00', '06-12 14:00')
        self._at(built['Chain C'], '06-13 06:00', '06-14 14:00')

    def test_a42_tour_undo(self):
        built = self._run('h46', 'timeline_002c_a42_undo')
        self._prepared(built, 'Chain A', 'Chain B', 'Chain C')

    def test_a41_tour_use_buffer(self):
        built = self._run('h46', 'timeline_002c_a41_use_buffer')
        self._at(built['Chain A'], '06-11 06:00', '06-11 14:00')
        self._at(built['Chain B'], '06-11 14:00', '06-11 22:00')
        self._prepared(built, 'Chain C')

    def test_a43_tour_resize_end(self):
        built = self._run('h46', 'timeline_002c_a43_resize_end')
        self._at(built['Chain C'], '06-12 06:00', '06-14 14:00')
        self._prepared(built, 'Chain A', 'Chain B')

    def test_a44_tour_phone_no_change(self):
        built = self._run('h46', 'timeline_002c_a44_phone_no_change', size=PHONE)
        self._at(built['Chain C'], '06-12 18:00', '06-14 02:00')
        self._prepared(built, 'Chain A', 'Chain B')

    def test_a71_tour_phone(self):
        built = self._run('h46', 'timeline_002c_a71_phone', size=PHONE)
        self._at(built['Chain C'], '06-12 18:00', '06-14 02:00')
        self._prepared(built, 'Chain A', 'Chain B')

    def test_a45_tour_copy(self):
        built = self._run('h46', 'timeline_002c_a45_copy')
        self._prepared(built, 'Chain A', 'Chain B', 'Chain C')
        copies = self.env[PILL].search(
            [('name', 'like', 'Chain A%'), ('id', '!=', built['Chain A'].id)])
        self.assertEqual(len(copies), 1)
        self._at(copies, '06-11 06:00', '06-11 14:00')

    def test_a47_tour_cycle(self):
        built = self._run('h46', 'timeline_002c_a47_cycle')
        self._prepared(built, 'Loop 1', 'Loop 2')

    def test_a72_tour_messages(self):
        built = self._run('h46', 'timeline_002c_a72_messages')
        self._at(built['Chain A'], '06-11 06:00', '06-11 14:00')
        self._prepared(built, 'Loop 1', 'Loop 2')

    def test_a50_tour_waits_for_earlier_writes(self):
        built = self._run('h46', 'timeline_002c_a50_waits_for_earlier_writes')
        self._at(built['Chain A'], '06-11 06:00', '06-11 14:00')
        self._at(built['Chain B'], '06-12 06:00', '06-12 14:00')
        self._prepared(built, 'Loop 1', 'Loop 2')

    # -- the second model, H47 -------------------------------------------------------------------

    def test_a49_tour_date_only(self):
        built = self._run('h47', 'timeline_002c_a49_date_only')
        self._at(built['dated Chain A'], '06-12', '06-12')
        self._at(built['dated Chain B'], '06-14', '06-14')

    def test_a49_tour_date_only_undo(self):
        built = self._run('h47', 'timeline_002c_a49_date_only_undo')
        self._prepared(built, 'dated Chain A', 'dated Chain B')

    def test_a85_tour_date_only_use_buffer(self):
        built = self._run('h47', 'timeline_002c_a85_date_only_use_buffer')
        self._at(built['dated Chain A'], '06-11', '06-11')
        self._at(built['dated Chain B'], '06-12', '06-12')

    def test_a86_tour_date_only_backward(self):
        built = self._run('h47', 'timeline_002c_a86_date_only_backward')
        self._at(built['dated Chain B'], '06-10', '06-10')
        self._at(built['dated Chain A'], '06-08', '06-08')

    # -- H42, on the D0 clock --------------------------------------------------------------------

    def test_a46_tour_past(self):
        design, build = self.records['Design'], self.records['Build']
        start, stop, build_start = design.date_start, design.date_stop, build.date_start
        self.addCleanup(lambda: design.write({'date_start': start, 'date_stop': stop}))
        self._run('h42', 'timeline_002c_a46_past', now=D0, prepared=False)
        design.invalidate_recordset()
        build.invalidate_recordset()
        self.assertEqual(design.date_start, start + timedelta(days=1))
        self.assertEqual(design.date_stop, stop + timedelta(days=1))
        self.assertEqual(build.date_start, build_start)

    def test_a88_tour_week_label_in_another_year(self):
        self._run('h46', 'timeline_002c_a88', prepared=False)

    def test_a88_tour_week_label_in_the_current_year(self):
        self._run('h42', 'timeline_002c_a88_no_year', now=D0, prepared=False)

    def test_a77_tour_undo_after_row_change(self):
        # the package's D0: Thursday 12 November 2026, 09:00 in a zone three hours ahead of UTC,
        # the host records three hours ahead as well (its literal points are valid there)
        pill = self.env[PILL]
        pill._tl_build_host_records(today='2026-11-12', tz_offset_hours=3)
        self.addCleanup(lambda: pill._tl_build_host_records(today='2026-11-12', tz_offset_hours=0))
        test = self.records['Test']
        test.invalidate_recordset()
        self.assertEqual(test.date_start, datetime(2026, 11, 13, 5))
        start, stop, parent = test.date_start, test.date_stop, test.parent_id
        self.addCleanup(lambda: test.write(
            {'date_start': start, 'date_stop': stop, 'parent_id': parent.id}))
        self._run('h42', 'timeline_002c_a77_undo_after_row_change', prepared=False,
                  now=datetime(2026, 11, 12, 6), timezone='Etc/GMT-3')
        test.invalidate_recordset()
        self.assertEqual((test.date_start, test.date_stop, test.parent_id), (start, stop, parent))
