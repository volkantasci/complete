# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of slice 002e2, taken on demand (not part of the normal run).

One capture per screen S1 to S14 of the spec's ``screens/index.md`` with the index's file names
(light: no suffix, dark: ``-dark``, phone: ``.mobile``; the phone only where the index lists it),
each stored as ``002e2-<name>``. As 002e's ``test_screens`` the tests are skipped unless the
environment variable ``TIME_OFF_SCREENS`` is set and carry the tag
``hr_holidays_gantt_action_screens`` (``-standard``: no other run picks them up). Run them on a
database that has ``web_enterprise`` (for the dark scheme), with the git-ignored
``.cache/002e2/screens`` of the checkout mounted in the container and given as ``--screenshots``::

    ... run --rm -e TIME_OFF_SCREENS=1 -v ./.cache/002e2/screens:/mnt/shots odoo odoo \\
        -d <db> -i hr_holidays_gantt,web_enterprise \\
        --test-tags hr_holidays_gantt_action_screens --screenshots /mnt/shots --stop-after-init

The worlds are those of the action probes (``test_action_probes``); the browser clock is
Wednesday 11 November 2026, 11:00 in Brussels. The index's phone images of the popover show the
original's placement, which decision D5 corrects (002a's bottom sheet on Complete); S11's second
state shows no handles on the Approved pill and S14 no dialog (D7).
"""
import logging
import time
from datetime import date

from odoo.tests import tagged

from . import test_action_probes as ap
from . import test_probes as base
from . import time_off_fixtures as fx
from .test_screens import ScreenCase

_logger = logging.getLogger(__name__)

TAGS = ('-standard', 'hr_holidays_gantt_action_screens', 'post_install', '-at_install')
POP = ap.POP


class ActionScreenCase(ScreenCase, ap.ActionProbeCase):
    """The capture of 002e's ``ScreenCase`` and the steps of the action probes; no test."""

    def snap(self, name):
        super().snap(f'002e2-{name}')

    @staticmethod
    def stem(stem, scheme, viewport='desktop'):
        return stem + ('-dark' if scheme == 'dark' else '') \
            + ('.mobile' if viewport == 'phone' else '') + '.png'

    def variants(self, viewports=('desktop',)):
        for scheme in self.schemes():
            for viewport in viewports:
                yield scheme, viewport

    def run_variants(self, step, viewports=('desktop',), **page):
        """``step(scheme, viewport)`` inside the page of each variant; a failing variant is
        logged and the next one runs; the test fails at the end."""
        errors = []
        for scheme, viewport in self.variants(viewports):
            try:
                with self.week(scheme, viewport, **page):
                    step(scheme, viewport)
            except Exception as error:  # noqa: BLE001 - keep capturing the other variants
                _logger.exception('screen %s/%s failed', scheme, viewport)
                errors.append(f'{scheme}/{viewport}: {error}')
        self.assertFalse(errors, '\n'.join(errors))


