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
from datetime import datetime, timedelta
from datetime import time as clock

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

    # -- the chain of empty-value rows (R26) ------------------------------------------------------

    def test_a76_tour_chain_of_empty_rows_h30(self):
        self._tour('h30', 'timeline_002b2_a76_chain_of_empty_rows_h30')

    def test_a76_tour_chain_of_empty_rows_h32(self):
        self._tour('h32', 'timeline_002b2_a76_chain_of_empty_rows_h32')

    # -- right-to-left badges (R19) -------------------------------------------------------------

    def test_a60_tour_rtl_selection_badges(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b2_a60_rtl_selection_badges', login='rtl')
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a61_tour_rtl_selection_badges_phone(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b2_a61_rtl_selection_badges_phone', login='rtl',
                   size='390x844', touch=True)
        self.assertEqual(self.env[PILL].search_count([]), count)

    def test_a75_tour_rtl_headers(self):
        self._tour('h1', 'timeline_002b2_a75_rtl_headers', login='rtl')

    # -- edge scrolling (R20) -------------------------------------------------------------------

    def test_a65_tour_selection_edge_speed(self):
        count = self.env[PILL].search_count([])
        self._tour('h1', 'timeline_002b2_a65_selection_edge_speed')
        self.assertEqual(self.env[PILL].search_count([]), count)

    # -- edge scrolling while a pill is held (R14) ------------------------------------------------

    def test_a53_tour_move_edge_scroll(self):
        self._tour('h1', 'timeline_002b2_a53_move_edge_scroll')

    def test_a53_tour_move_edge_scroll_stops_at_end(self):
        self._tour('h1', 'timeline_002b2_a53_move_edge_scroll_stops_at_end')

    def test_a53_tour_phone_vertical_edge_scroll(self):
        self._tour('h3', 'timeline_002b2_a53_phone_vertical_edge_scroll', size='390x420')

    def test_a54_tour_resize_edge_scroll(self):
        self._tour('h1', 'timeline_002b2_a54_resize_edge_scroll')

    def test_a54_tour_phone_resize_zone(self):
        self._tour('h1', 'timeline_002b2_a54_phone_resize_zone', size='390x844')

    def test_a55_tour_row_header_edge(self):
        self._tour('h2', 'timeline_002b2_a55_row_header_edge')

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

    # -- moving and copying a pill (R2 to R7, R9, R10, R15, R16) --------------------------------

    def _restored(self):
        review = self.records['Review']
        review.invalidate_recordset()
        self.assertEqual((review.date_start.hour, review.date_start.minute), (13, 0))
        self.assertEqual(review.date_start.date(), self.today)
        self.assertFalse(self.env[PILL].search([('name', 'like', '(copy)')]))

    def test_a1_tour_move_one_day(self):
        self._tour('h1', 'timeline_002b2_a1_move_one_day')
        self._restored()

    def test_a3_tour_pointer_and_popover(self):
        self._tour('h1', 'timeline_002b2_a3_pointer_and_popover')
        self._restored()

    def test_a4_tour_cancel_keys(self):
        self._tour('h1', 'timeline_002b2_a4_cancel_keys')
        self._restored()

    def test_a17_tour_phone_move_touch(self):
        self._tour('h1', 'timeline_002b2_a17_phone_move_touch', size='390x844', touch=True)
        self._restored()

    def test_a21_tour_copy_into_gamma(self):
        self._tour('h2', 'timeline_002b2_a21_copy_into_gamma')
        self._restored()

    def test_a22_tour_ctrl_during_move(self):
        self._tour('h2', 'timeline_002b2_a22_ctrl_during_move')
        self._restored()

    def test_a24_tour_phone_size_copy(self):
        self._tour('h2', 'timeline_002b2_a24_phone_size_copy', size='390x844')
        self._restored()

    def test_a38_tour_undo_move(self):
        self._tour('h1', 'timeline_002b2_a38_undo_move')
        self._restored()

    def test_a41_tour_undo_copy(self):
        self._tour('h2', 'timeline_002b2_a41_undo_copy')
        self._restored()

    def test_a43_tour_undo_record_gone(self):
        self._tour('h2', 'timeline_002b2_a43_undo_record_gone')
        self.assertFalse(self.env[PILL].search([('name', 'like', '(copy)')]))

    def test_a44_tour_one_notification(self):
        self._tour('h1', 'timeline_002b2_a44_one_notification')
        self._restored()

    def test_a44_tour_undo_pending(self):
        self._tour('h1', 'timeline_002b2_a44_undo_pending')
        self._restored()

    def test_a45_tour_phone_undo(self):
        self._tour('h1', 'timeline_002b2_a45_phone_undo', size='390x844', touch=True)
        self._restored()

    def test_a57_tour_refused_move_and_copy(self):
        self._tour('h28', 'timeline_002b2_a57_refused_move_and_copy', login=RESTRICTED)
        self.assertFalse(self.env[PILL].search([('name', 'like', '(copy)')]))

    def test_a9_tour_move_to_beta(self):
        self._tour('h2', 'timeline_002b2_a9_move_to_beta')
        self._restored()

    def test_a11_tour_closed_group_row_move(self):
        self._tour('h3', 'timeline_002b2_a11_closed_group_row_move')
        self._restored()

    def test_a11_tour_closed_group_row_copy(self):
        self._tour('h3', 'timeline_002b2_a11_closed_group_row_copy')
        self.assertFalse(self.env[PILL].search([('name', 'like', '(copy)')]))

    def test_a50_tour_readonly_creator_rows(self):
        self._tour('h30', 'timeline_002b2_a50_readonly_creator_rows')
        self._restored()

    def test_a51_tour_readonly_siblings(self):
        self._tour('h32', 'timeline_002b2_a51_readonly_siblings')
        self._restored()

    def test_a52_tour_phone_readonly_rows(self):
        self._tour('h30', 'timeline_002b2_a52_phone_readonly_rows', size='390x844')

    def test_a72_tour_release_on_own_group_row(self):
        self._tour('h3', 'timeline_002b2_a72_release_on_own_group_row')
        self._restored()

    # -- resizing with the handles (R8, R12, R15, R16) ------------------------------------------

    def _prepare_review(self, start_days, start_clock, stop_days, stop_clock):
        """'Review' over two sub-columns (the prepared states of the acceptance setup)."""
        day = datetime.combine(self.today, clock())
        self.records['Review'].write({
            'date_start': day + timedelta(days=start_days, hours=start_clock),
            'date_stop': day + timedelta(days=stop_days, hours=stop_clock),
        })

    def _build_unchanged(self):
        build = self.records['Build']
        build.invalidate_recordset()
        self.assertEqual((build.date_start.hour, build.date_stop.hour), (9, 18))
        self.assertEqual((build.date_stop.date() - self.today).days, 2)

    def test_a25_tour_handles_on_hover(self):
        self._tour('h1', 'timeline_002b2_a25_handles_on_hover')

    def test_a27_tour_shorten_at_end(self):
        self._tour('h1', 'timeline_002b2_a27_shorten_at_end')
        self._build_unchanged()

    def test_a28_tour_lengthen_at_start(self):
        self._tour('h1', 'timeline_002b2_a28_lengthen_at_start')
        self._build_unchanged()

    def test_a31_tour_invalid_warning(self):
        self._prepare_review(0, 10, 0, 14)
        self._tour('h1', 'timeline_002b2_a31_invalid_warning')
        review = self.records['Review']
        review.invalidate_recordset()
        self.assertEqual((review.date_start.hour, review.date_stop.hour), (10, 14))

    def test_a33_tour_phone_mouse_invalid(self):
        self._prepare_review(-1, 22, 0, 2)
        self._tour('h1', 'timeline_002b2_a33_phone_mouse_invalid', size='390x844')

    def test_a34_tour_phone_mouse_resize(self):
        self._tour('h1', 'timeline_002b2_a34_phone_mouse_resize', size='390x844')
        self._restored()

    def test_a35_tour_touch_moves_not_resizes(self):
        self._tour('h1', 'timeline_002b2_a35_touch_moves_not_resizes', size='390x844', touch=True)
        self._restored()

    def test_a37_tour_resize_without_drag_and_drop(self):
        self._tour('h31', 'timeline_002b2_a37_resize_without_drag_and_drop')
        self._build_unchanged()

    def test_a56_tour_writes_wait_for_each_other(self):
        self._tour('h1', 'timeline_002b2_a56_writes_wait_for_each_other')

    def test_a57_tour_refused_resize(self):
        self._tour('h28', 'timeline_002b2_a57_refused_resize', login=RESTRICTED)
        self._build_unchanged()

    def test_a74_tour_notification_after_the_answer(self):
        self._tour('h1', 'timeline_002b2_a74_notification_after_the_answer')
        self._build_unchanged()

    # -- locked pills (R11) ---------------------------------------------------------------------

    def test_a47_tour_lock_on_cut_pill(self):
        self._tour('h1', 'timeline_002b2_a47_lock_on_cut_pill')

    def test_a48_tour_lock_drag_and_drop_off(self):
        self._tour('h31', 'timeline_002b2_a48_lock_drag_and_drop_off', size='390x844')

    def test_a48_tour_lock_read_only(self):
        self._tour('h19', 'timeline_002b2_a48_lock_read_only')

    def test_a49_tour_lock_on_long_pill(self):
        self._tour('h1', 'timeline_002b2_a49_lock_on_long_pill')

    # -- date-only fields (R17) -----------------------------------------------------------------

    def _three_days_unchanged(self):
        three = self.records['Three days']
        three.invalidate_recordset()
        self.assertEqual((three.date_start - self.today).days, -1)
        self.assertEqual((three.date_stop - self.today).days, 1)
        self.assertFalse(self.env['test.web.gantt.pill2'].search([('name', 'like', '(copy)')]))

    def test_a58_tour_date_only_full_precision(self):
        self._tour('h10', 'timeline_002b2_a58_date_only_full_precision')
        self._three_days_unchanged()

    def test_a59_tour_half_day_precision(self):
        self._tour('h25', 'timeline_002b2_a59_half_day_precision')
        self._three_days_unchanged()

    def test_a59_tour_year_scale(self):
        # a copy of H25 that offers Year: the arch is changed here, not in the host data
        view = self.env.ref('test_web_gantt.host_view_h25')
        view.arch = view.arch.replace(
            'default_range="month" scales="day,week,month"',
            'default_range="year" scales="day,week,month,year"')
        self.assertIn('scales="day,week,month,year"', view.arch)
        # "Next month" on fixed days of next month (the 7th to the 22nd), whatever today is
        first = (self.today.replace(day=1) + timedelta(days=32)).replace(day=1)
        next_month = self.records['Next month']
        original = (next_month.date_start, next_month.date_stop)
        next_month.write({'date_start': first.replace(day=7), 'date_stop': first.replace(day=22)})
        self._tour('h25', 'timeline_002b2_a59_year_scale')
        next_month.invalidate_recordset()
        self.assertEqual(next_month.date_start, first.replace(day=7))
        self.assertEqual(next_month.date_stop, first.replace(day=22))
        next_month.write({'date_start': original[0], 'date_stop': original[1]})

    def test_a71_tour_date_only_copy(self):
        self._tour('h25', 'timeline_002b2_a71_date_only_copy')
        self._three_days_unchanged()

    # -- right-to-left moves and resizes (R6, R8, R19) --------------------------------------------

    def test_a62_tour_rtl_move_and_resize(self):
        self._tour('h1', 'timeline_002b2_a62_rtl_move_and_resize', login='rtl')
        self._restored()
        self._build_unchanged()

    def test_a71_tour_rtl_date_only_move(self):
        self._tour('h25', 'timeline_002b2_a71_rtl_date_only_move', login='rtl')
        self._three_days_unchanged()
