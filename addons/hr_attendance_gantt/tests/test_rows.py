# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from odoo.tests import tagged
from odoo.tests.common import TransactionCase

from .hr_rows_fixtures import HrRowsCase

DAY = ('2026-11-10 23:00', '2026-11-11 23:00', '2026-11-11 10:00')  # Wednesday 11 November
WEEK = ('2026-11-07 23:00', '2026-11-14 23:00', '2026-11-11 10:00')  # Sunday 8 to Saturday 14
LIKE_ONLY = [('employee_id.name', '=like', 'HRA %')]


@tagged('post_install', '-at_install')
class TestRows(HrRowsCase, TransactionCase):
    """R14 rows, R19 list of employees without a contract, R22 rows by read rights."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        cls.make_world()
        cls.Employee = cls.env['hr.employee']

    def ids(self, result):
        return [group['employee_id'][0] for group in result['groups']]

    def test_a24_rows_for_every_employee(self):
        result = self.get_data(*DAY, user_domain=[], unavailability_fields=['employee_id'],
                               progress_bar_fields=['employee_id'])
        first_page = self.Employee.search([], order='name, id', limit=20)
        self.assertEqual(self.ids(result), first_page.ids)
        self.assertEqual(result['length'], self.Employee.search_count([]))
        self.assertIn('employee_id', result['unavailabilities'])
        self.assertIn('employee_id', result['progress_bars'])
        # a row without attendance in the period is a group with no record
        by_name = {g['employee_id'][1]: g['__record_ids'] for g in result['groups']}
        self.assertTrue(all(isinstance(v, list) for v in by_name.values()))
        rest = self.get_data(*DAY, user_domain=[], offset=20)
        self.assertEqual(self.ids(rest), self.Employee.search([], order='name, id', offset=20).ids)
        self.assertEqual(rest['length'], result['length'])

    def test_a24_every_matching_employee_has_a_row_without_attendance(self):
        result = self.get_data(*DAY)
        names = self.row_names(result)
        self.assertEqual(names, sorted(names))
        self.assertIn('HRA Beth', names)
        self.assertIn('Gantt Hourly', names)
        rows = {g['employee_id'][1]: g['__record_ids'] for g in result['groups']}
        self.assertEqual(rows['HRA Beth'], [])
        self.assertEqual(len(rows['HRA Anita']), 2)

    def test_r14_attendance_condition_keeps_002a_rows(self):
        search = [('check_out', '=', False)]
        result = self.get_data(*DAY, user_domain=search, extra=[
            '|', ('employee_id.name', '=like', 'HRA %'), ('employee_id.name', '=like', 'Gantt %')])
        self.assertEqual(self.row_names(result), ['Gantt Open'])
        self.assertTrue(all(g['__record_ids'] for g in result['groups']))

    def test_r14_department_and_my_team_concern_employee(self):
        department = self.env['hr.department'].create({'name': 'HRA Department'})
        boss = self.like['HRA Keith']
        (self.like['HRA Abigail'] | self.like['HRA Beth']).department_id = department
        self.like['HRA Anita'].parent_id = boss
        self.like['HRA Beth'].parent_id = boss
        rows = self.get_data(*DAY, user_domain=[('department_id', 'child_of', [department.id])])
        self.assertEqual(self.row_names(rows), ['HRA Abigail', 'HRA Beth'])
        self.assertEqual(rows['groups'][1]['__record_ids'], [])
        rows = self.get_data(*DAY, user_domain=[('manager_id', '=', boss.id)])
        self.assertEqual(self.row_names(rows), ['HRA Anita', 'HRA Beth'])
        rows = self.get_data(*DAY, user_domain=[('employee_id.parent_id', '=', boss.id)])
        self.assertEqual(self.row_names(rows), ['HRA Anita', 'HRA Beth'])
        rows = self.get_data(*DAY, user_domain=[('employee_id', 'ilike', 'HRA Je')])
        self.assertEqual(self.row_names(rows), ['HRA Jennie'])

    def test_r14_archived_only_when_asked(self):
        self.like['HRA Beth'].active = False
        self.assertNotIn('HRA Beth', self.row_names(self.get_data(*DAY, user_domain=LIKE_ONLY)))
        archived = self.get_data(*DAY, user_domain=LIKE_ONLY + [('employee_id.active', '=', False)])
        self.assertEqual(self.row_names(archived), ['HRA Beth'])
        self.assertEqual(archived['length'], 1)

    def test_r14_offset_past_end_returns_empty_groups(self):
        result = self.get_data(*DAY, user_domain=LIKE_ONLY, offset=20)
        self.assertEqual(result['groups'], [])
        self.assertEqual(result['length'], len(self.like))
        self.assertNotIn('hag_without_contract', result)

    def test_a52_without_contract_list(self):
        result = self.get_data(*DAY)
        self.assertEqual(
            sorted(result['hag_without_contract']),
            sorted(self.like[n].id for n in ('HRA Audrey', 'HRA Beth')))
        # an employee whose contract ends inside the period is not listed (Keith ends 11 Nov)
        week = self.get_data(*WEEK)
        self.assertNotIn(self.like['HRA Keith'].id, week['hag_without_contract'])
        later = self.get_data('2026-11-11 23:00', '2026-11-12 23:00', DAY[2])
        self.assertIn(self.like['HRA Keith'].id, later['hag_without_contract'])
        self.assertNotIn(self.like['HRA Anita'].id, later['hag_without_contract'])
        # only the employees of the page are listed
        narrow = self.get_data(*DAY, user_domain=[('employee_id.name', '=', 'HRA Audrey')])
        self.assertEqual(narrow['hag_without_contract'], [self.like['HRA Audrey'].id])

    def test_a52_days_are_read_in_the_user_time_zone(self):
        edge = self.Employee.create({
            'name': 'HRA Edge', 'tz': 'Europe/Brussels', 'resource_calendar_id': self.schedule.id,
            'contract_date_start': '2026-01-01', 'contract_date_end': '2026-11-10',
        })
        user_domain = [('employee_id', '=', edge.id)]
        # the period 10 Nov 23:00 UTC onwards is 11 November in Brussels: the contract has ended
        brussels = self.Attendance.with_context(tz='Europe/Brussels')
        result = self.get_data(*DAY, user_domain=user_domain, model=brussels)
        self.assertEqual(result['hag_without_contract'], [edge.id])
        # and still 10 November in UTC, a day of the contract
        utc_user = self.Attendance.with_context(tz='UTC')
        result = self.get_data(*DAY, user_domain=user_domain, model=utc_user)
        self.assertEqual(result['hag_without_contract'], [])

    def test_a52_versions_are_read_with_system_rights(self):
        officer = self.env['res.users'].create({
            'name': 'HRA Reader', 'login': 'hra_reader',
            'group_ids': [(6, 0, [
                self.env.ref('base.group_user').id,
                self.env.ref('hr_attendance.group_hr_attendance_own').id])],
        })
        self.prepared['Gantt Exact'].user_id = officer
        result = self.get_data(*DAY, user_domain=[], model=self.Attendance.with_user(officer))
        self.assertEqual(self.row_names(result), ['Gantt Exact'])
        self.assertEqual(result['hag_without_contract'], [])

    def test_r19_no_list_with_two_groupings(self):
        result = self.get_data(*DAY, groupby=('employee_id', 'department_id'))
        self.assertNotIn('hag_without_contract', result)
        result = self.get_data(*DAY, groupby=('department_id',))
        self.assertNotIn('hag_without_contract', result)

    def test_r22_team_officer_rows(self):
        officer = self.env['res.users'].create({
            'name': 'HRA Team Officer', 'login': 'hra_team_officer',
            'group_ids': [(6, 0, [
                self.env.ref('base.group_user').id,
                self.env.ref('hr_attendance.group_hr_attendance_officer').id])],
        })
        own = self.Employee.create({'name': 'HRA Officer Self', 'user_id': officer.id})
        managed = self.Employee.create([
            {'name': f'HRA Managed {n}', 'attendance_manager_id': officer.id} for n in '1234'])
        result = self.get_data(*DAY, user_domain=[], model=self.Attendance.with_user(officer))
        self.assertEqual(
            sorted(self.ids(result)), sorted((own | managed).ids))
        self.assertEqual(len(result['groups']), 5)
        self.assertEqual(result['length'], 5)

    def test_r22_own_only_user_rows(self):
        user = self.env['res.users'].create({
            'name': 'HRA Own Only', 'login': 'hra_own_only',
            'group_ids': [(6, 0, [self.env.ref('hr_attendance.group_hr_attendance_own').id])],
        })
        self.prepared['Gantt Exact'].user_id = user
        result = self.get_data(*DAY, user_domain=[], model=self.Attendance.with_user(user))
        self.assertEqual(self.row_names(result), ['Gantt Exact'])
        self.assertEqual(result['length'], 1)
