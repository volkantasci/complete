# Copyright 2026 Complete contributors
# SPDX-License-Identifier: AGPL-3.0-only
from unittest.mock import patch

from odoo.exceptions import UserError
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
        cls.Staff = cls.env['hr.employee']

    def ids(self, result):
        return [group['employee_id'][0] for group in result['groups']]

    def test_a24_rows_for_every_employee(self):
        result = self.get_data(*DAY, user_domain=[], unavailability_fields=['employee_id'],
                               progress_bar_fields=['employee_id'])
        first_page = self.Staff.search([], order='name, id', limit=20)
        self.assertEqual(self.ids(result), first_page.ids)
        self.assertEqual(result['length'], self.Staff.search_count([]))
        self.assertIn('employee_id', result['unavailabilities'])
        self.assertIn('employee_id', result['progress_bars'])
        # the records listed in the groups are exactly the records returned
        listed = {rid for g in result['groups'] for rid in g['__record_ids']}
        self.assertEqual(listed, {r['id'] for r in result['records']})
        rest = self.get_data(*DAY, user_domain=[], offset=20)
        self.assertEqual(self.ids(rest), self.Staff.search([], order='name, id', offset=20).ids)
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
        # the list of R19 is given on this path too (Gantt Open has a contract)
        self.assertEqual(result['hag_without_contract'], [])

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
        edge = self.Staff.create({
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
        self.env.flush_all()
        result = self.get_data(*DAY, user_domain=[], model=self.Attendance.with_user(officer))
        self.assertEqual(self.row_names(result), ['Gantt Exact'])
        self.assertEqual(result['hag_without_contract'], [])

    def test_r19_no_list_with_two_groupings(self):
        result = self.get_data(*DAY, groupby=('employee_id', 'department_id'))
        self.assertNotIn('hag_without_contract', result)
        result = self.get_data(*DAY, groupby=('department_id',))
        self.assertNotIn('hag_without_contract', result)

    def test_a25_a_call_without_a_period_fails(self):
        for dates in ({'start_date': None}, {'stop_date': None}):
            for groupby in (('employee_id',), ('department_id',)):
                with self.subTest(dates=dates, groupby=groupby), self.assertRaises(UserError):
                    self.get_data(*DAY, groupby=groupby, **dates)

    def test_a66_conversion_of_the_search_to_employees(self):
        found = self.like['HRA Anita'].name
        wanted = ('employee_id.name', 'ilike', 'Anita')
        no_check_out = ('check_out', '=', False)
        # "name contains Anita or no check-out": the dropped part is false
        rows = self.get_data(*DAY, extra=['|', wanted, no_check_out])
        self.assertEqual(self.row_names(rows), [found])
        # "not (name contains Anita and no check-out)": not Anita (the dropped part is false)
        everyone = self.get_data(*DAY)
        others = [name for name in self.row_names(everyone) if name != found]
        rows = self.get_data(*DAY, extra=['!', '&', wanted, no_check_out])
        self.assertEqual(self.row_names(rows), others)
        # "not (name contains Anita or no check-out)": not Anita (the dropped part is true)
        rows = self.get_data(*DAY, extra=['!', '|', wanted, no_check_out])
        self.assertEqual(self.row_names(rows), others)
        self.assertEqual(len(others), len(self.row_names(everyone)) - 1)
        # a field reached through the relation
        department = self.env['hr.department'].create({'name': 'HRA Research'})
        (self.like['HRA Beth'] | self.like['HRA Jennie']).department_id = department
        rows = self.get_data(*DAY, extra=[('employee_id.department_id.name', 'ilike', 'Research')])
        self.assertEqual(self.row_names(rows), ['HRA Beth', 'HRA Jennie'])

    def test_a52_a_direct_call_without_dates_fails_with_a_user_error(self):
        with self.assertRaises(UserError):
            self.Attendance._hag_without_contract([self.like['HRA Anita'].id], None, None)

    def test_a66_the_period_of_the_future_keeps_every_row(self):
        # nothing of R13's period condition is about the employee: it must not empty the rows
        # (A54, M68: the future week of 13 to 19 December shows twenty rows)
        future = self.get_data('2026-11-11 23:00', '2026-11-12 23:00', DAY[2])
        self.assertEqual(self.row_names(future), self.row_names(self.get_data(*DAY)))

    def test_a52_the_contract_overlap_is_read_on_two_dates(self):
        # Wednesday 11 November in Brussels: a contract starting before 12 November and
        # ending on or after 11 November overlaps; the day after and the day before do not
        cases = (
            ('2026-11-11', None, True), ('2026-11-12', None, False),
            ('2026-01-01', '2026-11-11', True), ('2026-01-01', '2026-11-10', False),
        )
        for index, (start, end, covered) in enumerate(cases):
            employee = self.Staff.create({
                'name': f'HRA Edge {index}', 'tz': 'Europe/Brussels',
                'resource_calendar_id': self.schedule.id,
                'contract_date_start': start, 'contract_date_end': end})
            result = self.get_data(*DAY, user_domain=[('employee_id', '=', employee.id)])
            self.assertEqual(
                result['hag_without_contract'], [] if covered else [employee.id], (start, end))

    def test_r22_team_officer_rows(self):
        officer = self.env['res.users'].create({
            'name': 'HRA Team Officer', 'login': 'hra_team_officer',
            'group_ids': [(6, 0, [
                self.env.ref('base.group_user').id,
                self.env.ref('hr_attendance.group_hr_attendance_officer').id])],
        })
        own = self.Staff.create({'name': 'HRA Officer Self', 'user_id': officer.id})
        managed = self.Staff.create([
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
        self.env.flush_all()  # the public employee is a view: it reads the table
        searched = []
        original = type(self.Staff)._search

        def spy(model, *args, **kwargs):
            searched.append((model.env.uid, model.env.su))
            return original(model, *args, **kwargs)

        with patch.object(type(self.Staff), '_search', spy):
            result = self.get_data(*DAY, user_domain=[], model=self.Attendance.with_user(user))
        self.assertEqual(self.row_names(result), ['Gantt Exact'])
        self.assertEqual(result['length'], 1)
        # the rows are searched with the user's own rights (R9 point 2), not the system's
        self.assertIn((user.id, False), searched)
        self.assertFalse([found for found in searched if found[1]])