@tagged(*TAGS)
class TestActionScreensDemo(ActionScreenCase):
    """S1: Anita Oliver's Approved "PTO 1d" (desktop popover, phone sheet, the short phone)."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.build_demo_world()
        leave = cls.env['hr.leave'].with_context(active_test=False).sudo().search([
            ('employee_id', '=', cls.world[ap.DEMO_NAME].id),
            ('request_date_from', '=', date(2026, 11, 18))])
        leave.with_context(leave_skip_state_check=True).write({'name': 'Trip'})
        cls.env.flush_all()

    def test_s01_approved(self):
        def step(scheme, viewport):
            self.prepare(viewport=viewport)
            pill = base.pill_js(ap.DEMO_NAME, 'PTO 1d')
            self.click_pill(pill, viewport,
                            '.o_hhg_pop_sheet' if viewport == 'phone' else '.o_hhg_pop')
            self.snap(self.stem('01-pop-approved', scheme, viewport))
        self.run_variants(step, ('desktop', 'phone'))

    def test_s01_short(self):
        def step(scheme, viewport):
            self.prepare(viewport='phone')
            self.browser._websocket_request('Emulation.setDeviceMetricsOverride', params={
                'width': 390, 'height': 801, 'deviceScaleFactor': 1, 'mobile': True})
            self.settle(800)
            self.click_pill(base.pill_js(ap.DEMO_NAME, 'PTO 1d'), 'phone', '.o_hhg_pop_sheet')
            self.snap(self.stem('01-pop-short', scheme, 'phone'))
        self.run_variants(step, ('phone',))


@tagged(*TAGS)
class TestActionScreensAct(ActionScreenCase):
    """S2 to S4, S11, S12: "Toff Act" with a request To Approve, one at Second Approval, one
    Approved."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        fx.make_act_state(cls.env, cls.schedule)
        cls.isolate(keep={ap.ACT})

    def day_pill(self, day):
        return ap.pill_on(ap.ACT, ap.WEEK_DAYS[day])

    def test_s02_confirm(self):
        def step(scheme, viewport):
            self.prepare(ap.ACT, viewport)
            self.click_pill(self.day_pill(18), viewport,
                            '.o_hhg_pop_sheet' if viewport == 'phone' else '.o_hhg_pop')
            self.snap(self.stem('02-pop-confirm', scheme, viewport))
        self.run_variants(step, ('desktop', 'phone'))

    def test_s03_second_and_validated(self):
        def step(scheme, viewport):
            self.prepare(ap.ACT)
            self.click_pill(self.day_pill(19))
            self.snap(self.stem('03-pop-second', scheme))
            self.close_popover()
            self.click_pill(self.day_pill(20))
            self.snap(self.stem('03-pop-validated', scheme))
        self.run_variants(step)

    def test_s04_dirty(self):
        def step(scheme, viewport):
            self.prepare(ap.ACT)
            self.click_pill(self.day_pill(18))
            self.type_description()
            self.settle(500)
            self.snap(self.stem('04-pop-dirty', scheme))
        self.run_variants(step)

    def test_s11_hover(self):
        def step(scheme, viewport):
            self.prepare(ap.ACT)
            wed = self.day_pill(18)
            self.pointer_on(wed)
            self.snap(self.stem('11-hover', scheme))
            handle = f"{wed}.querySelectorAll('.o_tl_handle')[1]"
            x, y = self.centre(handle)
            self.mouse('mouseMoved', x, y, buttons=0)
            self.settle(700)
            self.snap(self.stem('12-hover-end', scheme))
        self.run_variants(step)

    def test_s12_dialog(self):
        def step(scheme, viewport):
            self.prepare(ap.ACT)
            x, y = self.centre(self.day_pill(18))
            self.mouse('mouseMoved', x, y, buttons=0)
            self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
            self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
            time.sleep(0.06)
            self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=2)
            self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=2)
            self.wait("!!document.querySelector('.modal .o_form_view')", timeout=30)
            self.settle(1500)
            self.snap(self.stem('13-dialog', scheme))
        self.run_variants(step)


@tagged(*TAGS)
class TestActionScreensRoles(ActionScreenCase):
    """S5 to S7: Toff Role Emp's own request To Approve (Management > Time Off) and his Approved
    request in the report view."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        fx.make_role_users(cls.env, cls.schedule)
        cls.isolate(keep={'Toff Role Emp', 'Toff Peer', 'Toff Role None', 'Toff Role Approver',
                          'Toff Role Manager', 'Toff Role Officer', 'Toff Role Admin'})
        emp = cls.env['hr.employee'].search([('name', '=', 'Toff Role Emp')], limit=1)
        cls.waiting = fx.make_waiting(cls.env, emp, fx.find_type(cls.env, 'STO'),
                                      date(2026, 11, 18))
        cls.env.flush_all()

    def test_s05_s06_own_request(self):
        errors = []
        for scheme in self.schemes():
            try:
                with self.open(scheme, action=base.MANAGEMENT, login='toff_emp',
                               ready='.o_list_view'):
                    self.settle(500)
                    self.js("document.querySelector('.o_cp_switch_buttons .o_switch_view.o_gantt')"
                            ".click()")
                    self.wait("!!document.querySelector('.o_tl_renderer .o_tl_row_header')",
                              timeout=30)
                    self.loaded("!!document.querySelector('.o_tl_renderer .o_tl_row_header')")
                    self.to_week()
                    self.mouse('mouseMoved', 1000, 123, buttons=0)
                    self.settle(900)
                    self.click_pill(ap.pill_on('Toff Role Emp', '2026-11-18'))
                    self.snap(self.stem('05-pop-emp', scheme))
                    self.type_description()
                    self.settle(500)
                    self.snap(self.stem('06-pop-save', scheme))
            except Exception as error:  # noqa: BLE001
                _logger.exception('screen %s failed', scheme)
                errors.append(f'{scheme}: {error}')
        self.assertFalse(errors, '\n'.join(errors))

    def test_s07_report(self):
        # the request of Wednesday 18 is Approved here (the other test's request steps aside)
        emp = self.waiting.employee_id
        self.waiting.sudo().unlink()
        fx.make_leave(self.env, emp, fx.find_type(self.env, 'STO'), date(2026, 11, 18))
        self.env.flush_all()

        def step(scheme, viewport):
            self.prepare('Toff Role Emp', viewport)
            self.click_pill(f"{base.pills_of('Toff Role Emp')}[0]", viewport,
                            '.o_hhg_pop_sheet' if viewport == 'phone' else '.o_hhg_pop')
            self.snap(self.stem('07-pop-report', scheme, viewport))
        self.run_variants(step, ('desktop', 'phone'), login='toff_emp')


@tagged(*TAGS)
class TestActionScreensSplit(ActionScreenCase):
    """S8 to S10: "Toff Act" Approved from 16 to 18 November, split and undone."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.leave = fx.make_split_state(cls.env, cls.schedule)
        cls.isolate(keep={ap.ACT})

    def test_s08_s09_s10_split(self):
        def step(scheme, viewport):
            self.prepare(ap.ACT)
            pill = f"{base.pills_of(ap.ACT)}[0]"
            border = self.geometry(base.column_js('2026-11-17'))['geometry.x']
            box = self.geometry(pill)
            y = box['geometry.y'] + box['geometry.height'] / 2
            self.mouse('mouseMoved', border + 40, y, buttons=0)
            self.mouse('mouseMoved', border + 2, y, buttons=0)
            self.wait("!!document.querySelector('.o_hhg_split_tool')", timeout=15)
            self.settle(700)
            self.snap(self.stem('08-split-tool', scheme))
            self.mouse('mousePressed', border + 2, y, button='left', buttons=1, clickCount=1)
            self.mouse('mouseReleased', border + 2, y, button='left', buttons=0, clickCount=1)
            self.wait("!!document.querySelector('.o_notification')", timeout=30)
            self.settle(1500)
            self.snap(self.stem('09-split-done', scheme))
            undo = "[...document.querySelectorAll('.o_notification button')]"
            self.js(f"{undo}.find((b) => b.textContent.trim() === 'Undo').click()")
            self.wait(f"{base.pills_of(ap.ACT)}.length === 1", timeout=30)
            self.settle(1500)
            self.snap(self.stem('10-split-undone', scheme))
        self.run_variants(step)


