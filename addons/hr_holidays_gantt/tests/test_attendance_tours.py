# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Live tours of Time Off in the attendance Gantt views (A35, A36, A40) and of the two notes on
002d3 (A79, A80). The harness is that of ``test_tours``; the tours are in
``static/tests/tours/time_off_attendance_tours.js``.

Skipped in a database without the attendance bridge (``hr_attendance_gantt``): the setUpClass
raises ``unittest.SkipTest``, which is how the bridge's tests run with Attendances absent.
"""
import unittest

from odoo.tests import tagged

from . import time_off_fixtures as fx
from .test_tours import PHONE, TimeOffToursBase

ATTENDANCE = '/odoo/action-hr_attendance.hr_attendance_action'


@tagged('post_install', '-at_install')
class TestAttendanceTours(TimeOffToursBase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        module = cls.env['ir.module.module'].sudo().search(
            [('name', '=', 'hr_attendance_gantt'), ('state', '=', 'installed')])
        if not module:
            raise unittest.SkipTest('hr_attendance_gantt is not installed')

    def setUp(self):
        super().setUp()
        self.admin.write({
            'group_ids': [(4, self.env.ref('hr_attendance.group_hr_attendance_manager').id)]})

    def _no_attendance(self, employees):
        """The employees have no attendance (the demo data's lie around the day it was loaded)."""
        self.env['hr.attendance'].sudo().search(
            [('employee_id', 'in', [employee.id for employee in employees])]).unlink()
        self.env.flush_all()

    def _attendances_of(self, name):
        return self.env['hr.attendance'].sudo().search_count([('employee_id.name', '=', name)])

    def _flexible(self):
        made = fx.make_flexible(self.env, self.schedule)
        self._isolate(keep={'Toff Flexible', 'Toff Fixed'})
        self._no_attendance([made['Toff Flexible'], made['Toff Fixed']])

    def _demo(self):
        world = fx.make_demo_world(self.env, self.schedule)
        self._isolate(keep=set(fx.DEMO_EMPLOYEES))
        self._no_attendance(world.values())
        return world

    def test_a35_attendance_flexible(self):
        self._flexible()
        self._tour('hhg_a35_attendance_flexible', path=ATTENDANCE)

    def test_a36_attendance_expected(self):
        self._flexible()
        self._tour('hhg_a36_attendance_expected', path=ATTENDANCE)

    def test_a40_attendance_leaves(self):
        self._demo()
        self._tour('hhg_a40_attendance_leaves', path=ATTENDANCE)

    def test_a79_first_escape(self):
        self._demo()
        self._tour('hhg_a79_first_escape', path=ATTENDANCE)
        self.assertEqual(self._attendances_of('Abigail Peterson'), 0, 'nothing was saved')

    def test_a80_helper_phone(self):
        self._demo()
        self._tour('hhg_a80_helper_phone', path=ATTENDANCE, mobile=PHONE, touch=False)
