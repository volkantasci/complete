# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the ``ui`` scenarios of slice 002e in the time-off leave view (Time Off >
Overview as an Officer or an administrator, and Management > Time Off).

The browser clock is Wednesday 11 November 2026, 10:00 UTC (11:00 in Brussels) and runs on, the
browser zone Europe/Brussels, the window 1600 x 900 and a fresh browser unless a scenario names
another. Every record and user is created here (CI has no demo data): the demo-like employees
come from ``make_demo_like``; the employees of a database with demo data that a test did not
make move to another company, so that they never enter a view the tour counts. The tours are in
``static/tests/tours/time_off_tours.js``; the report view and the roles are in another part.
"""
import json
import time
from datetime import date, datetime
from unittest.mock import patch

from odoo.addons.test_web_gantt.tests import timeline_real_pointer
from odoo.addons.test_web_gantt.tests.timeline_real_pointer import MouseBridge, RealPointerMixin
from odoo.tests import HttpCase, tagged
from odoo.tests.common import ChromeBrowser

from . import time_off_fixtures as fx

TZ = fx.TZ
NOW = datetime(2026, 11, 11, 10, 0)
OVERVIEW = '/odoo/action-hr_holidays_gantt.action_hr_holidays_overview'
MANAGEMENT = '/odoo/action-hr_holidays.hr_leave_action_action_approve_department'
PHONE = (390, 844)
AWAY = 'Toff Elsewhere'


class CommandBridge(MouseBridge):
    """The mouse bridge, and a request with a ``method`` sends that DevTools command with each of
    its events as the parameters (the keys of A73)."""

    def run(self):
        try:
            while not self.stopped.wait(.05):
                pending = self.evaluate(timeline_real_pointer.PENDING_MOUSE)
                if not pending:
                    continue
                request = json.loads(pending)
                if request['id'] in self.sent:
                    continue
                self.sent.add(request['id'])
                method = request.get('method') or (
                    'Input.dispatchTouchEvent' if request.get('touch')
                    else 'Input.dispatchMouseEvent')
                for event in request['events']:
                    self.browser._websocket_request(method, params=event)
                    time.sleep(.03)
                self.evaluate(f"window.__tl_mouse_done = {int(request['id'])}")
        except Exception as error:  # noqa: BLE001 - recorded, and re-raised by the test
            self.error = error


class TimeOffToursBase(RealPointerMixin, HttpCase):
    """The helpers of the live tours of the time-off views: the administrator, one language, the
    real pointer, ``_tour`` and the isolation of the employees. It holds no test."""

    def setUp(self):
        super().setUp()
        self.browser_size = '1600x900'
        self.touch_enabled = False
        self.admin = fx.find_admin(self.env)
        self.admin.write({'lang': 'en_US', 'tz': TZ})
        self._one_language()
        self.schedule = fx.find_schedule(self.env)
        # the employees of a database with demo data, before the test makes any
        self.preexisting = self.env['hr.employee'].with_context(active_test=False).search([]).ids

    def _one_language(self):
        """One active language: a second one changes no element of the views."""
        others = self.env['res.lang'].search([('active', '=', True), ('code', '!=', 'en_US')])
        if others:
            self.env['res.users'].with_context(active_test=False).search(
                [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
            self.env['res.partner'].with_context(active_test=False).search(
                [('lang', 'in', others.mapped('code'))]).write({'lang': 'en_US'})
            others.write({'active': False})

    # -- helpers --------------------------------------------------------------------------------

    def start_tour_with_pointer(self, *args, **kwargs):
        plain = getattr(self, '_plain_viewport', None)
        navigate = ChromeBrowser.navigate_to

        def navigate_to(browser, *a, **kw):
            if plain:
                # a page of the phone's size and no touch emulation, as the spec's values were taken
                browser._websocket_request('Emulation.setDeviceMetricsOverride', params={
                    'width': plain[0], 'height': plain[1], 'deviceScaleFactor': 1, 'mobile': False})
            return navigate(browser, *a, **kw)

        with patch.object(timeline_real_pointer, 'MouseBridge', CommandBridge), \
                patch.object(ChromeBrowser, 'navigate_to', navigate_to):
            return super().start_tour_with_pointer(*args, **kwargs)

    def _tour(self, name, now=NOW, timezone=TZ, mobile=None, login='admin', path=OVERVIEW,
              touch=True):
        """``touch=False`` with ``mobile``: a window of that size without touch emulation."""
        self._plain_viewport = None
        if mobile and not touch:
            self._plain_viewport = mobile
            self.browser_size = f'{mobile[0]}x{mobile[1]}'
            mobile = None
        if mobile:
            self.touch_enabled = True
            self.browser_size = f'{mobile[0]}x{mobile[1]}'
        self.start_tour_with_pointer(
            path, name, now=now, timezone=timezone, mobile=mobile, login=login)

    def _isolate(self, keep=()):
        """Move the employees that existed before the test (the demo's, when loaded), but the
        ones named in ``keep`` and the administrator's own, to a company that is not one of the
        users' companies: the multi-company rules then hide them from the rows."""
        others = self.env['hr.employee'].with_context(active_test=False).browse(
            self.preexisting).filtered(
            lambda employee: employee.name not in keep and employee.user_id != self.admin)
        if others:
            away = self.env['res.company'].search([('name', '=', AWAY)], limit=1)
            away = away or self.env['res.company'].create({'name': AWAY})
            # the ones that stay lose their manager and coach (the demo's are among those that
            # leave): a form of theirs could not read a record of another company
            kept = self.env['hr.employee'].with_context(active_test=False).browse(
                self.preexisting) - others
            kept.write({'parent_id': False, 'coach_id': False})
            others.write({'company_id': away.id})
        self.env.flush_all()

    def _demo_like(self, jennie=False):
        """The demo employees with their leaves; ``jennie`` adds "Jennie Fletcher" (no leave)."""
        made = fx.make_demo_like(self.env, self.schedule)
        self._isolate(keep=set(fx.DEMO_LEAVES))
        if jennie:
            made['Jennie Fletcher'] = fx._employee(self.env, 'Jennie Fletcher', self.schedule)
        self.env.flush_all()
        return made

    def _leaves_state(self):
        """Every request as the server holds it: nothing may differ after a "nothing" tour."""
        self.env.flush_all()
        self.env.invalidate_all()
        leaves = self.env['hr.leave'].with_context(active_test=False).sudo().search([])
        return sorted(
            (leave.id, str(leave.write_date), leave.state, str(leave.date_from),
             str(leave.date_to), leave.employee_id.id)
            for leave in leaves)

    def _tour_writes_nothing(self, name, **kwargs):
        before = self._leaves_state()
        self._tour(name, **kwargs)
        self.assertEqual(self._leaves_state(), before, 'the tour wrote a request')


@tagged('post_install', '-at_install')
class TestTimeOffLeaveTours(TimeOffToursBase):

    # -- the actions ----------------------------------------------------------------------------

    def test_a05_management_action(self):
        self._isolate()
        self._tour('hhg_a05_management_action', path=MANAGEMENT)

    def test_a08_reload(self):
        self._demo_like()
        self._tour('hhg_a08_reload')

    # -- the card and the gear ------------------------------------------------------------------

    def test_a17_summary_lines(self):
        self._demo_like()
        self._tour('hhg_a17_summary_lines')

    def test_a18_schedule_button(self):
        self._demo_like()
        self._tour('hhg_a18_schedule_button')

    def test_a19_new_version(self):
        self._demo_like()
        self._tour('hhg_a19_new_version')
        versions = self.env['hr.version'].with_context(active_test=False).search([
            ('employee_id.name', '=', 'Anita Oliver'), ('date_version', '=', date(2026, 12, 1))])
        self.assertEqual(len(versions), 1, 'one new version of Anita Oliver from 1 December')

    def test_a22_import_export(self):
        self._demo_like()
        self._tour('hhg_a22_import_export')

    # -- empty views and rows -------------------------------------------------------------------

    def test_a24_empty_view(self):
        self._demo_like()
        self._tour('hhg_a24_empty_view')

    def test_a29_employee_search(self):
        self._demo_like(jennie=True)
        self._tour('hhg_a29_employee_search')

    def test_a43_label_alone(self):
        self._demo_like()
        self._tour('hhg_a43_label_alone')

    # -- ranges and display ---------------------------------------------------------------------

    def test_a48_one_period(self):
        self._demo_like()
        self._tour('hhg_a48_one_period')

    def test_a49_range_around_today(self):
        self._demo_like()
        self._tour('hhg_a49_range_around_today')

    def test_a50_today_and_custom(self):
        self._demo_like()
        self._tour('hhg_a50_today_and_custom')

    def test_a51_folding(self):
        self._demo_like()
        self._tour('hhg_a51_folding')

    def test_a52_total_row(self):
        self._demo_like()
        self._tour('hhg_a52_total_row')

    def test_a53_no_new_button(self):
        self._demo_like()
        self._tour('hhg_a53_no_new_button')

    def test_a54_date_grouping(self):
        self._demo_like()
        self._tour('hhg_a54_date_grouping')

    def test_a55_grouping_removed(self):
        self._demo_like()
        self._tour('hhg_a55_grouping_removed')

    # -- inputs until 002e2 and 002e3 -----------------------------------------------------------

    def test_a64_click_on_a_pill(self):
        self._demo_like()
        self._tour_writes_nothing('hhg_a64_click_on_a_pill')

    def test_a65_double_click_on_a_pill(self):
        self._demo_like()
        self._tour_writes_nothing('hhg_a65_double_click_on_a_pill')

    def test_a66_pointer_over_a_pill(self):
        self._demo_like()
        self._tour_writes_nothing('hhg_a66_pointer_over_a_pill')

    def test_a67_drag_on_a_pill(self):
        self._demo_like()
        self._tour_writes_nothing('hhg_a67_drag_on_a_pill')

    def test_a68_click_on_an_empty_cell(self):
        self._demo_like(jennie=True)
        self._tour_writes_nothing('hhg_a68_click_on_an_empty_cell')

    def test_a69_drag_across_empty_cells(self):
        self._demo_like(jennie=True)
        self._tour_writes_nothing('hhg_a69_drag_across_empty_cells')

    def test_a70_tap_on_a_pill_on_the_phone(self):
        self._demo_like()
        self._tour_writes_nothing('hhg_a70_tap_on_a_pill', mobile=PHONE)

    def test_a71_row_header(self):
        self._demo_like()
        self._tour('hhg_a71_row_header')

    def test_a72_avatar_tooltip(self):
        self._demo_like()
        self._tour('hhg_a72_avatar_tooltip')

    def test_a73_keys(self):
        self._demo_like()
        self._tour_writes_nothing('hhg_a73_keys')

    # -- one-day pills whatever the search holds ------------------------------------------------

    def test_a87_one_day_pills_officer(self):
        self._demo_like()
        fx.make_role_users(self.env, self.schedule)
        self._tour('hhg_a87_officer', login='toff_officer')

    def test_a87_one_day_pills_administrator(self):
        states = self._states_of(self.admin)
        self.assertEqual(states.leave_manager_id, self.admin)
        self._tour('hhg_a87_management', path=MANAGEMENT)

    def test_a87_one_day_pills_approver(self):
        users = fx.make_role_users(self.env, self.schedule)
        states = self._states_of(users['toff_approver'])
        self.assertEqual(states.leave_manager_id, users['toff_approver'])
        self._tour('hhg_a87_management', path=MANAGEMENT, login='toff_approver')

    def _states_of(self, approver):
        """The *states* records, with ``approver`` as the approver of Toff States."""
        states = fx.make_states(self.env, self.schedule)
        states.leave_manager_id = approver
        self._isolate(keep={'Toff States'})
        return states
