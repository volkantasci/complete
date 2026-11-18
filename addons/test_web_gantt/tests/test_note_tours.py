# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of slice 002d's notes on the earlier parts (R1 to R4), on 002c's host H42.

The package's setup: the browser at 1600 x 900, its clock at Thursday 12 November 2026, 09:00 in a
time zone three hours ahead of UTC (``Etc/GMT-3``); the records of 002a's host table are put back
by name before every scenario (``_reset_h42``). The gestures are played with real pointer events
(``RealPointerMixin``); the tours are in ``timeline_note_tours.js``.
"""
from datetime import datetime
from functools import wraps
from unittest.mock import patch

from odoo.tests import HttpCase, tagged

from .timeline_real_pointer import RealPointerMixin

PILL = 'test.web.gantt.pill'
DESKTOP = '1600x900'
# 09:00 at UTC+3 on D0 = 06:00 UTC
NOW = datetime(2026, 11, 12, 6)
ZONE = 'Etc/GMT-3'
H42_MENU = 'H42 Dependencies by parent'
LINKS = {'Build': ['Design'], 'Test': ['Build'], 'Overlap A': ['Review']}


@tagged('post_install', '-at_install')
class TestNoteTours(RealPointerMixin, HttpCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        pill = cls.env[PILL]
        # the demo data (when loaded) holds the same records: start from a clean host
        pill.with_context(active_test=False).search([]).unlink()
        cls.env['test.web.gantt.pill2'].with_context(active_test=False).search([]).unlink()
        cls.records = pill._tl_build_host_records(today='2026-11-12', tz_offset_hours=3)

    def setUp(self):
        super().setUp()
        self.browser_size = DESKTOP
        self.touch_enabled = False
        self.env.ref('base.user_admin').lang = 'en_US'
        self._reset_h42()

    # -- helpers --------------------------------------------------------------------------------

    def _reset_h42(self):
        """Puts the records of the setup back by name: their dates, parents and the three links."""
        self.env[PILL]._tl_build_host_records(today='2026-11-12', tz_offset_hours=3)
        for name, sources in LINKS.items():
            self.env[PILL].search([('name', '=', name)]).write(
                {'dependency_field': [(6, 0, [self.records[source].id for source in sources])]})
        self.env.flush_all()

    def _open_h42(self):
        """The path that opens the menu "H42 Dependencies by parent" (found by its name)."""
        menu = self.env['ir.ui.menu'].search([('name', '=', H42_MENU)], limit=1)
        self.assertTrue(menu, 'the menu of H42 exists')
        return f'/odoo/action-{menu.action.id}'

    def _state(self):
        """What a gesture must leave alone: every record's dates and links, by name."""
        self.env.invalidate_all()
        return {
            record.name: (record.date_start, record.date_stop, sorted(record.dependency_field.ids))
            for record in self.env[PILL].search([])
        }

    def _tour(self, name):
        self.start_tour_with_pointer(self._open_h42(), name, login='admin', now=NOW, timezone=ZONE)

    def _counting(self):
        """Context manager: counts the writes and the rescheduling calls the server receives."""
        calls = []
        model = type(self.env[PILL])
        patches = []
        for method in ('write', 'web_gantt_reschedule'):
            original = getattr(model, method)

            def make(original, method):
                @wraps(original)
                def counted(records, *args, **kwargs):
                    calls.append((method, records._name))
                    return original(records, *args, **kwargs)
                return counted

            patches.append(patch.object(model, method, make(original, method)))

        class Counting:
            def __enter__(self_):
                for item in patches:
                    item.start()
                return calls

            def __exit__(self_, *exc):
                for item in reversed(patches):
                    item.stop()
        return Counting()

    def _run(self, name, writes=0):
        """Runs the tour; a scenario that writes nothing leaves every record as it was."""
        before = self._state()
        with self._counting() as calls:
            self._tour(name)
        pill_calls = [call for call in calls if call[1] == PILL]
        if writes is None:
            pass  # the tour counts the calls itself
        elif writes:
            self.assertEqual(len(pill_calls), writes, pill_calls)
        else:
            self.assertEqual(pill_calls, [], 'the gesture sent no call to the model')
        if writes is None:
            self._reset_h42()  # a real resize was written: put the records back
        else:
            self.assertEqual(self._state(), before)

    # -- R1: a gesture released without a write -------------------------------------------------

    def test_a1_drawing_released_on_empty_cell(self):
        self._run('tl_note_a1_drawing_on_empty_cell')

    def test_a2_drawing_released_over_column_headers(self):
        self._run('tl_note_a2_drawing_on_column_headers')

    def test_a3_drawing_released_over_row_headers(self):
        self._run('tl_note_a3_drawing_on_row_headers')

    def test_a4_drawing_released_on_own_pill(self):
        self._run('tl_note_a4_drawing_on_own_pill')

    def test_a5_drawing_released_on_a_pill_with_the_dependency(self):
        # one write on "Test" sends the dependency again; nothing changes
        self._run('tl_note_a5_drawing_on_a_pill_with_the_dependency', writes=1)

    def test_a6_drawing_released_outside_the_view(self):
        self._run('tl_note_a6_drawing_outside_the_view')

    def test_a7_move_released_outside_the_view(self):
        self._run('tl_note_a7_move_outside_the_view')

    def test_a8_move_released_over_the_headers(self):
        self._run('tl_note_a8_move_on_row_headers')
        self._reset_h42()
        self._run('tl_note_a8_move_on_column_headers')

    def test_a9_move_and_resize_released_where_started(self):
        # manual method: no write and no rescheduling call (002b2 D3, decision D1); the choice is
        # kept by the browser, so it is a new browser for each tour
        self._run('tl_note_a9_move_released_where_it_started')
        self._reset_h42()
        # keep buffer: the move calls the rescheduling method once, with no value (002c A44); the
        # tour counts the browser's calls (the method writes on the server as well)
        self._run('tl_note_a9_keep_buffer_move_released_where_it_started', writes=None)
        self._reset_h42()
        # the resize changes nothing and calls nothing, with the default method
        self._run('tl_note_a9_resize_released_where_it_started')
        self._reset_h42()
        self._run('tl_note_a9_band_begins_at_the_outer_box')

    # -- R2 and D2: an open popover and a press that can start a gesture -----------------------

    def _touch_run(self, name, writes=0):
        """A tour with touch input at desktop size (no mobile mode)."""
        self.touch_enabled = True
        try:
            self._run(name, writes=writes)
        finally:
            self.touch_enabled = False

    def _touch_tour(self, name):
        """The tour alone, with touch input at desktop size; the records stay as it left them."""
        self.touch_enabled = True
        try:
            self._tour(name)
        finally:
            self.touch_enabled = False

    def test_a11_popover_and_a_press_on_the_drawing_handle(self):
        self._run('tl_note_a11_popover_and_drawing_handle')

    def test_a11_a_click_on_the_drawing_handle_keeps_the_popover(self):
        self._run('tl_note_a11_click_on_the_drawing_handle')

    def test_a12_popover_and_a_press_on_the_resize_handle(self):
        self._run('tl_note_a12_popover_and_resize_handle')

    def test_a13_popover_and_a_press_on_the_body(self):
        self._run('tl_note_a13_popover_and_body')

    def test_a7_back_in_the_grid_by_two_paths(self):
        self._run('tl_note_a7_straight_down_to_the_empty_cell')
        self._run('tl_note_a7_slanting_to_the_empty_cell')

    def test_a12_resize_cancelled_with_and_without_a_scroll(self):
        for name in ('tl_note_a12_right_handle_scrolls_popover',
                     'tl_note_a12_right_handle_scrolls_no_popover',
                     'tl_note_a12_left_handle_no_scroll_popover',
                     'tl_note_a12_left_handle_no_scroll_no_popover'):
            with self.subTest(tour=name):
                self._run(name)

    def test_a12_click_and_double_click_over_the_lit_arrows_button(self):
        self._run('tl_note_a12_click_over_the_lit_arrows_button')
        self._run('tl_note_a12_double_click_over_the_lit_arrows_button')

    def test_a13_click_and_double_click_at_the_release_spot(self):
        for label in ('counted_from_one', 'counted_by_the_browser'):
            with self.subTest(label=label):
                self._run(f'tl_note_a13_click_at_the_release_spot_{label}')
                self._run(f'tl_note_a13_double_click_at_the_release_spot_{label}')

    def test_a13_a_click_after_a_cancelled_move_opens_the_popover_at_once(self):
        self._run('tl_note_a13_click_after_a_cancelled_move')

    def test_a14_touch_popover_and_a_finger_on_the_drawing_handle(self):
        self._touch_run('tl_note_a14_touch_drawing_handle')

    def test_a15_touch_popover_and_a_finger_on_the_body(self):
        self._touch_run('tl_note_a15_touch_body')

    def test_a16_touch_a_finger_on_a_resize_handle_place_moves_the_pill(self):
        # the lifted finger writes the move: the records are put back after each tour
        for label in ('r4', 'r2', 'l1', 'l4'):
            for tap in ('after_a_tap', 'without_a_tap'):
                with self.subTest(place=label, tap=tap):
                    self._touch_run(f'tl_note_a16_{label}_{tap}', writes=None)

    def test_a16_a_60_px_move_changes_no_date(self):
        before = self._state()
        for label in ('r4', 'l1'):
            with self.subTest(place=label):
                self._touch_tour(f'tl_note_a16_{label}_after_a_tap')
                # the call goes out with no value (R1a): every date is as it was
                self.assertEqual(self._state(), before)
        self._reset_h42()

    def test_a16_a_130_px_move_writes_twelve_hours(self):
        # Build: 12 Nov 06:00 to 14 Nov 15:00 UTC; left 12 hours earlier, right 12 hours later
        left = (datetime(2026, 11, 11, 18), datetime(2026, 11, 14, 3))
        right = (datetime(2026, 11, 12, 18), datetime(2026, 11, 15, 3))
        places = (('r4', left), ('r2', left), ('r12', left), ('l1', right), ('l4', right))
        for label, expected in places:
            with self.subTest(place=label):
                self._reset_h42()
                self._touch_tour(f'tl_note_a16_{label}_after_a_tap_far')
                self.env.invalidate_all()
                build = self.env[PILL].search([('name', '=', 'Build')])
                self.assertEqual((build.date_start, build.date_stop), expected)
        self._reset_h42()

    def test_a16_mouse_still_resizes_at_the_end_handle(self):
        self._run('tl_note_a16_mouse_resizes')

    # -- R3: which pill shows its handles after a touch gesture ---------------------------------

    def test_a17_after_touch_drawing_saved(self):
        # one write on "Overlap C" (the link); the records are put back after each tour
        for name in ('tl_note_a17_after_touch_drawing_saved',
                     'tl_note_a17_tap_on_an_empty_cell',
                     'tl_note_a17_tap_on_another_pill',
                     'tl_note_a17_tap_then_move_one_row_down'):
            with self.subTest(tour=name):
                self._touch_run(name, writes=None)

    def test_a18_touch_move_from_untapped_pill(self):
        self._touch_run('tl_note_a18_touch_move_from_untapped_pill', writes=None)

    # -- R4: what cancels a gesture -------------------------------------------------------------

    def test_a20_other_key_cancels(self):
        self._run('tl_note_a20_key_cancels_a_drawing')
        self._reset_h42()
        self._run('tl_note_a20_key_cancels_a_move')

    def test_a21_modifier_keys_do_not_cancel(self):
        # Shift does nothing: the release over "Overlap C" writes the link (the tour counts the
        # write; the records are put back)
        self._run('tl_note_a21_shift_does_not_cancel', writes=None)
        self._reset_h42()
        # Control turns a move into a copy; the tour ends it with Escape, nothing is written
        self._run('tl_note_a21_control_makes_a_copy')

    def test_a22_pointer_cancel(self):
        self._touch_run('tl_note_a22_pointer_cancel')

    def test_a23_second_finger_inside_the_grid(self):
        self._touch_run('tl_note_a23_second_finger_inside_the_grid')

    def test_a22_a_key_cancels_a_touch_drawing(self):
        self._touch_run('tl_note_a22_key_cancels_a_touch_drawing')

    def test_a23_second_finger_lifts_first(self):
        self._touch_run('tl_note_a23_second_finger_lifts_first')

    def test_a23_a_finger_cancels_a_mouse_drawing(self):
        self._touch_run('tl_note_a23_finger_cancels_a_mouse_drawing')

    def test_a23_f1_the_cancelling_finger_does_nothing_else(self):
        for gesture in ('drawing', 'move', 'resize'):
            for place in ('cell', 'plan', 'row_header', 'column_header', 'band'):
                with self.subTest(gesture=gesture, place=place):
                    self._touch_run(f'tl_note_a23_f1_{gesture}_{place}')
        # the control: a plain tap on the empty cell opens its dialog
        self._touch_run('tl_note_a23_f1_plain_tap')

    def test_a24_second_finger_outside_the_grid(self):
        self._touch_run('tl_note_a24_second_finger_outside_the_grid', writes=None)

    def test_a25_hidden_page_cancels(self):
        # the harness cannot hide the page: the tour marks it hidden by script
        self._run('tl_note_a25_hidden_page_cancels')

    def test_a26_lost_focus_does_not_cancel(self):
        # a focus-loss event sent to the window while the button is held: the release writes
        self._run('tl_note_a26_lost_focus_does_not_cancel', writes=None)