@tagged(*TAGS)
class TestActionScreensMove(ActionScreenCase):
    """S13, S14: "Toff Act" To Approve on Monday 16 and Approved on Wednesday 18."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        fx.make_move_state(cls.env, cls.schedule)
        cls.isolate(keep={ap.ACT})

    def test_s13_s14_moves(self):
        def step(scheme, viewport):
            self.prepare(ap.ACT)
            width = self.geometry(base.column_js('2026-11-16'))['geometry.width']
            pill = ap.pill_on(ap.ACT, '2026-11-16')
            x, y = self.centre(pill)
            self.mouse('mouseMoved', x, y, buttons=0)
            self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
            for n in range(1, 7):
                self.mouse('mouseMoved', x + 30 + (width - 30) * n / 6, y, buttons=1)
                time.sleep(0.05)
            self.settle(700)
            self.snap(self.stem('14-moving', scheme))
            self.mouse('mouseReleased', x + width, y, button='left', buttons=0, clickCount=1)
            self.wait("!!document.querySelector('.o_notification')", timeout=30)
            self.settle(1500)
            self.snap(self.stem('15-moved', scheme))
            undo = ("[...document.querySelectorAll('.o_notification button')]"
                    ".filter((b) => b.textContent.trim() === 'Undo')")
            self.js(f"{undo}[0].click()")
            self.settle(2000)
            self.snap(self.stem('16-move-undone', scheme))
            self.drag(ap.pill_on(ap.ACT, '2026-11-18'), width)
            self.snap(self.stem('17-move-refused', scheme))
        self.run_variants(step)


@tagged(*TAGS)
class TestActionScreensAway(ActionScreenCase):
    """N1 (A94): the card of "Toff Away" with the Community's "back on" line, the leave covering
    the server's real now (the card's status clock is not pinned)."""

    pin_status_clock = False

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        fx.make_away_state(cls.env, cls.schedule)
        cls.isolate(keep={fx.AWAY_NAME})

    def test_n1_card_away(self):
        def step(scheme, viewport):
            self.loaded()
            kind = self.js("document.querySelector('.o_tl_range_button').textContent.trim()")
            if kind != 'Month':
                self.choose_range('month')
            self.search(fx.AWAY_NAME)
            self.mouse('mouseMoved', 1000, 123, buttons=0)
            self.settle(500)
            self.real_click(base.in_row(fx.AWAY_NAME, '.o_hrg_avatar'), settle=1.5)
            lines = ("[...document.querySelectorAll('.o_avatar_card .o_card_user_infos "
                     ".text-warning')].filter((e) => /^Back on /.test(e.textContent.trim()))")
            self.wait(f"{lines}.length > 0", timeout=30)
            self.settle(800)
            self.snap(self.stem('n1-card-away', scheme))
        self.run_variants(step)
