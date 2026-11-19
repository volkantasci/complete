# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
"""Backend scenarios of the contract warning (002d3 R7; A1 last sentence, A20): when the field
``show_contract_warning`` is true, that the form works it out again while it is edited, that every
form that inherits the Community form gets the line, and that it needs no read right on the
contracts."""
from datetime import datetime

from lxml import etree
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from .actions_fixtures import make_role_users
from .hr_rows_fixtures import TZ, make_demo_like, make_whole_day_schedule

FORM = 'hr_attendance.hr_attendance_view_form'
SPEC = {'employee_id': {}, 'check_in': {}, 'check_out': {}, 'show_contract_warning': {}}


@tagged('post_install', '-at_install')
class TestContractWarning(TransactionCase):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.schedule = make_whole_day_schedule(cls.env, 'HRW 40 hours/week')
        cls.like = make_demo_like(cls.env, cls.schedule)
        cls.Attendance = cls.env['hr.attendance']

    def warning(self, employee, check_in, user=None):
        """The field of a form (an attendance not saved) of ``employee`` checked in at ``check_in``
        (``YYYY-MM-DD HH:MM`` UTC, or empty)."""
        model = self.Attendance.with_user(user) if user else self.Attendance
        values = {'employee_id': employee.id}
        values['check_in'] = datetime.strptime(check_in, '%Y-%m-%d %H:%M') if check_in else False
        return model.new(values).show_contract_warning

    def test_a20_when_warning_shows(self):
        keith, abigail, beth = (self.like[f'HRA {name}'] for name in ('Keith', 'Abigail', 'Beth'))
        # Keith's contract ends on 11 November, his zone is Brussels (UTC+1 then)
        self.assertEqual(keith.tz, TZ)
        self.assertFalse(self.warning(keith, '2026-11-11 22:30'), 'still 11 November there')
        self.assertTrue(self.warning(keith, '2026-11-11 23:30'), '12 November there')
        # Abigail's contract runs from 1 October 2026
        self.assertTrue(self.warning(abigail, '2026-09-30 08:00'))
        self.assertFalse(self.warning(abigail, '2026-10-01 08:00'))
        self.assertFalse(self.warning(abigail, '2026-11-11 08:00'))
        self.assertTrue(self.warning(abigail, '2027-01-12 08:00'))
        # east of UTC: 11 November 20:00 UTC is 12 November in Tokyo, the day the contract starts
        tokyo = self.env['hr.employee'].create({
            'name': 'HRW Tokyo', 'tz': 'Asia/Tokyo', 'resource_calendar_id': self.schedule.id,
            'contract_date_start': '2026-11-12', 'date_version': '2026-11-12'})
        self.assertFalse(self.warning(tokyo, '2026-11-11 20:00'))
        self.assertTrue(self.warning(tokyo, '2026-11-11 14:00'), '11 November there')
        # no employee: no warning; Beth has no contract
        self.assertFalse(self.Attendance.new({}).show_contract_warning)
        self.assertTrue(self.warning(beth, '2026-11-11 08:00'))
        # a check-in cleared: the date is today, and Beth has no contract today either
        self.assertTrue(self.warning(beth, False))
        self.assertTrue(self.warning(self.like['HRA Audrey'], False), 'her contract ended in 2025')

    def test_a20_self_user_without_version_rights(self):
        users = make_role_users(self.env, schedule=self.schedule)
        user = users['gantt_self']
        self.assertFalse(user.has_group('hr.group_hr_user'))
        with self.assertRaises(Exception):  # noqa: B017 - the Community's access error
            self.env['hr.version'].with_user(user).search([])
        mine = self.Attendance.search([('employee_id', '=', user.employee_id.id)])
        self.assertEqual(len(mine), 1)
        # saved attendance: the contract runs from 1 January 2026, so no warning
        self.assertFalse(mine.with_user(user).show_contract_warning)
        self.assertFalse(self.warning(user.employee_id, '2026-11-11 08:00', user=user))
        # before the contract: the warning is computed all the same
        self.assertTrue(self.warning(user.employee_id, '2025-11-11 08:00', user=user))

    def test_r7_onchange_recomputes(self):
        abigail, beth = self.like['HRA Abigail'], self.like['HRA Beth']
        values = {
            'employee_id': abigail.id, 'check_in': '2026-11-11 08:00:00',
            'check_out': '2026-11-11 09:00:00', 'show_contract_warning': False,
        }

        def change(employee):
            values['employee_id'] = employee.id
            result = self.Attendance.onchange(values, ['employee_id'], SPEC)
            values['show_contract_warning'] = result['value'].get(
                'show_contract_warning', values['show_contract_warning'])
            return values['show_contract_warning']

        self.assertTrue(change(beth))
        self.assertFalse(change(abigail))
        # the check-in too
        values['check_in'] = '2026-09-30 08:00:00'
        result = self.Attendance.onchange(values, ['check_in'], SPEC)
        self.assertTrue(result['value']['show_contract_warning'])

    def test_r7_every_form_gets_the_line(self):
        """The creation form and the My Attendances form inherit the Community form: the line
        reaches them through the bridge's extension, and leaves with it (A1)."""
        extension = self.env.ref('hr_attendance_gantt.hr_attendance_view_form_contract_warning')
        self.assertEqual(extension.inherit_id, self.env.ref(FORM))

        def lines(view):
            arch = self.Attendance.get_views([(view.id, 'form')])['views']['form']['arch']
            root = etree.fromstring(arch)
            return (
                root.xpath('//div[contains(@class, "o_hag_contract_warning")]'),
                root.xpath('//field[@name="show_contract_warning"]'),
                root.xpath('//field[@widget="correct_employee_button"]'),
            )

        forms = [
            self.env.ref(FORM), self.env.ref('hr_attendance.hr_attendance_create_view_form')]
        for view in forms:
            div, flag, link = lines(view)
            self.assertEqual((len(div), len(flag), len(link)), (1, 1, 1), view.name)
        extension.active = False
        for view in forms:
            self.assertEqual([len(found) for found in lines(view)], [0, 0, 0], view.name)

    def test_r8_link_for_employees_officers_only(self):
        users = make_role_users(self.env, schedule=self.schedule)
        view = self.env.ref('hr_attendance.hr_attendance_create_view_form')

        def links(login):
            model = self.Attendance.with_user(users[login])
            arch = model.get_views([(view.id, 'form')])['views']['form']['arch']
            root = etree.fromstring(arch)
            return (len(root.xpath('//field[@widget="correct_employee_button"]')),
                    len(root.xpath('//field[@name="show_contract_warning"]')))

        self.assertEqual(links('gantt_all'), (0, 1))
        self.assertEqual(links('gantt_self'), (0, 1))
        self.assertEqual(links('gantt_allhr'), (1, 1))
