# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Screenshots of slice 002d3, taken on demand (not part of the normal run).

One capture per screen S1 to S16 of the spec's ``screens/index.md`` (light: no suffix, dark:
``-dark``, phone: ``.mobile``; the phone only where the index lists it). The test is skipped unless
the environment variable ``HR_ACTIONS_SCREENS`` is set, and carries the tag
``hr_attendance_gantt_actions_screens`` (``-standard``: no other run picks it up). Run it on a
database that has ``web_enterprise`` (for the dark scheme) with the git-ignored
``.cache/actions_screens`` of the checkout mounted in the container and given as
``--screenshots``; the files land there::

    ... run --rm -e HR_ACTIONS_SCREENS=1 \\
        -v <checkout>/.cache/actions_screens:/mnt/shots odoo odoo \\
        -d <db> -i hr_attendance_gantt,test_web_gantt,web_enterprise \\
        --test-tags hr_attendance_gantt_actions_screens --screenshots /mnt/shots --stop-after-init

The data are those of 002d2's screens: the 22 employees that stand for the demo data, renamed to
the demo's names; "Mitchell Admin" for the administrator's own employee; the prepared "Gantt
Moved" and the role users of ``actions_fixtures``. The browser clock is Wednesday 11 November
2026, 11:00 in Brussels. Where an image of the spec shows the original's defect that a decision
corrects (S4: two dialogs; S15: the moved open attendance with a check-out; the pale pink pills
of the dark images), the capture shows Complete's corrected state.
"""
import base64
import logging
import os
import pathlib
import unittest
from datetime import date

import odoo
from odoo.tests import tagged

from . import test_actions_probes as actions
from . import test_hr_rows_probes as probes
from .actions_fixtures import (
    MOVED_NAME,
    action_in_november,
    make_gantt_moved,
    make_role_users,
)
from .hr_rows_fixtures import TZ

BOTH = ('desktop', 'phone')
DESKTOP = ('desktop',)
_logger = logging.getLogger(__name__)

FLAG = 'HR_ACTIONS_SCREENS'
MY_ACTION = 'hr_attendance.hr_attendance_my_action'
EMPLOYEE_FORM = 'hr.open_view_employee_list_my'
MODAL = actions.MODAL
SWITCH_MENU_ITEM = ("[...document.querySelectorAll('.o-dropdown--menu .o-dropdown-item')]"
                    ".find((el) => el.textContent.trim() === %s)")


@tagged('-standard', 'hr_attendance_gantt_actions_screens', 'post_install', '-at_install')
class TestActionsScreens(probes.HrProbes):

    # the world of 002d2's screens, reused as it is
    employee = probes.TestHrRowsProbes.employee
    demo_world = probes.TestHrRowsProbes.demo_world
    demo_names = None

    @classmethod
    def setUpClass(cls):
        if not os.environ.get(FLAG):
            raise unittest.SkipTest(f'the screenshots are taken only with {FLAG} set')
        super().setUpClass()

    # -- the capture ----------------------------------------------------------------------------

    def snap(self, name):
        """Wait for animations to settle, then store the viewport as ``name``."""
        self.settle(900)
        res = self.browser._websocket_request('Page.captureScreenshot')
        folder = pathlib.Path(odoo.tools.config['screenshots'])
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(base64.b64decode(res['data']))

    def quiet(self, viewport='desktop'):
        """A page without the data counters of the Gantt view: no scrollbar, settled."""
        self.browser._websocket_request('Emulation.setScrollbarsHidden', params={'hidden': True})
        self.js("document.head.appendChild(Object.assign(document.createElement('style'), "
                "{textContent: '* { scrollbar-width: none !important; }'}))")
        self.settle(1200)

    def each(self, prepare, viewports=BOTH, login='admin', opener=None, loaded=True):
        """Run ``prepare(viewport, shot)`` once per variant; ``shot(stem)`` stores the viewport as
        the variant's file of ``stem``. A variant that fails is logged and the next one still runs;
        the test fails at the end. ``opener(scheme, viewport)`` makes the page (the management
        view by default), ``loaded`` False when the page is no Gantt view."""
        errors = []
        for scheme in ('light', 'dark'):
            if scheme == 'dark' and not self.has_theme:
                continue
            for viewport in viewports:
                suffix = ('-dark' if scheme == 'dark' else '') \
                    + ('.mobile' if viewport == 'phone' else '') + '.png'
                taken = []

                def shot(stem, suffix=suffix, taken=taken):
                    taken.append(stem)
                    self.snap(stem + suffix)

                try:
                    page = opener(scheme, viewport) if opener \
                        else self.open(scheme, viewport, login=login)
                    with page:
                        if loaded:
                            self.loaded(viewport)
                        else:
                            self.quiet(viewport)
                        prepare(viewport, shot)
                except Exception as error:  # noqa: BLE001 - keep capturing the other variants
                    _logger.error('screens %s%s failed: %s', taken, suffix, error)
                    try:
                        self.snap('failed-' + suffix)
                    except Exception:  # noqa: BLE001
                        _logger.exception('no failure capture for %s', suffix)
                    errors.append(f'{taken}{suffix}: {error}')
        self.assertFalse(errors, '\n'.join(errors))

    def away(self):
        """The pointer on an empty place of the control bar, so no tooltip stays open."""
        self.mouse('mouseMoved', 1000, 123, buttons=0)
        self.settle(1200)

    # -- the worlds -----------------------------------------------------------------------------

    def demo_screens(self):
        self.archive_others('HRA ')
        like = self.demo_world()
        employees = self.env['hr.employee'].search([('name', 'like', 'HRA %')])
        for employee in employees:
            employee.name = probes_names()[employee.name]
        self.env.flush_all()
        return like

    def admin_employee(self):
        """The administrator's own employee: the row of S2 (a demo database has it already)."""
        self.archive_others('HRA ')
        administrator = self.env.ref('base.user_admin')
        existing = self.env['hr.employee'].search([('user_id', '=', administrator.id)])
        if existing:
            existing.write({'name': 'Mitchell Admin'})
        else:
            self.employee('Mitchell Admin', user_id=administrator.id)
        self.env.flush_all()

    # -- the pages ------------------------------------------------------------------------------

    def my_page(self, scheme, viewport):
        return self.page(MY_ACTION, scheme, viewport, touch=False, clock=probes.CLOCK,
                         timezone=TZ, ready='.o_calendar_view')

    def form_page(self, employee):
        def opener(scheme, viewport):
            return self.page(
                EMPLOYEE_FORM, scheme, viewport, query=f'/{employee.id}', touch=False,
                clock=probes.CLOCK, timezone=TZ,
                ready='.o_form_view .o_field_widget[name="name"]')
        return opener

    def choose_view(self, name, viewport):
        """The view switcher: the buttons of the desktop or the menu of the phone."""
        if viewport == 'phone':
            self.js(actions.SWITCH_MENU + '.click()')
            self.wait(f"!!({SWITCH_MENU_ITEM % repr(name)})")
            self.settle(700)
            self.js(f"{SWITCH_MENU_ITEM % repr(name)}.click()")
        else:
            self.js(f"[...{actions.SWITCH_BUTTONS}].find((el) => el.dataset.tooltip === "
                    f"{name!r}).click()")
        self.settle(1500)

    def open_monthly(self, viewport):
        """The employee form's worked-hours button, then the Gantt view of the list."""
        self.wait(f"!!{actions.WORKED_HOURS} || !!{actions.BUTTON_BOX_TOGGLE}", timeout=60)
        if viewport == 'phone':
            self.js(actions.BUTTON_BOX_TOGGLE + '.click()')
            self.wait(f"!!{actions.WORKED_HOURS}")
        self.js(actions.WORKED_HOURS + '.click()')
        # the server's call runs on a frozen clock (action_in_november), which the wait's own
        # deadline would see: let it finish first
        self.settle(1500)
        self.wait("!!document.querySelector('.o_list_view')", timeout=60)
        self.settle(1200)

    def abigail(self):
        return f"({probes.pills_of('Abigail Peterson')})[0]"

    def open_dialog_of_abigail(self, viewport):
        if viewport == 'phone':
            self.js(f"{self.abigail()}.scrollIntoView({{inline: 'center'}})")
            self.settle(500)
            self.finger_tap(self.abigail())
        else:
            self.real_click(self.abigail())
        self.wait(f"!!document.querySelector('{MODAL} .o_form_view .o_form_sheet')", timeout=30)
        self.settle(1500)

    def click_cell_at(self, name, hour):
        actions.TestActionsProbes.click_cell_at(self, name, hour)

    # -- S1, S2: My Attendances -----------------------------------------------------------------

    def test_s01_my_calendar(self):
        self.admin_employee()

        def prepare(viewport, shot):
            self.away()
            shot('01-my-calendar')
        self.each(prepare, opener=self.my_page, loaded=False)

    def test_s02_my_gantt(self):
        self.admin_employee()

        def prepare(viewport, shot):
            self.choose_view('Gantt', viewport)
            self.wait("document.querySelectorAll('.o_tl_progress_label').length > 0", timeout=60)
            self.away()
            shot('02-my-gantt')
        self.each(prepare, opener=self.my_page, loaded=False)

    # -- S3 to S8: the dialogs ------------------------------------------------------------------

    def test_s03_open(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.open_dialog_of_abigail(viewport)
            shot('03-open')
        self.each(prepare)

    def test_s04_one_dialog_after_a_double_click(self):
        """Decision D1: two clicks within 200 ms show one dialog, as S3."""
        self.demo_screens()

        def prepare(viewport, shot):
            x, y = self.centre(self.abigail())
            self.mouse('mouseMoved', x, y, buttons=0)
            for count in (1, 2):
                self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=count)
                self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=count)
            self.wait(f"!!document.querySelector('{MODAL} .o_form_view .o_form_sheet')",
                      timeout=30)
            self.settle(1500)
            self.assertEqual(self.js(actions.DIALOGS), 1)
            shot('04-one-dialog')
        self.each(prepare, viewports=DESKTOP)

    def test_s05_warning(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.click_cell_at('Beth Evans', 15)
            shot('05-warning')
        self.each(prepare)

    def test_s06_plain(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.click_cell_at('Abigail Peterson', 15)
            shot('06-plain')
        self.each(prepare)

    def test_s07_link(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.click_cell_at('Beth Evans', 15)
            self.real_click(actions.LINK, settle=1.5)
            self.wait("document.querySelectorAll('.o_form_view [name=\"name\"]').length > 0",
                      timeout=30)
            self.away()
            shot('07-link')
        self.each(prepare, viewports=DESKTOP)

    def test_s08_create_week(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.choose_range('week')
            cell = probes.cell_of_day('Abigail Peterson', '2026-11-11')
            self.js(f"{cell}.scrollIntoView({{block: 'nearest', inline: 'center'}})")
            self.settle(600)
            self.real_click(cell, settle=0.9)
            self.wait(f"!!document.querySelector('{MODAL} .o_form_view .o_form_sheet')",
                      timeout=30)
            self.settle(1500)
            shot('08-create-week')
        self.each(prepare, viewports=DESKTOP)

    # -- S9, S10: the search menu ---------------------------------------------------------------

    def test_s09_search(self):
        self.demo_screens()

        def prepare(viewport, shot):
            self.js("document.querySelector('.o_searchview_dropdown_toggler').click()")
            self.wait("!!document.querySelector('.o_search_bar_menu')")
            self.settle(1200)
            shot('09-search')
        self.each(prepare, viewports=DESKTOP)

    def test_s10_no_contract(self):
        like = self.demo_screens()
        # the spec's image was taken on the server's 11 November, when Keith Byrd's contract
        # (ending that day) still ran; the server's clock here reads another day, so the contract
        # ends today for the capture
        keith = like['HRA Keith']
        keith.write({'contract_date_end': max(date.today(), date(2026, 11, 11))})
        self.env.flush_all()

        def prepare(viewport, shot):
            self.pick_filter('No Active Contract')
            self.away()
            shot('10-no-contract')
        self.each(prepare, viewports=DESKTOP)

    # -- S11, S12: the monthly action -----------------------------------------------------------

    def monthly(self, stem, gantt):
        like = self.demo_screens()

        def prepare(viewport, shot):
            with action_in_november():
                self.open_monthly(viewport)
                if gantt:
                    self.choose_view('Gantt', viewport)
                    self.wait("!!document.querySelector('.o_hag_overview_band "
                              ".o_attendance_entry_card')", timeout=30)
                    self.settle(1200)
            self.away()
            shot(stem)
        self.each(prepare, opener=self.form_page(like['HRA Anita']), loaded=False)

    def test_s11_monthly_list(self):
        self.monthly('11-monthly-list', gantt=False)

    def test_s12_monthly(self):
        self.monthly('12-monthly', gantt=True)

    # -- S13 to S15: moving -----------------------------------------------------------------------

    def drag(self, pill, dx):
        x, y = self.centre(pill)
        self.mouse('mouseMoved', x, y, buttons=0)
        self.mouse('mousePressed', x, y, button='left', buttons=1, clickCount=1)
        for step in range(1, 13):
            self.mouse('mouseMoved', x + dx * step / 12, y, buttons=1)
        self.settle(400)
        return x + dx, y

    def test_s13_s14_move(self):
        self.demo_screens()

        def prepare(viewport, shot):
            x, y = self.drag(self.abigail(), 111)
            shot('13-dragging')
            self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
            self.settle(1500)
            self.wait(f"{actions.NOTICES_WITH_UNDO} > 0", timeout=30)
            shot('14-dragged')
            # the move is written: the next variant starts from the first records again
            self.env.invalidate_all()
            self.env['hr.attendance'].search(
                [('employee_id.name', '=', 'Abigail Peterson')]).with_context(
                skip_time_rules=True).write({
                    'check_in': probes._datetime('2026-11-11 06:00:00'),
                    'check_out': probes._datetime('2026-11-11 09:30:00')})
            self.env.flush_all()
        self.each(prepare, viewports=DESKTOP)

    def test_s15_open_moved(self):
        """Decision D4: the open attendance stays open after the move (the pill reads "A")."""
        self.archive_others(MOVED_NAME)
        make_gantt_moved(self.env, schedule=self.schedule)
        self.env.flush_all()

        def prepare(viewport, shot):
            self.search(MOVED_NAME)
            pill = f"({probes.pills_of(MOVED_NAME)})[0]"
            x, y = self.drag(pill, 111)
            self.mouse('mouseReleased', x, y, button='left', buttons=0, clickCount=1)
            self.settle(1500)
            self.wait(f"{actions.NOTICES_WITH_UNDO} > 0", timeout=30)
            self.away()
            shot('15-open-moved')
            self.env.invalidate_all()
            self.env['hr.attendance'].search(
                [('employee_id.name', '=', MOVED_NAME)]).with_context(
                skip_time_rules=True).write({
                    'check_in': probes._datetime('2026-11-11 07:00:00'), 'check_out': False})
            self.env.flush_all()
        self.each(prepare, viewports=DESKTOP)

    # -- S16: a user with no attendance role ----------------------------------------------------

    def test_s16_role_none(self):
        make_role_users(self.env, schedule=self.schedule)
        self.archive_others('Gantt Role None')
        self.env.flush_all()

        def prepare(viewport, shot):
            self.away()
            shot('16-role-none')
        self.each(prepare, viewports=DESKTOP, login='gantt_none')


def probes_names():
    """The demo's names for the employees the probes call "HRA ..." (002d2's table)."""
    from .test_hr_rows_screens import DEMO_NAMES
    return DEMO_NAMES
