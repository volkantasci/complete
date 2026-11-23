# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the leave popover of slice 002e2 (Task 5): opening, title, lines by unit, focus,
closing, Escape, Expand and the reload. The harness is that of ``test_tours`` (browser clock,
zone, real pointer, isolation of the employees); the tours are in
``static/tests/tours/time_off_popover_tours.js``. Every record is made here (CI has no demo
data), by the name of the prepared states of ``acceptance.md``."""
from datetime import date

from odoo.tests import tagged

from . import time_off_fixtures as fx
from .test_report_tours import ReportToursBase

ALLOC_NAME = 'Toff Alloc'


@tagged('post_install', '-at_install')
class TestTimeOffPopoverTours(ReportToursBase):

    def _act(self):
        made = fx.make_act_state(self.env, self.schedule)
        self._isolate(keep={fx.ACT_NAME})
        return made

    def _leaves_of(self, name):
        self.env.flush_all()
        return self.env['hr.leave'].with_context(active_test=False).sudo().search(
            [('employee_id.name', '=', name)])

    # -- the title and the lines ----------------------------------------------------------------

    def test_a11_title_act(self):
        self._act()
        self._tour_writes_nothing('hhg_a11_title_act')

    def test_a11_titles_units(self):
        fx.make_units_state(self.env, self.schedule)
        self._isolate(keep={fx.ACT_NAME})
        self._tour_writes_nothing('hhg_a11_titles_units')

    def test_a12_double_click_dialog(self):
        self._act()
        self._tour_writes_nothing('hhg_a12_double_click_dialog')

    def test_a18_half_day_several_days(self):
        fx.make_units_state(self.env, self.schedule)
        self._isolate(keep={fx.ACT_NAME})
        self._tour_writes_nothing('hhg_a18_half_day_several_days')

    def _days_request(self):
        """The *units* records and a request of "Toff Days" (day unit, no code) on Friday 20."""
        fx.make_units_state(self.env, self.schedule)
        employee = self.env['hr.employee'].search([('name', '=', fx.ACT_NAME)], limit=1)
        fx.make_waiting(self.env, employee, fx.make_days_type(self.env), date(2026, 11, 20))
        self._isolate(keep={fx.ACT_NAME})

    def test_a19_hours_and_days(self):
        self._days_request()
        self._tour_writes_nothing('hhg_a19_hours_and_days')

    def test_a20_type_without_code(self):
        self._days_request()
        self._tour_writes_nothing('hhg_a20_type_without_code')

    def test_a21_allocation_warning(self):
        employee = fx._employee(self.env, ALLOC_NAME, self.schedule)
        cto = fx.find_type(self.env, 'CTO')
        fx._allocate(self.env, employee, cto, 2)
        leave = fx.make_waiting(self.env, employee, cto, date(2026, 11, 16), date(2026, 11, 17))
        # the balance no longer covers the request: one day left of the two
        allocation = self.env['hr.leave.allocation'].search(
            [('employee_id', '=', employee.id), ('work_entry_type_id', '=', cto.id)])
        allocation.with_context(allocation_skip_state_check=True).write({'number_of_days': 1})
        self.env.flush_all()
        self.assertEqual(leave.state, 'confirm')
        self._isolate(keep={ALLOC_NAME})
        self._tour_writes_nothing('hhg_a21_allocation_warning')

    def test_a22_focus(self):
        self._act()
        self._tour_writes_nothing('hhg_a22_focus')

    # -- Expand ----------------------------------------------------------------------------------

    def test_a48_expand_breadcrumb(self):
        self._act()
        self._tour_writes_nothing('hhg_a48_expand_breadcrumb')

    def test_a49_back_after_expand(self):
        self._act()
        self._tour_writes_nothing('hhg_a49_back_after_expand')

    def test_a83_report_expand(self):
        self._world(demo=False)
        fx.make_emp_state(self.env)
        self._only('toff_emp')
        self._tour_writes_nothing('hhg_a83_report_expand', login='toff_emp')

    def test_a93_reload_after_expand(self):
        self._act()
        self._tour_writes_nothing('hhg_a93_reload_after_expand')

    # -- closing and Escape ----------------------------------------------------------------------

    def test_a50_closing(self):
        self._act()
        self._tour_writes_nothing('hhg_a50_closing')

    def test_a51_escape_in_the_field(self):
        made = self._act()
        self._tour_writes_nothing('hhg_a51_escape_in_the_field')
        self.assertFalse(made['confirm'].name, 'the description is still empty')

    def test_a51_escape_after_leaving_the_field(self):
        made = self._act()
        self._tour_writes_nothing('hhg_a51_escape_after_leaving_the_field')
        self.assertFalse(made['confirm'].name, 'the description is still empty')

    def test_a55_reload(self):
        made = self._act()
        self._tour_writes_nothing('hhg_a55_reload')
        self.assertFalse(made['confirm'].name, 'the description is still empty')

    def test_a69_click_on_an_end(self):
        self._act()
        self._tour_writes_nothing('hhg_a69_click_on_an_end')
