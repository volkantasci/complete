# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of moving, copying and resizing in the Gantt view, taken on demand (not part of
the normal run).

One capture per screen of the spec's ``screens/index.md`` of slice 002b2 (names 33 to 52 of
``gantt_view``; light: no suffix, dark: ``-dark``, phone: ``.mobile``). Run with
``--test-tags gantt_drag_screens`` and ``--screenshots <dir>`` on a database that has
``web_enterprise`` (for the dark scheme); the files land in ``<dir>/gantt_view/``. The gestures
are the ones of the probes of ``test_drag_probes`` (same press points, steps and hold times).
"""
import logging
import time

from odoo.tests import tagged

from . import test_drag_probes as probes
from . import test_edit_probes as edit
from . import test_screens as screens
from .timeline_probe import TimelineProbeCase

_logger = logging.getLogger(__name__)

HOST = 'test_web_gantt.host_action_{}'
BOTH = ('desktop', 'phone')
DESKTOP = ('desktop',)
Drag = probes.TimelineDragProbes
MOVED = probes.MOVED
UNDO = probes.UNDO_BUTTON
RESIZING = "document.querySelector('.o_tl_pill_resizing')"
HOLD_OFFLINE = """(() => {
    if (!window.__tlNet) {
        const send = XMLHttpRequest.prototype.send;
        window.__tlNet = {down: false};
        XMLHttpRequest.prototype.send = function (payload) {
            if (window.__tlNet.down) {
                setTimeout(() => {
                    this.dispatchEvent(new ProgressEvent('error'));
                    this.dispatchEvent(new ProgressEvent('loadend'));
                }, 0);
                return;
            }
            return send.call(this, payload);
        };
    }
})()"""


@tagged('-standard', 'gantt_drag_screens', 'post_install', '-at_install')
class TimelineDragScreens(TimelineProbeCase):

    # the helpers of the probes and of the earlier screens, reused as they are
    snap = screens.TimelineScreens.snap
    mouse = edit.TimelineEditProbes.mouse
    box = edit.TimelineEditProbes.box
    wait_for = edit.TimelineEditProbes.wait_for
    click_at = edit.TimelineEditProbes.click_at
    open_edit = edit.TimelineEditProbes.open_edit
    touch_event = Drag.touch_event
    bottom_of_first_row = Drag.bottom_of_first_row
    centre = Drag.centre
    key = Drag.key
    press_and_move = Drag.press_and_move
    release = Drag.release
    touch_hold_and_move = Drag.touch_hold_and_move
    wait_notification = Drag.wait_notification
    hover = Drag.hover
    visible_middle = Drag.visible_middle
    switch_range = Drag.switch_range
    prepare_review = Drag.prepare_review
    open_plan_dialog = Drag.open_plan_dialog
    _hover_pill = Drag._hover_pill
    _handle = Drag._handle
    _snapshot = Drag.__dict__['_snapshot']
    restore = Drag.restore
    visit = Drag.visit

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.env['test.web.gantt.pill']._tl_rtl_user()

    def setUp(self):
        super().setUp()
        self.stored = self._snapshot()

    # -- plumbing -------------------------------------------------------------------

    def each(self, host, prepare, viewports=BOTH, touch=None, login='admin', before=None):
        """Run ``prepare(viewport, shot)`` once per variant; ``shot(stem)`` stores the viewport
        as the variant's file of ``stem``. ``touch`` is the finger of the phone (the desktop
        never has one)."""
        errors = []
        for scheme in ('light', 'dark'):
            if scheme == 'dark' and not self.has_theme:
                continue
            for viewport in viewports:
                suffix = ('-dark' if scheme == 'dark' else '') \
                    + ('.mobile' if viewport == 'phone' else '') + '.png'
                user = self.env['res.users'].search([('login', '=', login)], limit=1)
                self.env['res.users.settings']._find_or_create_for_user(user).color_scheme = scheme
                taken = []

                def shot(stem, suffix=suffix, taken=taken):
                    taken.append(stem)
                    self.snap(stem + suffix)

                try:
                    finger = bool(touch) and viewport == 'phone'
                    with self.visit(host, scheme, viewport, touch=finger, login=login,
                                    prepare=before):
                        prepare(viewport, shot)
                except Exception as error:  # noqa: BLE001 - keep capturing the other variants
                    _logger.error('screens %s%s failed: %s', taken, suffix, error)
                    try:
                        self.snap('failed-' + suffix)
                    except Exception:  # noqa: BLE001
                        _logger.exception('no failure capture for %s', suffix)
                    errors.append(f'{taken}{suffix}: {error}')
        self.assertFalse(errors, '\n'.join(errors))

    def child_row(self, parent, name):
        """The row ``name`` under the group row ``parent`` (the same name stands under several)."""
        return f"""(() => {{
            const rows = [...document.querySelectorAll('.o_tl_row')];
            const title = (r) => r.querySelector('.o_tl_row_header')?.getAttribute('title');
            const from = rows.findIndex((r) => title(r) === {parent!r});
            return rows.slice(from + 1).find((r) => title(r) === {name!r});
        }})()"""

    # -- S4 (01): the handles ----------------------------------------------------------

    def test_s04_handles(self):
        def prepare(viewport, shot):
            self._hover_pill('Build' if viewport == 'desktop' else 'Overlap B')
            shot('33-handles')
        self.each('h1', prepare)

    # -- S1 and S2 (02 to 04): moving, the notice, Undo ---------------------------------

    def test_s01_s02_moving(self):
        def prepare(viewport, shot):
            x, y, _box = self.centre(self.pill('Review'))
            if viewport == 'desktop':
                x1 = x + 192
                self.press_and_move(x, y, x1, y)
            else:
                x1 = x - 96
                self.touch_hold_and_move(x, y, x1)
            self.wait(f"!!{MOVED}")
            self.settle()
            shot('34-moving')
            if viewport == 'desktop':
                self.release(x1, y)
            else:
                self.touch_event('touchEnd', [])
            self.wait_notification(True)
            shot('35-moved')
            self.click_js(UNDO)
            self.wait_notification(False)
            shot('36-undone')
        self.each('h1', prepare, touch=True)

    # -- S3 (05 to 07): copying ---------------------------------------------------------

    def test_s03_copying(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                name, row, dx = 'Review', 'Gamma', 192
            else:
                name, row, dx = 'Plan', 'Beta', 0
            x, y, _box = self.centre(self.pill(name))
            _rx, ry, _rbox = self.centre(self.row(row))
            self.press_and_move(x, y, x + dx, ry, ctrl=True)
            self.wait(f"!!{MOVED}")
            self.settle()
            shot('37-copying')
            self.release(x + dx, ry, ctrl=True)
            self.wait_notification(True)
            shot('38-copied')
            self.click_js(UNDO)
            self.wait_notification(False)
            shot('39-copy-removed')
        self.each('h2', prepare, touch=False)

    # -- S4 (08 to 10): resizing --------------------------------------------------------

    def test_s04_shrinking(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                self._hover_pill('Build')
                hx, hy, box = self.centre(self._handle('Build', 'stop'))
                to = box['geometry.x'] + box['geometry.width'] + 1 - 197
                self.press_and_move(hx, hy, to, hy)
            else:
                self._hover_pill('Overlap B')
                hx, hy, box = self.centre(self._handle('Overlap B', 'start'))
                to = box['geometry.x'] - 1 + 80
                self.press_and_move(hx, hy, to, hy, steps=1)
            self.wait(f"!!{RESIZING}")
            self.settle()
            shot('40-shrinking')
            self.release(to, hy)
            self.wait_notification(True)
            shot('42-resized')
        self.each('h1', prepare, touch=False)

    def test_s04_growing(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                name, steps, move = 'Build', 2, -192 + 4
            else:
                name, steps, move = 'Review', 1, -96 + 5
            self._hover_pill(name)
            hx, hy, box = self.centre(self._handle(name, 'start'))
            to = box['geometry.x'] - 1 + move
            self.press_and_move(hx, hy, to, hy, steps=steps)
            self.wait(f"!!{RESIZING}")
            self.settle()
            shot('41-growing')
            self.release(to, hy)
            self.wait_notification(True)
        self.each('h1', prepare, touch=False)

    # -- S5 (11, 12): locked pills ------------------------------------------------------

    def test_s05_cut_handles(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                self.switch_range('day')
                x, y = self.visible_middle(self.pill('Design'))
                self.hover(x, y)
                self.wait(f"!!{self.pill('Design')}.querySelector('.o_tl_handle')")
            else:
                x, y = self.visible_middle(self.pill('Long task'))
                self.hover(x, y)
            shot('43-cut-handles')
        self.each('h1', prepare, touch=False)

    def test_s05_locked(self):
        def prepare(viewport, shot):
            if viewport == 'desktop':
                self.switch_range('day')
                x, y = self.visible_middle(self.pill('Design'))
                dx = 40
            else:
                x, y, _box = self.centre(self.pill('Review'))
                dx = 30
            self.press_and_move(x, y, x + dx, y)
            self.wait(f"!!{MOVED}")
            self.settle()
            shot('44-locked')
            self.release(x + dx, y)
        for viewport, host in (('desktop', 'h1'), ('phone', 'h31')):
            self.each(host, lambda v, s: prepare(v, s), viewports=(viewport,), touch=False)

    # -- S6 (13, 14): an invalid resize ---------------------------------------------------

    def test_s06_invalid_resize(self):
        def prepare(viewport, shot):
            self._hover_pill('Review')
            hx, hy, _box = self.centre(self._handle('Review', 'stop'))
            self.press_and_move(hx, hy, hx - 88, hy, steps=1)
            self.wait(f"!!{RESIZING}")
            self.settle()
            shot('45-invalid-resizing')
            self.release(hx - 88, hy)
            self.wait("!!document.querySelector('.o_notification')")
            self.settle(800)
            shot('46-invalid-warning')
        for viewport, start, stop in (('desktop', '2026-11-12 07:00:00', '2026-11-12 11:00:00'),
                                      ('phone', '2026-11-11 19:00:00', '2026-11-11 23:00:00')):
            self.each('h1', prepare, viewports=(viewport,), touch=False,
                      before=lambda start=start, stop=stop: self.prepare_review(start, stop))

    # -- S7 (15, 16): the rows of a read-only grouping ------------------------------------

    def test_s07_readonly_grouping(self):
        def prepare(viewport, shot):
            pill, parent = ('Design', 'Beta') if viewport == 'desktop' else ('Plan', 'Alpha')
            x, y = self.visible_middle(self.pill(pill))
            creator = self.env.ref('base.user_admin').name
            _rx, ry, _rbox = self.centre(self.child_row(parent, creator))
            if viewport == 'desktop':
                # M51: pressed 5 px left of "Design"'s centre, moved to x 660, then to x 640 over
                # the target row; the release points are 5 px off the border too
                x, y = 640, 381
                self.press_and_move(x, y, 660, y, steps=1)
                self.mouse('mouseMoved', x, ry, button='left', buttons=1)
            else:
                self.press_and_move(x, y, x, ry, steps=3)
            self.settle()
            shot('47-readonly-refused')
            _gx, gy, _gbox = self.centre(self.row(parent))
            self.mouse('mouseMoved', x, gy, button='left', buttons=1)
            self.wait("!!document.querySelector('.o_tl_selection.o_tl_drop')")
            self.settle()
            shot('48-group-target')
            self.release(x, gy)
            self.settle()
        # the screens show the administrator as the demo data names it
        self.env.ref('base.user_admin').partner_id.name = 'Mitchell Admin'
        self.env.flush_all()
        self.each('h30', prepare, touch=False)

    # -- S8 (17): right-to-left selection badges ------------------------------------------

    def test_s08_rtl_selection(self):
        def prepare(viewport, shot):
            y = self.bottom_of_first_row()
            if viewport == 'desktop':
                x0, x1 = 1330, 1030
                self.mouse('mouseMoved', x0, y)
                self.mouse('mousePressed', x0, y, button='left', buttons=1, clickCount=1)
                for i in range(1, 9):
                    self.mouse('mouseMoved', x0 + (x1 - x0) * i / 8, y, button='left', buttons=1)
                    time.sleep(.03)
            else:
                # A61: 800 ms at x 230, along y 412 in four steps with 120 ms pauses, held 700 ms
                x0, x1, y = 230, 160, 412
                self.touch_event('touchStart', [(x0, y)])
                time.sleep(.8)
                for x in (215, 195, 175, 160):
                    self.touch_event('touchMove', [(x, y)])
                    time.sleep(.12)
            self.wait("!!document.querySelector('.o_tl_selection')")
            if viewport != 'desktop':
                time.sleep(.7)
            self.settle()
            shot('49-rtl-selection')
            if viewport == 'desktop':
                self.mouse('mouseReleased', x1, y, button='left', buttons=0, clickCount=1)
            else:
                self.touch_event('touchEnd', [])
            self.settle(500)
        self.each('h1', prepare, login='rtl', touch=True)

    # -- S9 (18, 19): deleting without a connection ---------------------------------------

    def test_s09_offline_delete(self):
        def prepare(viewport, shot):
            self.open_edit('Build')
            self.click_at("document.querySelector('.o_tl_popover_button')")
            self.wait_for("document.querySelector('.o_dialog .o_form_view')")
            self.settle(600)
            self.js(HOLD_OFFLINE)
            self.click_at("document.querySelector('.o_dialog .o_form_button_remove')")
            self.wait("document.querySelectorAll('.o_dialog').length === 2")
            self.settle(600)
            self.js("window.__tlNet.down = true")
            self.click_js("[...document.querySelectorAll('.o_dialog')].at(-1)"
                          ".querySelectorAll('footer button')[0]")
            self.wait("!!document.querySelector('.o_offline_systray') && "
                      "document.querySelectorAll('.o_dialog').length === 1")
            self.settle(600)
            shot('50-offline-delete')
            self.js("window.__tlNet.down = false; window.dispatchEvent(new Event('online'))")
            self.wait("!document.querySelector('.o_offline_systray')")
            self.settle(600)
            shot('51-back-online')
        self.each('h1', prepare, touch=False)

    # -- S10 (20): the search bar of the plan dialog --------------------------------------

    def test_s10_plan_search(self):
        def prepare(viewport, shot):
            self.open_plan_dialog()
            shot('52-plan-search')
        self.each('h2', prepare, touch=False)
