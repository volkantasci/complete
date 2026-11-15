# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of selecting several cells, creating, deleting and the side panel, taken on demand
(not part of the normal run).

One capture per screen S1 to S22 of the spec's ``screens/index.md`` of slice 002b3 (names 53 to 74
of ``gantt_view``; light: no suffix, dark: ``-dark``, phone: ``.mobile``). Run with
``--test-tags gantt_multi_screens`` and ``--screenshots /mnt/cwg_shots`` on a database that has
``web_enterprise`` (for the dark scheme), with the git-ignored ``.cache/gantt_multi_screens`` of the
checkout mounted there (``run --rm -v /path/to/complete/.cache/gantt_multi_screens:/mnt/cwg_shots
odoo odoo ...``); the files land in ``.cache/gantt_multi_screens/gantt_view/`` and the ones to
keep are copied into ``docs/assets/gantt_view/``. The gestures are
the ones of the probes of ``test_multi_probes`` (same points, steps and pauses). The phone shows
what the phone does: the plain view, or the dialogs of slice 002b (no state of this slice exists
there), always taken with a mouse.
"""
import time

from odoo.tests import tagged

from . import test_drag_screens as drag
from . import test_edit_probes as edit
from . import test_multi_probes as multi
from .timeline_probe import TimelineProbeCase

HOST = 'test_web_gantt.host_action_{}'
BOTH = ('desktop', 'phone')
DESKTOP = ('desktop',)
Multi = multi.TimelineMultiProbes
SHIFT = 8
BETA_DOUGLAS_HEADER = multi.HEADERS.format(title='Host Contact 2') + '.at(-1)'


@tagged('-standard', 'gantt_multi_screens', 'post_install', '-at_install')
class TimelineMultiScreens(TimelineProbeCase):

    # the plumbing of the earlier screens and the gestures of the probes, reused as they are
    snap = drag.TimelineDragScreens.snap
    each = drag.TimelineDragScreens.each
    visit = drag.TimelineDragScreens.visit
    restore = drag.TimelineDragScreens.restore
    _snapshot = drag.TimelineDragScreens.__dict__['_snapshot']
    click_at = Multi.click_at
    click_el = edit.TimelineEditProbes.click_at
    box = edit.TimelineEditProbes.box
    mouse = Multi.mouse
    header_gesture = Multi.header_gesture
    row_after = Multi.row_after
    draw_h34 = Multi.draw_h34
    draw_h34_release = Multi.draw_h34_release
    open_popover = Multi.open_popover
    type_name = Multi.type_name
    hold_line = Multi.hold_line
    panel_line = staticmethod(Multi.panel_line)
    BUTTONS = Multi.BUTTONS
    POPOVER = Multi.POPOVER

    def setUp(self):
        super().setUp()
        self.stored = self._snapshot()

    click_xy = click_at

    def click_box(self, element_js):
        box = self.geometry(element_js)
        self.click_xy(box['geometry.x'] + box['geometry.width'] / 2,
                      box['geometry.y'] + box['geometry.height'] / 2)

    def today_cell_of_beta(self):
        """An empty cell of the first row under Beta, in today's column (seen on the phone)."""
        today = "document.querySelector('.o_tl_col.o_tl_is_today')"
        return (f"{self.row_after('Beta')}.querySelector("
                f"'.o_tl_cell[data-column=\"' + {today}.dataset.index + '\"]')")

    def rest(self, stems, shot):
        for stem in stems:
            shot(stem)

    # -- S1, S2: drawing a selection and its release (53, 54) ---------------------------

    def test_s01_s02_selection(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                self.draw_h34(release=False)
                shot('53-drag-selecting')
                self.draw_h34_release()
            else:
                shot('53-drag-selecting')
                self.click_el(self.today_cell_of_beta())
                self.wait("!!document.querySelector('.o_dialog .modal-dialog')")
                self.settle(500)
            shot('54-selected')
        self.each('h34', prepare)

    # -- S3: columns selected by headers (55) -------------------------------------------

    def test_s03_columns_selected(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                self.click_xy(452, 194)
                self.click_xy(835, 194, modifiers=SHIFT)
            else:
                self.click_box("document.querySelector('.o_tl_col[data-date=\"2026-11-09\"]')")
            shot('55-columns-selected')
        self.each('h34', prepare)

    # -- S4, S5: a row selected by its header, one cell and the Plan button (56, 57) ----

    def test_s04_row_selected(self):
        def prepare(viewport, shot):
            self.click_box(f"{BETA_DOUGLAS_HEADER}")
            self.settle(800)
            shot('56-row-selected')
            if viewport == 'phone':
                shot('57-plan-button')
        self.each('h34', prepare)

    def test_s05_plan_button(self):
        def prepare(viewport, shot):
            self.mouse('mouseMoved', 560, 470)
            self.mouse('mousePressed', 560, 470, button='left', buttons=1, clickCount=1)
            for x in (570, 580, 585):
                self.mouse('mouseMoved', x, 470, button='left', buttons=1)
                time.sleep(.05)
            self.mouse('mouseReleased', 585, 470, button='left', buttons=0, clickCount=1)
            self.settle(400)
            self.assertEqual(
                self.js("document.querySelectorAll('.o_tl_cell_picked').length"), 1)
            shot('57-plan-button')
        self.each('h34', prepare, viewports=DESKTOP)

    # -- S6: the popover; on the phone 002b's create dialog opened by New (58) ----------

    def test_s06_popover(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                self.click_xy(452, 470)
                self.open_popover()
            else:
                self.click_js("[...document.querySelectorAll('.o_control_panel .btn-primary')]"
                              ".find((b) => b.textContent.trim() === 'New')")
                self.wait("!!document.querySelector('.o_dialog .modal-dialog')")
                self.settle(600)
            shot('58-popover')
        self.each('h34', prepare)

    # -- S7 to S9: Add, the delete confirmation, the deletion (59 to 61) ----------------

    def test_s07_s09_create_and_delete(self):
        def prepare(viewport, shot):
            if viewport == 'phone':
                self.rest(('59-created', '60-delete-confirm', '61-deleted'), shot)
                return
            self.click_xy(452, 470)
            self.open_popover()
            self.type_name('Sprint')
            self.click_box(f"{self.POPOVER}.querySelector('.popover-footer .btn-primary')")
            self.wait("!document.querySelector('.o_multi_create_popover')")
            self.settle(800)
            sprints = self.js("[...document.querySelectorAll('.o_tl_pill')].filter("
                              "(p) => p.textContent.trim() === 'Sprint').length")
            self.assertEqual(sprints, 1, 'decision D1: one record for the clicked day')
            shot('59-created')
            self.click_xy(452, 470)
            self.click_box(f"{self.BUTTONS}.querySelector('[data-tooltip=\"Delete\"]')")
            self.wait("!!document.querySelector('.o_dialog .modal-dialog')")
            self.settle(600)
            shot('60-delete-confirm')
            self.click_box("document.querySelector('.o_dialog footer .btn-primary')")
            self.wait("!document.querySelector('.o_dialog')")
            self.settle(800)
            shot('61-deleted')
        self.each('h34', prepare)

    # -- S10: the popover of a date-only model (62) -------------------------------------

    def test_s10_popover_dated(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                column = self.geometry(
                    "document.querySelector('.o_tl_col[data-date=\"2026-11-14\"]')")
                row = self.geometry("document.querySelector('.o_tl_row[data-row-id]')")
                self.click_xy(column['geometry.x'] + column['geometry.width'] / 2,
                              row['geometry.y'] + row['geometry.height'] - 4)
                self.open_popover()
            shot('62-popover-dated')
        self.each('h35', prepare)

    # -- S11 to S17: the side panel, from rest to closed (63 to 69) ---------------------

    def test_s11_s17_panel(self):
        def prepare(viewport, shot):
            if viewport == 'phone':
                self.rest(('63-panel', '64-panel-handle', '65-panel-dragging',
                           '66-panel-scheduled', '67-unschedule-zone', '68-unscheduled',
                           '69-panel-collapsed'), shot)
                return
            self.wait("document.querySelectorAll('.o_tl_panel_line').length === 4")
            self.pointer_away()
            shot('63-panel')
            self.mouse('mouseMoved', 1313, 520)
            self.settle(500)
            shot('64-panel-handle')
            # the second half of Thursday 12 in the Beta row, from the rendered cells
            day = self.geometry("document.querySelector('.o_tl_col.o_tl_is_today')")
            beta = self.geometry(self.row('Beta'))
            at = (day['geometry.x'] + day['geometry.width'] * .75,
                  beta['geometry.y'] + beta['geometry.height'] / 2)
            self.hold_line(to=at)
            self.wait("!!document.querySelector('.o_tl_panel_ghost')")
            shot('65-panel-dragging')
            self.mouse('mouseReleased', at[0], at[1], button='left', buttons=0, clickCount=1)
            self.settle(800)
            self.wait("!!document.querySelector('.o_tl_pill')")
            self.pointer_away()
            shot('66-panel-scheduled')
            box = self.geometry(self.pill('Unscheduled'))
            x0 = box['geometry.x'] + box['geometry.width'] / 2 - 40
            y0 = box['geometry.y'] + box['geometry.height'] / 2
            self.mouse('mouseMoved', x0, y0)
            self.mouse('mousePressed', x0, y0, button='left', buttons=1, clickCount=1)
            for i in range(1, 7):
                self.mouse('mouseMoved', x0 + (1450 - x0) * i / 6, y0 + (420 - y0) * i / 6,
                           button='left', buttons=1)
                time.sleep(.05)
            self.settle(300)
            self.wait("!!document.querySelector('.o_tl_panel_dropzone')")
            shot('67-unschedule-zone')
            self.mouse('mouseReleased', 1450, 420, button='left', buttons=0, clickCount=1)
            self.settle(800)
            self.pointer_away()
            shot('68-unscheduled')
            self.js("document.querySelector('.o_tl_panel_toggle').click()")
            self.wait("!document.querySelector('.o_tl_panel')")
            self.settle(500)
            shot('69-panel-collapsed')
        self.each('h37', prepare)

    # -- S18, S19: Load more (70, 71) ----------------------------------------------------

    def test_s18_s19_load_more(self):
        queue = self.env['test.web.gantt.pill'].create(
            [{'name': f'Queue {i:02d}'} for i in range(1, 23)])
        # the records are part of the host for the visits (no restore deletes them)
        self.stored = self._snapshot()
        end = ("(() => { const p = document.querySelector('.o_tl_panel');"
               " p.scrollTop = p.scrollHeight; })()")

        def prepare(viewport, shot):
            if viewport == 'phone':
                self.rest(('70-load-more', '71-loaded'), shot)
                return
            self.wait("!!document.querySelector('.o_tl_panel_more')")
            self.js(end)
            self.pointer_away()
            shot('70-load-more')
            self.click_box("document.querySelector('.o_tl_panel_more')")
            self.wait("document.querySelectorAll('.o_tl_panel_line').length === 26")
            self.js(end)
            self.pointer_away()
            shot('71-loaded')
        try:
            self.each('h36', prepare)
        finally:
            queue.unlink()

    # -- S20, S21: a gesture on a row header, twice (72, 73) ----------------------------

    def test_s20_s21_row_header(self):
        def prepare(viewport, shot):
            x0, x1 = (60, 200) if viewport == 'desktop' else (20, 110)
            self.header_gesture(x0, x1)
            shot('72-row-header-drag')
            self.header_gesture(x0, x1)
            shot('73-row-header-again')
        self.each('h3', prepare)

    # -- S22: sample data, no panel (74) --------------------------------------------------

    def test_s22_sample_no_panel(self):
        def prepare(viewport, shot):
            self.wait("!!document.querySelector('.o_tl_box_sample')")
            self.settle(500)
            shot('74-sample-no-panel')
        self.each('h38', prepare)
