# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of the ``ui`` scenarios of slice 002d3 (the actions, filters, warning, clicks and
drags of the attendance Gantt views). The clock, the zone, the window and the real mouse are the
ones of 002d2's tours (``HrToursBase``); every record and user is created here (CI has no demo
data), the demo's employees are moved out of the views by ``HrToursBase.setUp``. The tours are in
``static/tests/tours/actions_tours.js``."""
from odoo.tests import tagged

from .actions_fixtures import make_role_users
from .test_hr_rows_tours import HrToursBase

MY_ACTION = '/odoo/action-hr_attendance.hr_attendance_my_action'
PHONE = (390, 844)


@tagged('post_install', '-at_install')
class TestActionsTours(HrToursBase):

    def setUp(self):
        super().setUp()
        self.users = {}

    def _admin_employee(self):
        """The administrator's own employee, "Mitchell Admin" (a database without demo data has
        none of that name; the demo's was moved away with the others)."""
        return self._employee('Mitchell Admin', user_id=self.admin.id)

    def _role_users(self):
        self.users = make_role_users(self.env, schedule=self.schedule)
        return self.users

    # -- the actions ----------------------------------------------------------------------------

    def test_a2_management_search(self):
        for name in ('HRA Search A', 'HRA Search B'):
            self._employee(name, attendances=[('2026-11-11 07:00:00', '2026-11-11 09:00:00')])
        self._tour('hr_actions_a2_management_search')

    def test_a3_my_calendar(self):
        self._admin_employee()
        self._tour('hr_actions_a3_my_calendar', path=MY_ACTION)

    def test_a3_my_calendar_phone(self):
        self._admin_employee()
        self._tour('hr_actions_a3_my_calendar_phone', path=MY_ACTION, mobile=PHONE)

    def test_a4_my_gantt(self):
        self._admin_employee()
        self._tour('hr_actions_a4_my_gantt', path=MY_ACTION)

    def test_a4_my_gantt_phone(self):
        self._admin_employee()
        self._tour('hr_actions_a4_my_gantt_phone', path=MY_ACTION, mobile=PHONE)

    def test_a5_self(self):
        self._role_users()
        self._tour('hr_actions_a5_self', path=MY_ACTION, login='gantt_self')

    def test_a5_self_without_employee(self):
        self.env['res.users'].with_context(no_reset_password=True).create({
            'name': 'Gantt Lonely', 'login': 'gantt_lonely', 'password': 'gantt_lonely',
            'tz': 'Europe/Brussels', 'lang': 'en_US',
            'group_ids': [(6, 0, [
                self.env.ref('base.group_user').id,
                self.env.ref('hr_attendance.group_hr_attendance_own').id])],
        })
        self._tour('hr_actions_a5_without_employee', path=MY_ACTION, login='gantt_lonely')

    def test_a79_self_rules(self):
        self._role_users()
        self._tour('hr_actions_a79_self_rules', path=MY_ACTION, login='gantt_self')
