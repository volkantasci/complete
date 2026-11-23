# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the leave popover on the phone of slice 002e2 (Task 7; R21, decision D5; A56 to
A58, A85). The window is 390 x 844 with touch emulation (A57: 390 x 801). The harness is that of
``test_tours`` and ``test_report_tours``; the tours are in
``static/tests/tours/time_off_phone_tours.js`` and see what the user sees. Every record is made
here (CI has no demo data)."""
from datetime import date

from odoo.tests import tagged

from . import time_off_fixtures as fx
from .test_report_tours import ReportToursBase
from .test_tours import PHONE

SHORT_PHONE = (390, 801)


@tagged('post_install', '-at_install')
class TestTimeOffPhoneTours(ReportToursBase):

    def _act(self):
        made = fx.make_act_state(self.env, self.schedule)
        self._isolate(keep={fx.ACT_NAME})
        return made

    # -- the sheet (A56, A57, A58) ----------------------------------------------------------------

    def test_a56_phone_sheet(self):
        self._demo_like()
        self._tour_writes_nothing('hhg_a56_phone_sheet', mobile=PHONE)

    def test_a56_phone_sheet_dark(self):
        # the dark scheme needs the theme (as the probes)
        if not self.env['ir.module.module'].sudo().search_count(
                [('name', '=', 'web_enterprise'), ('state', '=', 'installed')]):
            self.skipTest('the theme is not installed')
        self._demo_like()
        self.env['res.users.settings']._find_or_create_for_user(
            self.admin).color_scheme = 'dark'
        self.env.flush_all()
        self._tour_writes_nothing('hhg_a56_phone_sheet_dark', mobile=PHONE)

    def test_a57_phone_short_window(self):
        self._demo_like()
        self._tour_writes_nothing('hhg_a57_phone_short_window', mobile=SHORT_PHONE)

    def test_a58_phone_editable(self):
        made = self._act()
        self._tour_writes_nothing('hhg_a58_phone_editable', mobile=PHONE)
        self.assertFalse(made['confirm'].name, 'the request is unchanged')

    # -- closing and two taps (R21 points 4 and 5) ------------------------------------------------

    def test_a56_phone_closing(self):
        made = self._act()
        self._tour_writes_nothing('hhg_a56_phone_closing', mobile=PHONE)
        self.assertFalse(made['confirm'].name, 'the dropped change was not written')

    def test_a56_phone_two_taps(self):
        self._act()
        self._tour_writes_nothing('hhg_a56_phone_two_taps', mobile=PHONE)

    # -- the first and the second row (A85) -------------------------------------------------------

    def test_a56_phone_back_with_a_dialog(self):
        self._act()
        self._tour_writes_nothing('hhg_a56_phone_back_with_a_dialog', mobile=PHONE)

    def _toff_rows(self):
        sick = fx.find_type(self.env, 'STO')
        for name in ('Toff A', 'Toff B'):
            employee = fx._employee(self.env, name, self.schedule)
            fx.make_waiting(self.env, employee, sick, date(2026, 11, 18))
        self._isolate(keep={'Toff A', 'Toff B'})

    def test_a85_phone_open_search_bar(self):
        self._toff_rows()
        self._tour_writes_nothing('hhg_a85_phone_open_search_bar', mobile=PHONE)

    def test_a85_phone_rows(self):
        self._toff_rows()
        self._tour_writes_nothing('hhg_a85_phone_rows', mobile=PHONE)
